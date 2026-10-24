#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseOptions } from './export_pptx.mjs';
import { serveHtml, openBrowser } from './local_server.mjs';

const USAGE = 'npm run present -- --html <self-contained-deck.html> [--port <1-65535>] [--no-open]';
export async function present(args) {
  if (args.includes('--help')) { console.log(USAGE); return; }
  if (args.filter(arg => arg === '--no-open').length > 1) throw new Error('Duplicate --no-open.');
  const options = parseOptions(args.filter(arg => arg !== '--no-open'), ['--html', '--port'], ['--html']);
  const file = path.resolve(options['--html']);
  if (path.extname(file).toLowerCase() !== '.html') throw new Error('--html must name an HTML file.');
  const port = options['--port'] === undefined ? 0 : Number(options['--port']);
  if (!Number.isInteger(port) || port < 0 || port > 65535 || (options['--port'] !== undefined && port === 0)) throw new Error('--port must be an integer from 1 to 65535.');
  const session = await serveHtml(await fs.readFile(file), path.basename(file), port);
  console.log(`Presentation: ${session.url}\nServing only ${path.basename(file)} on 127.0.0.1. Press Ctrl+C to stop.`);
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await session.close();
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
    console.log('Presentation server stopped.');
  };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  if (!args.includes('--no-open')) {
    try { await openBrowser(session.url); }
    catch (error) { console.error(`Could not open the default browser: ${error.message}. Open the URL above manually.`); }
  }
  return session;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) present(process.argv.slice(2)).catch(error => { console.error(`Presentation failed: ${error.message}`); process.exitCode = 1; });
