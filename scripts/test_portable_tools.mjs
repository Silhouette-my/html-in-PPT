import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { browserLaunchOptions, browserSelection, launchBrowser } from './browser.mjs';
import { serveHtml, browserOpenCommand } from './local_server.mjs';
import { allocateVersion } from './output_directory.mjs';

assert.deepEqual(browserLaunchOptions({}), { headless: true });
for (const channel of ['chrome', 'msedge']) {
  let actual;
  const browser = await launchBrowser({ launch: async options => { actual = options; return 'browser'; } }, { HTML_DECK_BROWSER_CHANNEL: channel });
  assert.equal(browser, 'browser'); assert.deepEqual(actual, { headless: true, channel });
  assert.deepEqual(browserSelection({ HTML_DECK_BROWSER_CHANNEL: channel }), { source: 'system-channel', channel });
}
await assert.rejects(launchBrowser({ launch: async () => { throw new Error('executable missing'); } }, {}), error => ['Bash:', 'PowerShell:', 'msedge', 'browser:install', 'executable missing'].every(text => error.message.includes(text)));
const url = 'http://127.0.0.1:1234/%E6%B5%8B%E8%AF%95%20%23.html';
assert.deepEqual(browserOpenCommand(url, 'darwin'), { command: 'open', args: [url] });
assert.deepEqual(browserOpenCommand(url, 'win32'), { command: 'rundll32.exe', args: ['url.dll,FileProtocolHandler', url] });
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'html-deck-tools-'));
let session, child;
try {
  const prefix = path.join(temp, 'delivery');
  const allocated = await Promise.all(Array.from({ length: 8 }, () => allocateVersion(prefix)));
  assert.equal(new Set(allocated).size, 8);
  assert.deepEqual(allocated.map(name => path.basename(name)).sort(), Array.from({ length: 8 }, (_, index) => `delivery-${String(index + 1).padStart(3, '0')}`));
  const html = '<!doctype html><title>测试</title><p>Only selected HTML</p>';
  session = await serveHtml(html, '测试 #%.html');
  assert.equal(session.server.address().address, '127.0.0.1');
  const malformedStatus = await new Promise((resolve, reject) => {
    const request = http.get({ hostname: '127.0.0.1', port: session.server.address().port, path: '//[' }, response => { response.resume(); resolve(response.statusCode); });
    request.once('error', reject);
  });
  assert.equal(malformedStatus, 400);
  assert.equal(await (await fetch(session.url)).text(), html);
  assert.equal((await fetch(session.url, { method: 'HEAD' })).status, 200);
  assert.equal((await fetch(session.url, { method: 'POST' })).status, 405);
  for (const route of ['/package.json', '/secret.txt', '/%2e%2e/secret', '/deck.html']) assert.equal((await fetch(new URL(route, session.url))).status, 404);
  const origin = new URL(session.url).origin;
  assert.equal((await fetch(origin, { redirect: 'manual' })).status, 302);
  await session.close(); session = undefined;
  await assert.rejects(fetch(url.replace(':1234', `:${new URL(origin).port}`)));
  const source = path.join(temp, '测试 #%.html'); await fs.writeFile(source, html);
  const script = fileURLToPath(new URL('./present.mjs', import.meta.url));
  child = spawn(process.execPath, [script, '--html', source, '--no-open'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const address = await new Promise((resolve, reject) => {
    let text = '';
    const timeout = setTimeout(() => reject(new Error('present CLI did not start')), 10000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.stdout.on('data', bytes => { text += bytes; const match = text.match(/Presentation: (http:\/\/\S+)/); if (match) { clearTimeout(timeout); resolve(match[1]); } });
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`present CLI exited ${code}: ${text}`)); });
  });
  assert.equal(await (await fetch(address)).text(), html);
  await new Promise(resolve => { child.once('exit', resolve); child.kill('SIGINT'); }); child = undefined;
  await assert.rejects(fetch(address));
  console.log('Portable tools passed: shared system-channel launch, browser errors, concurrent numbered allocation, loopback-only selected-file server, safe OS commands and present --no-open.');
} finally { if (child) child.kill(); if (session) await session.close(); await fs.rm(temp, { recursive: true, force: true }); }
