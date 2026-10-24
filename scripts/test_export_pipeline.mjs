import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import JSZip from 'jszip';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'html-deck-test-'));
function run(script, args, expected = 0) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', script), ...args], { encoding: 'utf8', timeout: 120000 });
  assert.equal(result.status, expected, `${script}: ${result.stdout}\n${result.stderr}`);
  return result.stdout + result.stderr;
}
try {
  const source = path.join(temp, '测试 # 100%.html');
  await fs.copyFile(path.join(root, 'assets/deck-template.html'), source);
  const output = path.join(temp, '成果');
  const prefix = path.join(temp, 'delivery');
  await fs.mkdir(`${prefix}-001`);
  const versionResult = run('export_deck.mjs', ['--html', source, '--auto-version', prefix]);
  assert.equal(JSON.parse(versionResult).outputDirectory, `${prefix}-002`);
  await fs.rename(`${prefix}-002`, output);
  const manifest = JSON.parse(await fs.readFile(path.join(output, 'manifest.json')));
  assert.equal(manifest.slides.length, 10);
  assert.deepEqual(manifest.interactiveSlides.map(slide => slide.slide), [6, 7, 8]);
  assert(manifest.interactiveSlides.every(slide => slide.effects.length && slide.interactiveRegions > 0));
  assert.deepEqual(manifest.slides, Array.from({ length: 10 }, (_, index) => `slide-${String(index + 1).padStart(2, '0')}.png`));
  const pptx = await JSZip.loadAsync(await fs.readFile(path.join(output, manifest.pptx)));
  assert.equal(Object.keys(pptx.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).length, 10);
  const firstRels = await pptx.file('ppt/slides/_rels/slide1.xml.rels').async('string');
  assert(firstRels.includes('Target="%E6%B5%8B%E8%AF%95%20%23%20100%25.html"'));
  for (let index = 1; index <= 10; index++) {
    const xml = await pptx.file(`ppt/slides/slide${index}.xml`).async('string');
    assert.equal((xml.match(/<p:pic\b/g) || []).length, 1);
    const rels = await pptx.file(`ppt/slides/_rels/slide${index}.xml.rels`).async('string');
    const media = rels.match(/Type="[^"]*\/image" Target="([^"]+)"/)[1];
    const embedded = await pptx.file(path.posix.normalize(`ppt/slides/${media}`)).async('nodebuffer');
    assert((await fs.readFile(path.join(output, 'slides', manifest.slides[index - 1]))).equals(embedded), `Screenshot order on slide ${index}`);
    assert.equal(embedded.readUInt32BE(16), 1600); assert.equal(embedded.readUInt32BE(20), 900);
    if (index > 1) assert(!rels.includes('/hyperlink'));
  }
  const bundle = await JSZip.loadAsync(await fs.readFile(path.join(output, '测试 # 100%-bundle.zip')));
  assert.deepEqual(Object.keys(bundle.files).sort(), [manifest.html, manifest.pptx, '使用说明.txt'].sort());
  const instructions = await bundle.file('使用说明.txt').async('string');
  for (const text of [manifest.html, manifest.pptx, '静态截图', '权限', '同目录']) assert(instructions.includes(text));
  assert((await bundle.file(manifest.html).async('nodebuffer')).equals(await fs.readFile(source)));
  assert(run('export_deck.mjs', ['--html', source, '--output-dir', output], 1).includes('Refusing to overwrite'));
  const external = path.join(temp, 'external.html');
  await fs.writeFile(external, (await fs.readFile(source, 'utf8')).replace('</head>', '<link rel="stylesheet" href="missing.css"></head>'));
  assert(run('export_deck.mjs', ['--html', external, '--output-dir', path.join(temp, 'external-output')], 1).includes('self-contained'));
  const legacy = path.join(temp, 'legacy.pptx');
  run('export_pptx.mjs', ['--slides', path.join(output, 'slides'), '--html', source, '--output', legacy, '--url', 'https://example.com/deck']);
  const legacyZip = await JSZip.loadAsync(await fs.readFile(legacy));
  assert((await legacyZip.file('ppt/slides/_rels/slide1.xml.rels').async('string')).includes('Target="https://example.com/deck"'));
  assert(run('export_pptx.mjs', ['--slides', path.join(output, 'slides'), '--html', source, '--output', legacy], 1).includes('Refusing to overwrite'));
  console.log('Portable export E2E passed: 10 screenshots, image order, paired hyperlink, ZIP, legacy CLI, resource and overwrite errors.');
} finally { await fs.rm(temp, { recursive: true, force: true }); }
