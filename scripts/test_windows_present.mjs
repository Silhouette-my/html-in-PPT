// Runs the real CMD bootstrap on Windows, with Node/npm/Python absent from PATH.
// On other hosts, --powershell <pwsh> exercises the embedded payload only.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
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
const source = path.join(temp, "文稿 & (test) ! ' # % [1].html");
const html = Buffer.from('<!doctype html><meta charset="utf-8"><title>双屏测试</title><p>你好 🌏</p>');
await fs.writeFile(source, html);
await fs.writeFile(path.join(temp, 'secret.txt'), 'must never be served');
const children = new Set();
const sockets = new Set();
const env = { ...process.env };
if (process.platform === 'win32') {
  const systemRoot = process.env.SystemRoot;
  // Use the absolute Node executable for this test, but give the launcher only Windows tools.
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key];
  env.PATH = `${systemRoot}\\System32;${systemRoot}`;
  for (const tool of ['node', 'npm', 'python']) {
    assert.notEqual(spawnSync('where.exe', [tool], { env, cwd: launcherDir }).status, 0, `${tool} must be absent from launcher PATH`);
  }
}
function launch(args) {
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
  const child = spawn(command, argv, { env: childEnv, cwd: launcherDir, windowsHide: true, windowsVerbatimArguments: !powershell });
  const run = { child, output: '', error: undefined };
  run.closed = new Promise(resolve => { child.once('error', error => { run.error = error; resolve({ code: null }); }); child.once('close', code => resolve({ code })); });
  child.stdout.on('data', bytes => { run.output += bytes; });
  child.stderr.on('data', bytes => { run.output += bytes; });
  child.stdin.end(); // Error-path PAUSE must also finish without a human in CI.
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
  if (run.child.exitCode === null) {
    if (process.platform === 'win32') {
      const killer = spawn('taskkill.exe', ['/PID', String(run.child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      await once(killer, 'close');
    } else run.child.kill('SIGTERM');
  }
  await finished(run);
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
try {
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

  const run = launch(['--html', source, '--no-open']);
  await until(() => /Presentation: (http:\/\/\S+)/.test(run.output) || run.child.exitCode !== null || run.error, 'server startup');
  assert.ifError(run.error);
  const match = run.output.match(/Presentation: (http:\/\/\S+)/);
  assert.ok(match, run.output);
  const address = match[1], url = new URL(address), port = Number(url.port);
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(decodeURIComponent(url.pathname.slice(1)), path.basename(source));
  const idle = net.createConnection({ host: '127.0.0.1', port });
  sockets.add(idle); await once(idle, 'connect');
  const response = await fetch(address, { signal: AbortSignal.timeout(4000) });
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), html);
  assert.equal(response.headers.get('content-length'), String(html.length));
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('content-type'), /text\/html; charset=utf-8/);
  idle.destroy(); sockets.delete(idle);
  assert.deepEqual(Buffer.from(await (await fetch(`${address}?audience=1`)).arrayBuffer()), html);
  const head = await fetch(address, { method: 'HEAD' });
  assert.equal(head.status, 200); assert.equal(await head.text(), '');
  assert.equal(head.headers.get('content-length'), String(html.length));
  const post = await fetch(address, { method: 'POST' });
  assert.equal(post.status, 405); assert.equal(post.headers.get('allow'), 'GET, HEAD');
  const root = await fetch(url.origin, { redirect: 'manual' });
  assert.equal(root.status, 302); assert.equal(root.headers.get('location'), url.pathname);
  for (const route of ['/secret.txt', '/present.cmd', '/%2e%2e/secret.txt', '/deck.html']) {
    assert.equal((await fetch(`${url.origin}${route}`)).status, 404, route);
  }
  assert.match(await rawRequest(port, 'garbage\r\n\r\n'), /^HTTP\/1\.1 400 /);
  assert.match(await rawRequest(port, 'GET / HTTP/1.1\r\nX-Large: ' + 'x'.repeat(17000) + '\r\n\r\n'), /^HTTP\/1\.1 431 /);
  await fs.writeFile(source, 'changed after startup');
  assert.deepEqual(Buffer.from(await (await fetch(address)).arrayBuffer()), html, 'serve the startup snapshot');
  await stop(run);
  await assert.rejects(fetch(address, { signal: AbortSignal.timeout(2000) }));
  await fs.writeFile(source, html);
  const second = launch([path.relative(launcherDir, source), '--port', String(port), '--no-open']);
  await until(() => /Presentation: (http:\/\/\S+)/.test(second.output) || second.child.exitCode !== null || second.error, 'fixed-port positional launch');
  assert.ifError(second.error);
  assert.match(second.output, new RegExp(`Presentation: http://127\\.0\\.0\\.1:${port}/`));
  assert.deepEqual(Buffer.from(await (await fetch(address)).arrayBuffer()), html, 'relative positional path and reused fixed port');
  await stop(second);
  assert.deepEqual(await fs.readdir(launcherDir), ['present.cmd'], 'no helper files created beside the standalone launcher');
  console.log(`PASS: ${powershell ? 'embedded PowerShell payload' : 'standalone Windows CMD with system-only PATH'}; Unicode/special paths, CLI validation, loopback HTTP, GET/HEAD/query, selected-file isolation, idle sockets, header limits, snapshot and process-exit port cleanup.`);
} finally {
  for (const socket of sockets) socket.destroy();
  for (const run of children) await stop(run);
  await fs.rm(temp, { recursive: true, force: true });
}
