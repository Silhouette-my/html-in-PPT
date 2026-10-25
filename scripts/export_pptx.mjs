#!/usr/bin/env node
// Existing screenshot CLI; the HTML pipeline calls the same portable implementation.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { htmlHyperlink } from './export_platform.mjs';

export const USAGE = 'node scripts/export_pptx.mjs --slides <png-directory> --html <deck.html> --output <new.pptx> [--manifest <json>] [--url <https/http/file-url>]';
export async function exportPptx(options) {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const { default: JSZip } = await import('jszip');
  const directory = path.resolve(options['--slides']);
  const htmlPath = path.resolve(options['--html']);
  const output = path.resolve(options['--output']);
  if (path.extname(output).toLowerCase() !== '.pptx') throw new Error('Output must end in .pptx.');
  try { await fs.access(output); throw new Error(`Refusing to overwrite: ${output}`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!(await fs.stat(htmlPath)).isFile()) throw new Error(`HTML is not a file: ${htmlPath}`);
  let names, notes;
  if (options['--manifest']) {
    const manifest = JSON.parse(await fs.readFile(path.resolve(options['--manifest']), 'utf8'));
    if (!Array.isArray(manifest.slides) || !manifest.slides.length || manifest.slides.some(name => typeof name !== 'string' || path.extname(name).toLowerCase() !== '.png')) throw new Error('Manifest needs a nonempty slides array of PNG filenames.');
    names = manifest.slides;
    if (manifest.notes !== undefined) {
      if (!Array.isArray(manifest.notes) || manifest.notes.length !== names.length || manifest.notes.some(note => typeof note !== 'string')) throw new Error('Manifest notes must be a string array matching slides in order.');
      notes = manifest.notes;
    }
  } else {
    names = (await fs.readdir(directory)).filter(name => /^slide-\d+\.png$/.test(name)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (!names.length || names.some((name, index) => Number(name.match(/\d+/)[0]) !== index + 1)) throw new Error('Use contiguous slide-01.png, slide-02.png, … or provide --manifest.');
  }
  if (new Set(names).size !== names.length) throw new Error('Slide filenames must not repeat.');
  const images = [];
  for (const name of names) {
    const bytes = await fs.readFile(path.resolve(directory, name));
    if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.toString('ascii', 12, 16) !== 'IHDR') throw new Error(`Not a PNG: ${name}`);
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    if (!width || !height || (images.length && (width !== images[0].width || height !== images[0].height))) throw new Error(`Inconsistent slide dimensions: ${name}`);
    images.push({ name, bytes, width, height });
  }
  const target = htmlHyperlink(output, htmlPath, options['--url']);
  const { width, height } = images[0];
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'SCREENSHOT', width: width / 100, height: height / 100 });
  pptx.layout = 'SCREENSHOT'; pptx.author = 'html-deck'; pptx.subject = 'HTML screenshot presentation';
  for (const [index, image] of images.entries()) {
    const slide = pptx.addSlide();
    slide.addImage({ data: `data:image/png;base64,${image.bytes.toString('base64')}`, x: 0, y: 0, w: width / 100, h: height / 100, altText: image.name,
      ...(index === 0 ? { hyperlink: { url: target, tooltip: '打开交互式 HTML 演示' } } : {}) });
    if (notes) slide.addNotes(notes[index]);
  }
  let bytes = await pptx.write({ outputType: 'nodebuffer', compression: true });
  const zip = await JSZip.loadAsync(bytes);
  const escapeXml = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  if (notes) {
    // addNotes establishes native notes parts/relationships. PptxGenJS puts all
    // lines in one a:t; preserve authored paragraph boundaries as native a:p.
    for (let index = 0; index < notes.length; index++) {
      const name = `ppt/notesSlides/notesSlide${index + 1}.xml`;
      const xml = await zip.file(name).async('string');
      const paragraphs = notes[index].replace(/\r\n?/g, '\n').split('\n').map(line => `<a:p><a:r><a:rPr lang="zh-CN"/><a:t xml:space="preserve">${escapeXml(line)}</a:t></a:r></a:p>`).join('');
      const body = /(<p:sp>\s*<p:nvSpPr>[\s\S]*?<p:ph type="body"[^>]*\/>[\s\S]*?<p:txBody>)[\s\S]*?(<\/p:txBody>)/;
      if (!body.test(xml)) throw new Error(`Slide ${index + 1} native notes body was not created.`);
      zip.file(name, xml.replace(body, (_, start, end) => `${start}<a:bodyPr/><a:lstStyle/>${paragraphs}${end}`));
    }
    bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  }
  const slideFiles = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name));
  if (slideFiles.length !== images.length) throw new Error('PPTX slide count does not match screenshots.');
  for (let index = 1; index <= images.length; index++) {
    const xml = await zip.file(`ppt/slides/slide${index}.xml`).async('string');
    if ((xml.match(/<p:pic\b/g) || []).length !== 1) throw new Error(`Slide ${index} must contain exactly one screenshot.`);
    const rels = await zip.file(`ppt/slides/_rels/slide${index}.xml.rels`).async('string');
    const media = rels.match(/Type="[^"]*\/image" Target="([^"]+)"/);
    if (!media || !(await zip.file(path.posix.normalize(`ppt/slides/${media[1]}`)).async('nodebuffer')).equals(images[index - 1].bytes)) throw new Error(`Slide ${index} screenshot media does not match its input.`);
  }
  const rels = await zip.file('ppt/slides/_rels/slide1.xml.rels').async('string');
  if (!rels.includes(`Target="${escapeXml(target)}"`) || !rels.includes('/hyperlink')) throw new Error('PPTX lost the HTML hyperlink.');
  const cover = await zip.file('ppt/slides/slide1.xml').async('string');
  const linkId = cover.match(/<a:hlinkClick\b[^>]*r:id="([^"]+)"/)?.[1];
  if (!linkId || !rels.includes(`Id="${linkId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink"`)) throw new Error('Cover screenshot is missing its clickable HTML hyperlink.');
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, bytes, { flag: 'wx' });
  return { output, slides: images.length, width, height, hyperlink: target };
}
export function parseOptions(args, allowed, required = []) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!allowed.includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--') || options[args[i]]) throw new Error('Invalid or duplicate argument. Use --help.');
    options[args[i]] = args[i + 1];
  }
  for (const name of required) if (!options[name]) throw new Error(`Missing ${name}. Use --help.`);
  return options;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.includes('--help')) console.log(USAGE);
  else exportPptx(parseOptions(process.argv.slice(2), ['--slides', '--html', '--output', '--manifest', '--url'], ['--slides', '--html', '--output'])).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(`PPTX export failed: ${error.message}`); process.exitCode = 1; });
}
