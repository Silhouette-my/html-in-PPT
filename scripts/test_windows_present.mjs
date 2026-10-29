// Runs the real CMD bootstrap on Windows, with Node/npm/Python absent from PATH.
// On other hosts, --powershell <pwsh> exercises the embedded payload only.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const powershell = process.argv[2] === '--powershell' ? process.argv[3] : undefined;
if (process.platform !== 'win32' && !powershell) {
  console.log('SKIP: present.cmd integration requires Windows (or --powershell for the payload only).');
  process.exit(0);
}
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'present-cmd-'));
const launcherDir = path.join(temp, "启动器 & (test) ! ' %");
await fs.mkdir(launcherDir);
const launcher = path.join(launcherDir, 'present.cmd');
await fs.copyFile(fileURLToPath(new URL('./present.cmd', import.meta.url)), launcher);
assert.doesNotMatch(await fs.readFile(launcher, 'utf8'), /<!doctype|<!-- === HIT HTML|HIT-GZIP/i, 'CMD must not embed a presentation');
const source = path.join(temp, "文稿 & (test) ! ' # % [1].html");
const html = Buffer.from('<!doctype html><meta charset="utf-8"><title>双屏测试</title><p>你好 🌏</p>');
await fs.writeFile(source, html);
await fs.writeFile(path.join(temp, 'secret.txt'), 'must never be served');
const children = new Set();
const sockets = new Set();
const env = { ...process.env };
env.PRESENT_CMD_PROFILE_ROOT = path.join(temp, 'browser profiles');
if (process.platform === 'win32') {
  const systemRoot = process.env.SystemRoot;
  // Use the absolute Node executable for this test, but give the launcher only Windows tools.
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key];
  env.PATH = `${systemRoot}\\System32;${systemRoot}`;
  for (const tool of ['node', 'npm', 'python']) {
    assert.notEqual(spawnSync('where.exe', [tool], { env, cwd: launcherDir }).status, 0, `${tool} must be absent from launcher PATH`);
  }
}
function launch(args, { keepInput = false, cwd = launcherDir } = {}) {
  const childEnv = { ...env, PRESENT_CMD_SELF: launcher, PRESENT_CMD_ARG_COUNT: String(args.length), PRESENT_TEST_CMD: launcher };
  args.forEach((value, index) => {
    childEnv[`PRESENT_TEST_ARG_${index}`] = value;
    childEnv[`PRESENT_CMD_ARG_${index}`] = value;
  });
  const expansion = args.map((_, index) => `"%PRESENT_TEST_ARG_${index}%"`).join(' ');
  const command = powershell || process.env.ComSpec;
  const argv = powershell
    ? ['-NoLogo', '-NoProfile', '-Command', "$ErrorActionPreference='Stop'; try { $s=[IO.File]::ReadAllText($env:PRESENT_CMD_SELF); $m='#'+' POWERSHELL_PAYLOAD'; & ([scriptblock]::Create($s.Substring($s.IndexOf($m)+$m.Length))) } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }"]
    : ['/d', '/s', '/c', `""%PRESENT_TEST_CMD%" ${expansion}"`];
  const child = spawn(command, argv, { env: childEnv, cwd, windowsHide: true, windowsVerbatimArguments: !powershell });
  const run = { child, output: '', error: undefined };
  run.closed = new Promise(resolve => { child.once('error', error => { run.error = error; resolve({ code: null }); }); child.once('close', code => resolve({ code })); });
  child.stdout.on('data', bytes => { run.output += bytes; });
  child.stderr.on('data', bytes => { run.output += bytes; });
  if (!keepInput) child.stdin.end(); // Error-path PAUSE must finish without a human in CI.
  children.add(run);
  return run;
}
async function until(check, description, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`Timed out: ${description}`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}
async function finished(run) {
  const result = await Promise.race([run.closed, new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error(`Launcher did not exit: ${run.output}`)), 15000);
    timer.unref();
  })]);
  if (run.error) throw run.error;
  children.delete(run);
  return result;
}
async function stop(run) {
  if (run.child.exitCode === null && run.child.stdin.writable) {
    run.child.stdin.end('q');
    await Promise.race([run.closed, new Promise(resolve => setTimeout(resolve, 5000))]);
  }
  if (run.child.exitCode === null) {
    if (process.platform === 'win32') {
      const killer = spawn('taskkill.exe', ['/PID', String(run.child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      await once(killer, 'close');
    } else run.child.kill('SIGTERM');
  }
  return finished(run);
}
async function rawRequest(port, request) {
  const socket = net.createConnection({ host: '127.0.0.1', port });
  sockets.add(socket);
  socket.setTimeout(10000, () => socket.destroy(new Error('Socket timed out')));
  const chunks = [];
  socket.on('data', bytes => chunks.push(bytes));
  await once(socket, 'connect');
  socket.write(request);
  await once(socket, 'end');
  socket.destroy(); sockets.delete(socket);
  return Buffer.concat(chunks).toString();
}
async function fakeBrowser() {
  if (process.platform !== 'win32') {
    const file = path.join(temp, 'fake-browser.sh');
    await fs.writeFile(file, '#!/bin/sh\nfor arg do\n case "$arg" in --user-data-dir=*) profile=${arg#--user-data-dir=};; esac\ndone\nprintf "%s\\n" "$@" > "$profile/fake-arguments.txt"\nexec /bin/sleep 120\n', { mode: 0o755 });
    return file;
  }
  const file = path.join(temp, 'fake-browser.exe'), source = path.join(temp, 'fake-browser.cs');
  await fs.writeFile(source, `using System; using System.IO; using System.Threading;
public class FakeBrowser { public static void Main(string[] args) {
  string profile = null;
  foreach (string arg in args) if (arg.StartsWith("--user-data-dir=")) profile = arg.Substring(16);
  File.WriteAllLines(Path.Combine(profile, "fake-arguments.txt"), args);
  Thread.Sleep(120000);
}}`);
  const compiler = spawn(path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
    ['-NoLogo', '-NoProfile', '-Command', 'Add-Type -TypeDefinition ([IO.File]::ReadAllText($env:PRESENT_TEST_SOURCE)) -OutputAssembly $env:PRESENT_TEST_EXE -OutputType ConsoleApplication'],
    { env: { ...env, PRESENT_TEST_SOURCE: source, PRESENT_TEST_EXE: file }, windowsHide: true });
  let errors = ''; compiler.stderr.on('data', bytes => { errors += bytes; });
  assert.equal((await once(compiler, 'close'))[0], 0, errors);
  return file;
}
async function waitForBrowser(run) {
  await until(() => /Browser profile: (.+)/.test(run.output) || run.child.exitCode !== null, 'owned browser startup');
  const profile = run.output.match(/Browser profile: ([^\r\n]+)/)?.[1];
  assert.ok(profile, run.output);
  await until(() => existsSync(path.join(profile, 'fake-arguments.txt')), 'fake browser argument capture');
  return profile;
}
async function checkWindowBounds() {
  const text = await fs.readFile(launcher, 'utf8');
  const native = text.match(/function Initialize-PresentationWindow \{\r?\n    Add-Type -TypeDefinition @'\r?\n([\s\S]*?)\r?\n'@/);
  assert.ok(native, 'standalone launcher contains its native placement helper');
  const file = path.join(temp, 'window-placement.cs'); await fs.writeFile(file, native[1]);
  const cases = [[0,0,1920,1040],[1920,0,2560,1400],[-1920,-120,1920,1040],[0,40,1080,1880],
    [0,0,3440,1400],[0,0,3840,2080],[40,0,1280,720],[0,0,16,9],[0,0,0,0]];
  const child = spawn(powershell || path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
    ['-NoLogo','-NoProfile','-Command', "$ErrorActionPreference='Stop'; Add-Type -TypeDefinition ([IO.File]::ReadAllText($env:PRESENT_TEST_WINDOW_SOURCE)); $results=@(foreach($work in (ConvertFrom-Json $env:PRESENT_TEST_WINDOW_CASES)) { [pscustomobject]@{work=$work; bounds=[PresentLaunchWindow]::Fit16By9([int[]]$work); terminal=[PresentLaunchWindow]::FitConsole([int[]]$work,1200,900)} }); ConvertTo-Json -InputObject $results -Depth 5 -Compress"],
    { env: { ...env, PRESENT_TEST_WINDOW_SOURCE: file, PRESENT_TEST_WINDOW_CASES: JSON.stringify(cases) }, windowsHide: true });
  let output = '', errors = '';child.stdout.on('data',bytes=>{output+=bytes;});child.stderr.on('data',bytes=>{errors+=bytes;});
  assert.equal((await once(child,'close'))[0],0,errors);
  const results = JSON.parse(output.replace(/^\uFEFF/,''));
  assert.equal(results.length,cases.length);
  for (const {work,bounds,terminal} of results) {
    if (!work[2]) { assert.equal(bounds,null); assert.equal(terminal,null); continue; }
    const [left,top,width,height]=bounds;
    assert.equal(width*9,height*16,'native initial window must be exactly 16:9');
    assert.ok(left>=work[0]&&top>=work[1]&&left+width<=work[0]+work[2]&&top+height<=work[1]+work[3],'fit within the selected monitor work area');
    assert.ok(Math.abs((left-work[0])*2+width-work[2])<=1&&Math.abs((top-work[1])*2+height-work[3])<=1,'center within that monitor, including negative coordinates');
    if (work[2]>64&&work[3]>64) assert.ok(width+16>work[2]-48||height+9>work[3]-48,'use the largest fitting 16:9 window with margins');
    const [terminalLeft,terminalTop,terminalWidth,terminalHeight]=terminal;
    assert.equal(terminalWidth,Math.min(1200,work[2]));assert.equal(terminalHeight,Math.min(900,work[3]),'keep terminal dimensions unless the launch screen is smaller');
    assert.ok(terminalLeft>=work[0]&&terminalTop>=work[1]&&terminalLeft+terminalWidth<=work[0]+work[2]&&terminalTop+terminalHeight<=work[1]+work[3]);
    assert.ok(Math.abs((terminalLeft-work[0])*2+terminalWidth-work[2])<=1&&Math.abs((terminalTop-work[1])*2+terminalHeight-work[3])<=1,'center the terminal on the same launch monitor');
  }
}
async function checkTerminalRetry() {
  const helper=(await fs.readFile(launcher,'utf8')).match(/function Update-TerminalWindow \{\r?\n[\s\S]*?\r?\n\}/)?.[0];
  assert.ok(helper);const file=path.join(temp,'terminal-placement.ps1');await fs.writeFile(file,helper);
  const command="$ErrorActionPreference='Stop'; Add-Type 'public static class PresentLaunchWindow { public static int Calls; public static int[] PlaceConsole(int[] work) { Calls++; return Calls == 1 ? null : work; } }'; . ([scriptblock]::Create([IO.File]::ReadAllText($env:PRESENT_TEST_TERMINAL_HELPER))); $terminalPlacement=@{WorkArea=@(-1920,40,1920,1040);Until=[DateTime]::UtcNow.AddSeconds(3);Done=$false}; Update-TerminalWindow 6>$null; $first=$terminalPlacement.Done; Update-TerminalWindow 6>$null; $second=$terminalPlacement.Done; Update-TerminalWindow 6>$null; $calls=[PresentLaunchWindow]::Calls; $terminalPlacement=@{WorkArea=@(0,0,1920,1040);Until=[DateTime]::UtcNow.AddSeconds(-1);Done=$false}; Update-TerminalWindow 6>$null; @{first=$first;second=$second;calls=$calls;finalCalls=[PresentLaunchWindow]::Calls;expired=($null -eq $terminalPlacement.Until)} | ConvertTo-Json -Compress";
  const child=spawn(powershell||path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoLogo','-NoProfile','-Command',command],{env:{...env,PRESENT_TEST_TERMINAL_HELPER:file},windowsHide:true});
  let output='',errors='';child.stdout.on('data',bytes=>{output+=bytes;});child.stderr.on('data',bytes=>{errors+=bytes;});
  assert.equal((await once(child,'close'))[0],0,errors);
  assert.deepEqual(JSON.parse(output.replace(/^\uFEFF/,'')),{first:false,second:true,calls:2,finalCalls:2,expired:true},'retry a late terminal host, then stop after success or timeout');
}
try {
  await checkWindowBounds();
  await checkTerminalRetry();
  const help = launch(['--help']);
  assert.equal((await finished(help)).code, 0, help.output);
  assert.match(help.output, /Usage: present\.cmd/);
  for (const args of [
    ['--html'], ['--html', source, '--port', '0'], ['--html', source, '--port', '65536'],
    ['--html', source, '--port', 'abc'], ['--html', source, '--no-open', '--no-open'],
    [source, source], [path.join(temp, 'secret.txt')], [path.join(temp, 'missing.html')],
  ]) {
    const run = launch(args);
    assert.notEqual((await finished(run)).code, 0, `Expected failure: ${JSON.stringify(args)}\n${run.output}`);
    assert.doesNotMatch(run.output, /Presentation: http/);
  }
  const occupied = net.createServer();
  occupied.listen(0, '127.0.0.1'); await once(occupied, 'listening');
  try {
    const run = launch([source, '--port', String(occupied.address().port), '--no-open']);
    assert.notEqual((await finished(run)).code, 0, run.output);
    assert.doesNotMatch(run.output, /Presentation: http/);
  } finally { await new Promise(resolve => occupied.close(resolve)); }

  const defaultDirectory = path.join(temp, 'assets');
  await fs.mkdir(defaultDirectory);
  await fs.writeFile(path.join(defaultDirectory, 'deck-template.html'), '<title>Default independent HTML</title>');
  const defaults = launch(['--no-open'], { keepInput: true, cwd: temp });
  await until(() => /Presentation: (http:\/\/\S+)/.test(defaults.output) || defaults.child.exitCode !== null, 'default template from a different working directory');
  const defaultUrl = defaults.output.match(/Presentation: (http:\/\/\S+)/)?.[1];
  assert.ok(defaultUrl, defaults.output);
  assert.equal(new URL(defaultUrl).pathname, '/deck-template.html');
  assert.equal(await (await fetch(defaultUrl)).text(), '<title>Default independent HTML</title>');
  assert.equal((await stop(defaults)).code, 0, 'Q stops the default presentation normally');

  const run = launch(['--html', source, '--no-open'], { keepInput: true });
  await until(() => /Presentation: (http:\/\/\S+)/.test(run.output) || run.child.exitCode !== null || run.error, 'server startup');
  assert.ifError(run.error);
  const match = run.output.match(/Presentation: (http:\/\/\S+)/);
  assert.ok(match, run.output);
  const address = match[1], url = new URL(address), port = Number(url.port);
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.searchParams.get('local-present'), '1');
  assert.equal(decodeURIComponent(url.pathname.slice(1)), path.basename(source));
  const idle = net.createConnection({ host: '127.0.0.1', port });
  sockets.add(idle); await once(idle, 'connect');
  const response = await fetch(address, { signal: AbortSignal.timeout(4000) });
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), html);
  assert.equal(response.headers.get('content-length'), String(html.length));
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('permissions-policy'), 'window-management=(self)');
  assert.match(response.headers.get('content-type'), /text\/html; charset=utf-8/);
  idle.destroy(); sockets.delete(idle);
  const audienceUrl = new URL(address); audienceUrl.searchParams.set('audience', '1');
  assert.deepEqual(Buffer.from(await (await fetch(audienceUrl)).arrayBuffer()), html);
  const head = await fetch(address, { method: 'HEAD' });
  assert.equal(head.status, 200); assert.equal(await head.text(), '');
  assert.equal(head.headers.get('content-length'), String(html.length));
  const post = await fetch(address, { method: 'POST' });
  assert.equal(post.status, 405); assert.equal(post.headers.get('allow'), 'GET, HEAD');
  const root = await fetch(url.origin, { redirect: 'manual' });
  assert.equal(root.status, 302); assert.equal(root.headers.get('location'), url.pathname + url.search);
  for (const route of ['/secret.txt', '/present.cmd', '/%2e%2e/secret.txt', '/deck.html']) {
    assert.equal((await fetch(`${url.origin}${route}`)).status, 404, route);
  }
  assert.match(await rawRequest(port, 'garbage\r\n\r\n'), /^HTTP\/1\.1 400 /);
  assert.match(await rawRequest(port, `GET / HTTP/1.1\r\nHost: example.com:${port}\r\n\r\n`), /^HTTP\/1\.1 400 /);
  assert.match(await rawRequest(port, 'GET / HTTP/1.1\r\nX-Large: ' + 'x'.repeat(17000) + '\r\n\r\n'), /^HTTP\/1\.1 431 /);
  await fs.writeFile(source, 'changed after startup');
  assert.deepEqual(Buffer.from(await (await fetch(address)).arrayBuffer()), html, 'serve the startup snapshot');
  assert.equal((await stop(run)).code, 0, 'Q exits without killing the launcher');
  await assert.rejects(fetch(address, { signal: AbortSignal.timeout(2000) }));
  await fs.writeFile(source, html);
  const second = launch([path.relative(launcherDir, source), '--port', String(port), '--no-open'], { keepInput: true });
  await until(() => /Presentation: (http:\/\/\S+)/.test(second.output) || second.child.exitCode !== null || second.error, 'fixed-port positional launch');
  assert.ifError(second.error);
  assert.match(second.output, new RegExp(`Presentation: http://127\\.0\\.0\\.1:${port}/`));
  assert.deepEqual(Buffer.from(await (await fetch(address)).arrayBuffer()), html, 'relative positional path and reused fixed port');
  await stop(second);
  const executable = await fakeBrowser();
  const browserRun = launch([source, '--browser', executable], { keepInput: true });
  const profile = await waitForBrowser(browserRun);
  const browserUrl = browserRun.output.match(/Presentation: (http:\/\/\S+)/)[1];
  const preferencesFile = path.join(profile, 'Default', 'Preferences');
  const preferences = JSON.parse(await fs.readFile(preferencesFile, 'utf8'));
  const exceptions = preferences.profile.content_settings.exceptions;
  const exactOrigin = `${new URL(browserUrl).origin},*`;
  for (const setting of ['automatic_fullscreen', 'popups']) assert.deepEqual(exceptions[setting], { [exactOrigin]: { setting: 1 } });
  assert.equal(exceptions.window_management, undefined, 'screen consent must remain a normal browser prompt');
  const browserArgs = (await fs.readFile(path.join(profile, 'fake-arguments.txt'), 'utf8')).replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  assert.ok(browserArgs.includes(`--user-data-dir=${profile}`), browserArgs.join('\n'));
  assert.ok(browserArgs.includes(`--app=${browserUrl}`), browserArgs.join('\n'));
  const size=browserArgs.find(arg=>arg.startsWith('--window-size='));assert.ok(size,browserArgs.join('\n'));
  const [width,height]=size.slice('--window-size='.length).split(',').map(Number);assert.equal(width*9,height*16);
  if(process.platform==='win32')assert.ok(browserArgs.some(arg=>arg.startsWith('--window-position=')),browserRun.output);
  assert.ok(!browserArgs.some(arg => /disable-web-security|kiosk|start-fullscreen/.test(arg)));
  const overlapping = launch([source, '--browser', executable], { keepInput: true });
  const temporaryProfile = await waitForBrowser(overlapping);
  assert.notEqual(temporaryProfile, profile, 'concurrent launch must not edit a running profile');
  assert.equal((await stop(overlapping)).code, 0);
  await assert.rejects(fs.access(temporaryProfile), 'temporary concurrent profile is removed on exit');
  assert.equal((await fetch(browserUrl)).status, 200, 'closing one owned browser must not close another session');
  assert.equal((await stop(browserRun)).code, 0, 'Q closes only the owned browser and server');
  await fs.access(preferencesFile); // Normal dedicated profile persists for later consent.
  assert.deepEqual(await fs.readdir(launcherDir), ['present.cmd'], 'no helper files created beside the standalone launcher');
  console.log(`PASS: ${powershell ? 'embedded PowerShell payload' : 'standalone Windows CMD with system-only PATH'}; terminal/display bounds, terminal startup retries, default/explicit HTML, special paths, loopback HTTP, browser profiles, concurrency and Q cleanup.`);
} finally {
  for (const socket of sockets) socket.destroy();
  for (const run of children) await stop(run);
  await fs.rm(temp, { recursive: true, force: true });
}
