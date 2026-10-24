#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { launchBrowser, browserSelection } from './browser.mjs';

export async function doctor() {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node.js 22 or newer is required.');
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
    await import('pptxgenjs'); await import('jszip');
  } catch (error) { if (error.code === 'ERR_MODULE_NOT_FOUND') throw new Error('Export dependencies are missing. Run npm ci in the skill directory.'); throw error; }
  const browser = await launchBrowser(chromium);
  const selection = { ...browserSelection(), version: browser.version() };
  await browser.close();
  return { node: process.versions.node, platform: process.platform, dependencies: 'ready', chromium: 'ready', browser: selection };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.includes('--help')) console.log('npm run doctor — check Node.js, local npm dependencies and Chromium. Setup: npm ci && npm run browser:install');
  else doctor().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(`Preflight failed: ${error.message}`); process.exitCode = 1; });
}
