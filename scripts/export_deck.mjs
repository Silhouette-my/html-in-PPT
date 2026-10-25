#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { exportPptx, parseOptions } from './export_pptx.mjs';
import { loadDependencies } from './doctor.mjs';
import { launchBrowser } from './browser.mjs';
import { serveHtml } from './local_server.mjs';
import { allocateVersion } from './output_directory.mjs';
import { selectPages, exportMapping, notesForMapping } from './export_selection.mjs';
import { inspectDocument, waitForReady, validateMetadata } from './browser_export.mjs';

const USAGE = 'npm run export -- --html <self-contained-deck.html> (--output-dir <new-folder> | --auto-version <prefix>) [--pages 1,3-5] [--steps] [--ready-timeout <ms>] [--url <https/http/file-url>]';
export async function exportDeck(options) {
  const started = performance.now();
  const timings = { browserLaunches: 0, dependencyMs: 0, browserLaunchMs: 0, prepareMs: 0, screenshotMs: 0, pptxZipMs: 0, totalMs: 0 };
  if (Boolean(options['--output-dir']) === Boolean(options['--auto-version'])) throw new Error('Choose exactly one of --output-dir or --auto-version.');
  const timeout = options['--ready-timeout'] === undefined ? 30000 : Number(options['--ready-timeout']);
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 2147483647) throw new Error('--ready-timeout must be a positive integer number of milliseconds.');
  const source = path.resolve(options['--html']), destination = path.resolve(options['--output-dir'] || options['--auto-version']);
  let output = destination;
  if (path.extname(source).toLowerCase() !== '.html') throw new Error('--html must name an HTML file.');
  const html = await fs.readFile(source, 'utf8');
  if (options['--output-dir']) {
    try { await fs.access(output); throw new Error(`Refusing to overwrite output directory: ${output}`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const dependencyStart = performance.now();
  const { chromium } = await loadDependencies();
  const { default: JSZip } = await import('jszip');
  timings.dependencyMs = performance.now() - dependencyStart;
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const build = await fs.mkdtemp(path.join(path.dirname(destination), '.html-deck-export-'));
  const stem = path.basename(source, path.extname(source));
  const htmlName = path.basename(source), pptxName = `${stem}.pptx`;
  let browser, server;
  try {
    server = await serveHtml(html, 'deck.html');
    const address = server.url;
    const launchStart = performance.now();
    browser = await launchBrowser(chromium);
    timings.browserLaunchMs = performance.now() - launchStart; timings.browserLaunches++;
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    page.setDefaultTimeout(timeout); page.setDefaultNavigationTimeout(timeout);
    const failures = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const request = route.request();
      if (request.isNavigationRequest() && request.frame() === page.mainFrame() && request.url().split('?')[0].split('#')[0] === address) await route.continue();
      else { failures.push(request.url()); await route.abort(); }
    });
    const assertHealthy = () => {
      if (failures.length) throw new Error(`Only self-contained HTML is supported. Embed resources as data URLs: ${[...new Set(failures)].join('; ')}`);
      if (errors.length) throw new Error(`HTML runtime errors: ${errors.join('; ')}`);
    };
    let prepareStart = performance.now();
    try {
      await page.goto(`${address}?export=1#slide-1`, { waitUntil: 'load' });
      assertHealthy();
      await page.evaluate(waitForReady, { timeout, identity: 'source page 1 (document initialization)', useApi: false });
    } catch (error) { throw new Error(`Preparing source page 1 (document initialization): ${error.message}`); }
    const info = await page.evaluate(inspectDocument);
    if (info.invalid.length) throw new Error(`Only self-contained HTML is supported. Embed resources as data URLs. External or unreadable resources: ${info.invalid.join('; ')}`);
    validateMetadata(info); assertHealthy();
    if (options['--steps'] && !info.hasApi) throw new Error('--steps requires htmlDeck.prepareExport({index,step}) and getSlides() metadata; default all-content export remains available for legacy templates.');
    const selected = selectPages(options['--pages'], info.count);
    const mapping = exportMapping(info.metadata, selected, options['--steps']);
    const notes = notesForMapping(info.metadata, mapping, options['--steps']);
    timings.prepareMs += performance.now() - prepareStart;
    await fs.mkdir(path.join(build, 'slides'));
    const slides = [];
    for (const [outputIndex, item] of mapping.entries()) {
      const index = item.sourcePage - 1, title = info.metadata[index].title;
      const identity = `source page ${item.sourcePage} (${title}), step ${item.step}`;
      prepareStart = performance.now();
      try {
        if (!info.hasApi) await page.goto(`${address}?export=1#slide-${item.sourcePage}`, { waitUntil: 'load' });
        await page.evaluate(waitForReady, { index, step: item.step, useApi: info.hasApi, timeout, identity });
        const slide = page.locator(`#deck > .slide:nth-child(${index + 1}).active`);
        await slide.waitFor({ state: 'visible' });
        const box = await slide.boundingBox();
        if (!box || Math.round(box.width) !== 1600 || Math.round(box.height) !== 900) throw new Error('Export surface must be 1600 × 900.');
        assertHealthy();
        timings.prepareMs += performance.now() - prepareStart;
        const name = `slide-${String(outputIndex + 1).padStart(2, '0')}.png`;
        const screenshotStart = performance.now();
        await slide.screenshot({ path: path.join(build, 'slides', name), animations: 'disabled' });
        timings.screenshotMs += performance.now() - screenshotStart;
        slides.push(name);
      } catch (error) { throw new Error(`Preparing/capturing ${identity}: ${error.message}`); }
    }
    assertHealthy();
    const packageStart = performance.now();
    await fs.writeFile(path.join(build, htmlName), html);
    const manifest = { slides, titles: mapping.map(item => info.metadata[item.sourcePage - 1].title), width: 1600, height: 900, html: htmlName, pptx: pptxName, interactiveSlides: info.interactiveSlides, notes, mapping };
    await fs.writeFile(path.join(build, 'manifest.json'), JSON.stringify(manifest, null, 2));
    const result = await exportPptx({ '--slides': path.join(build, 'slides'), '--html': path.join(build, htmlName), '--output': path.join(build, pptxName), '--manifest': path.join(build, 'manifest.json'), ...(options['--url'] ? { '--url': options['--url'] } : {}) });
    const receipt = { ...result, output: pptxName, selfContained: true, screenshots: slides.length, validation: 'passed', notes: notes.length, exportApi: info.hasApi, timings };
    const zip = new JSZip();
    for (const name of [htmlName, pptxName]) zip.file(name, await fs.readFile(path.join(build, name)));
    const linkDescription = options['--url'] ? `首页截图链接到：${options['--url']}` : `首页截图链接到同目录的 ${htmlName}。请把两个文件一起解压，保持相对位置。`;
    const instructions = `使用说明\n\n1. 打开 ${pptxName} 可按普通幻灯片放映。PPTX 每页是 HTML 的静态截图，不会运行交互；演讲备注保存在 PowerPoint 原生备注中。\n2. ${linkDescription}\n3. 打开 ${htmlName} 可使用实时图表、动画或其他 HTML 交互。\n4. PowerPoint 可能要求确认打开链接；macOS 可能要求授予 HTML 文件访问权限。只对可信文件授权。若未能跳转，请直接用浏览器打开 ${htmlName}。\n5. 如需 localhost 启动，可在 skill 目录运行 npm run present，并用 --html 指定 ${htmlName} 的完整路径。多屏等功能仍需浏览器支持和用户授权。\n`;
    zip.file('使用说明.txt', instructions);
    await fs.writeFile(path.join(build, `${stem}-bundle.zip`), await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
    timings.pptxZipMs = performance.now() - packageStart;
    timings.totalMs = performance.now() - started;
    await fs.writeFile(path.join(build, 'validation.json'), JSON.stringify(receipt, null, 2));
    if (options['--auto-version']) output = await allocateVersion(destination);
    else await fs.mkdir(output);
    for (const name of await fs.readdir(build)) await fs.rename(path.join(build, name), path.join(output, name));
    return { ...receipt, outputDirectory: output, bundle: path.join(output, `${stem}-bundle.zip`) };
  } finally {
    if (browser) await browser.close();
    if (server) await server.close();
    await fs.rm(build, { recursive: true, force: true });
  }
}
export function parseExportOptions(args) {
  if (args.filter(arg => arg === '--steps').length > 1) throw new Error('Duplicate --steps.');
  const options = parseOptions(args.filter(arg => arg !== '--steps'), ['--html', '--output-dir', '--auto-version', '--url', '--pages', '--ready-timeout'], ['--html']);
  if (args.includes('--steps')) options['--steps'] = true;
  return options;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.includes('--help')) console.log(USAGE);
  else Promise.resolve().then(() => exportDeck(parseExportOptions(process.argv.slice(2)))).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(`Deck export failed: ${error.message}`); process.exitCode = 1; });
}
