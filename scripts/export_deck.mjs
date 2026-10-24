#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { exportPptx, parseOptions } from './export_pptx.mjs';
import { doctor } from './doctor.mjs';
import { launchBrowser } from './browser.mjs';
import { serveHtml } from './local_server.mjs';
import { allocateVersion } from './output_directory.mjs';

const USAGE = 'npm run export -- --html <self-contained-deck.html> (--output-dir <new-folder> | --auto-version <prefix>) [--url <https/http/file-url>]';
export async function exportDeck(options) {
  if (Boolean(options['--output-dir']) === Boolean(options['--auto-version'])) throw new Error('Choose exactly one of --output-dir or --auto-version.');
  const source = path.resolve(options['--html']), destination = path.resolve(options['--output-dir'] || options['--auto-version']);
  let output = destination;
  if (path.extname(source).toLowerCase() !== '.html') throw new Error('--html must name an HTML file.');
  const html = await fs.readFile(source, 'utf8');
  if (options['--output-dir']) {
    try { await fs.access(output); throw new Error(`Refusing to overwrite output directory: ${output}`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  await doctor();
  const { chromium } = await import('playwright');
  const { default: JSZip } = await import('jszip');
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const build = await fs.mkdtemp(path.join(path.dirname(destination), '.html-deck-export-'));
  const stem = path.basename(source, path.extname(source));
  const htmlName = path.basename(source), pptxName = `${stem}.pptx`;
  let browser, server;
  try {
    server = await serveHtml(html, 'deck.html');
    const address = server.url;
    browser = await launchBrowser(chromium);
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const failures = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const request = route.request();
      if (request.isNavigationRequest() && request.frame() === page.mainFrame() && request.url().split('?')[0].split('#')[0] === address) await route.continue();
      else { failures.push(request.url()); await route.abort(); }
    });
    await page.goto(`${address}?export=1#slide-1`, { waitUntil: 'load' });
    const info = await page.evaluate(async () => {
      await document.fonts.ready;
      const invalid = [];
      for (const element of document.querySelectorAll('[src],[srcset],link[href],object[data],iframe')) {
        for (const attribute of ['src', 'srcset', 'href', 'data']) {
          const value = element.getAttribute(attribute);
          if (value && !value.startsWith('data:') && !value.startsWith('#') && !(attribute === 'href' && element.tagName !== 'LINK')) invalid.push(`${element.tagName} ${attribute}=${value}`);
        }
      }
      for (const element of document.querySelectorAll('[style],style')) {
        const css = element.tagName === 'STYLE' ? element.textContent : element.getAttribute('style');
        for (const match of css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) if (!match[2].startsWith('data:') && !match[2].startsWith('#')) invalid.push(`CSS url(${match[2]})`);
        if (/@import\s/i.test(css)) invalid.push('CSS @import');
      }
      await Promise.all([...document.images].map(image => image.decode().catch(() => invalid.push(`Unreadable image: ${image.getAttribute('src')?.slice(0, 80)}`))));
      const slides = [...document.querySelectorAll('#deck > .slide')];
      const titles = slides.map(slide => slide.dataset.title || slide.querySelector('h1,h2')?.textContent || '');
      const interactiveSlides = slides.flatMap((slide, index) => {
        const marked = [...slide.querySelectorAll('[data-interactive],[data-effect]')];
        if (slide.matches('[data-interactive],[data-effect]')) marked.unshift(slide);
        return marked.length ? [{ slide: index + 1, title: titles[index], effects: [...new Set(marked.map(element => element.dataset.effect).filter(Boolean))], interactiveRegions: marked.filter(element => element.hasAttribute('data-interactive')).length }] : [];
      });
      return { invalid, count: slides.length, exportMode: document.body.classList.contains('export-slide'), titles, interactiveSlides };
    });
    if (failures.length || info.invalid.length) throw new Error(`Only self-contained HTML is supported. Embed resources as data URLs. External or unreadable resources: ${[...new Set([...failures, ...info.invalid])].join('; ')}`);
    if (!info.exportMode || !info.count) throw new Error('Expected html-deck template with #deck > .slide and ?export=1 support.');
    if (errors.length) throw new Error(`HTML runtime errors: ${errors.join('; ')}`);
    await fs.mkdir(path.join(build, 'slides'));
    const slides = [];
    for (let index = 0; index < info.count; index++) {
      await page.goto(`${address}?export=1#slide-${index + 1}`, { waitUntil: 'load' });
      await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode())); });
      await page.locator(`#deck > .slide:nth-child(${index + 1}).active`).waitFor({ state: 'visible' });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const slide = page.locator('#deck > .slide.active');
      const box = await slide.boundingBox();
      if (!box || Math.round(box.width) !== 1600 || Math.round(box.height) !== 900) throw new Error(`Slide ${index + 1} export surface must be 1600 × 900.`);
      const name = `slide-${String(index + 1).padStart(2, '0')}.png`;
      await slide.screenshot({ path: path.join(build, 'slides', name), animations: 'disabled' });
      slides.push(name);
    }
    if (failures.length || errors.length) throw new Error(`HTML changed or failed during capture: ${[...failures, ...errors].join('; ')}`);
    await fs.writeFile(path.join(build, htmlName), html);
    const manifest = { slides, titles: info.titles, width: 1600, height: 900, html: htmlName, pptx: pptxName, interactiveSlides: info.interactiveSlides };
    await fs.writeFile(path.join(build, 'manifest.json'), JSON.stringify(manifest, null, 2));
    const result = await exportPptx({ '--slides': path.join(build, 'slides'), '--html': path.join(build, htmlName), '--output': path.join(build, pptxName), '--manifest': path.join(build, 'manifest.json'), ...(options['--url'] ? { '--url': options['--url'] } : {}) });
    const receipt = { ...result, output: pptxName, selfContained: true, screenshots: slides.length, validation: 'passed' };
    await fs.writeFile(path.join(build, 'validation.json'), JSON.stringify(receipt, null, 2));
    const zip = new JSZip();
    for (const name of [htmlName, pptxName]) zip.file(name, await fs.readFile(path.join(build, name)));
    const linkDescription = options['--url'] ? `首页截图链接到：${options['--url']}` : `首页截图链接到同目录的 ${htmlName}。请把两个文件一起解压，保持相对位置。`;
    const instructions = `使用说明\n\n1. 打开 ${pptxName} 可按普通幻灯片放映。PPTX 每页是 HTML 的静态截图，不会运行交互。\n2. ${linkDescription}\n3. 打开 ${htmlName} 可使用实时图表、动画或其他 HTML 交互。\n4. PowerPoint 可能要求确认打开链接；macOS 可能要求授予 HTML 文件访问权限。只对可信文件授权。若未能跳转，请直接用浏览器打开 ${htmlName}。\n5. 如需 localhost 启动，可在 skill 目录运行 npm run present，并用 --html 指定 ${htmlName} 的完整路径。多屏等功能仍需浏览器支持和用户授权。\n`;
    zip.file('使用说明.txt', instructions);
    await fs.writeFile(path.join(build, `${stem}-bundle.zip`), await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
    // mkdir is exclusive: a raced user directory must never be replaced.
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
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.includes('--help')) console.log(USAGE);
  else exportDeck(parseOptions(process.argv.slice(2), ['--html', '--output-dir', '--auto-version', '--url'], ['--html'])).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(`Deck export failed: ${error.message}`); process.exitCode = 1; });
}
