import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { selectPages, exportMapping, notesForMapping } from './export_selection.mjs';
import { parseExportOptions } from './export_deck.mjs';

assert.deepEqual(selectPages('3,1-2,2', 3), [0, 1, 2]);
for (const value of ['0', '-1', '2-1', '1,', '1-4', '1.5', '1,,2']) assert.throws(() => selectPages(value, 3), /--pages/);
assert(parseExportOptions(['--html', 'a.html', '--steps', '--output-dir', 'out'])['--steps']);
const notes = ['第一段：中文 & $1 <内容>。\n\n第二段：保留段落。\n\n• 第一项\n• 第二项\n\n[操作] 点击“运行”，再解释曲线。', '第二页专属备注。\n\n1. 先观察\n2. 再解释\n\n[过渡] 下一页看结果。', '第三页备注。'];
const metadata = notes.map((note, index) => ({ index, notes: note, stepCount: index === 1 ? 2 : 0 }));
assert.equal(exportMapping(metadata, [1], true).length, 3);
assert(notesForMapping(metadata, [{ sourcePage: 2, step: 0, totalSteps: 2 }], true)[0].includes('源页 2 · 初始 (0/2)'));
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'html-deck-features-'));
const script = fileURLToPath(new URL('./export_deck.mjs', import.meta.url));
const fixture = `<!doctype html><meta charset="utf-8"><style>body{margin:0}#deck,.slide{width:1600px;height:900px}.slide{display:none;background:white;color:#123;padding:60px;box-sizing:border-box}.slide.active{display:block}.speaker-note{display:none}h1{font:70px sans-serif}[data-step]{font:50px sans-serif;background:#eef;margin:30px}</style><div id="deck">${notes.map((note, index) => `<section class="slide" data-title="页面${index + 1}"><h1>页面${index + 1}</h1>${index === 1 ? '<p data-step="1">第一步</p><p data-step="2">第二步</p>' : ''}<aside class="speaker-note">${note.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</aside></section>`).join('')}</div><script>
document.body.classList.add('export-slide');const slides=[...document.querySelectorAll('#deck>.slide')];function show(index,step='all'){slides.forEach((slide,i)=>slide.classList.toggle('active',i===index));slides[index].querySelectorAll('[data-step]').forEach(el=>el.style.visibility=step==='all'||Number(el.dataset.step)<=step?'visible':'hidden');}function fromHash(){show(Math.max(0,Number(location.hash.replace('#slide-','')||1)-1));}onhashchange=fromHash;fromHash();
window.htmlDeck={ready:new Promise(resolve=>setTimeout(resolve,20)),getSlides:()=>slides.map((slide,index)=>({index,title:slide.dataset.title,notes:slide.querySelector('.speaker-note').textContent,stepCount:slide.querySelectorAll('[data-step]').length})),prepareExport:async({index,step})=>{await new Promise(resolve=>setTimeout(resolve,20));show(index,step);}};
</script>`;
function run(file, directory, flags = [], success = true) {
  const result = spawnSync(process.execPath, [script, '--html', file, '--output-dir', directory, ...flags], { encoding: 'utf8', timeout: 120000 });
  assert.equal(result.status, success ? 0 : 1, result.stdout + result.stderr);
  return success ? JSON.parse(result.stdout) : result.stderr;
}
async function readManifest(directory) { return JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'))); }
function decode(value) { return value.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&amp;', '&'); }
async function nativeNotes(zip, index) {
  const xml = await zip.file(`ppt/notesSlides/notesSlide${index}.xml`).async('string');
  const body = xml.match(/<p:ph type="body"[\s\S]*?<p:txBody>([\s\S]*?)<\/p:txBody>/)[1];
  return { xml, text: [...body.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)].map(match => decode(match[1])).join('\n') };
}
try {
  const source = path.join(temp, '中文演示.html'); await fs.writeFile(source, fixture);
  const normal = path.join(temp, 'normal'), result = run(source, normal);
  assert.equal(result.timings.browserLaunches, 1);
  for (const key of ['dependencyMs', 'browserLaunchMs', 'prepareMs', 'screenshotMs', 'pptxZipMs', 'totalMs']) assert(result.timings[key] > 0);
  const manifest = await readManifest(normal); assert.equal(manifest.slides.length, 3); assert.deepEqual(manifest.notes, notes);
  const zip = await JSZip.loadAsync(await fs.readFile(path.join(normal, manifest.pptx)));
  for (let index = 1; index <= 3; index++) {
    const native = await nativeNotes(zip, index); assert.equal(native.text, notes[index - 1]);
    assert((await zip.file(`ppt/slides/_rels/slide${index}.xml.rels`).async('string')).includes('/notesSlide'));
    assert(!(await zip.file(`ppt/slides/slide${index}.xml`).async('string')).includes('专属备注'));
  }
  assert((await nativeNotes(zip, 1)).xml.match(/<a:p>/g).length > 5);
  const ranged = path.join(temp, 'range'); run(source, ranged, ['--pages', '3,1']);
  const rangeManifest = await readManifest(ranged); assert.deepEqual(rangeManifest.mapping.map(item => item.sourcePage), [1, 3]); assert.deepEqual(rangeManifest.notes, [notes[0], notes[2]]);
  const stepped = path.join(temp, 'steps'); run(source, stepped, ['--pages', '2', '--steps']);
  const stepManifest = await readManifest(stepped); assert.deepEqual(stepManifest.mapping, [0, 1, 2].map(step => ({ sourcePage: 2, step, totalSteps: 2 })));
  const stepZip = await JSZip.loadAsync(await fs.readFile(path.join(stepped, stepManifest.pptx)));
  for (let step = 0; step <= 2; step++) assert((await nativeNotes(stepZip, step + 1)).text.endsWith(`导出定位：源页 2 · ${step === 0 ? '初始' : `步骤 ${step}`} (${step}/2)`));
  const readSlide = (directory, index) => fs.readFile(path.join(directory, 'slides', `slide-${String(index).padStart(2, '0')}.png`));
  assert(!(await readSlide(stepped, 1)).equals(await readSlide(stepped, 2)));
  assert(!(await readSlide(stepped, 2)).equals(await readSlide(stepped, 3)));
  assert((await readSlide(normal, 2)).equals(await readSlide(stepped, 3)), 'all-content default equals final reveal');
  const changed = path.join(temp, 'changed.html'); await fs.writeFile(changed, fixture.replace('第二页专属备注。', '备注变化不应该泄漏到截图。'));
  const hidden = path.join(temp, 'hidden'); run(changed, hidden, ['--pages', '2']);
  assert((await readSlide(normal, 2)).equals(await readSlide(hidden, 1)), 'source notes do not leak into screenshot pixels');
  const legacy = path.join(temp, 'legacy.html'); await fs.writeFile(legacy, fixture.replace(/window.htmlDeck=\{[\s\S]*?;\n<\/script>/, '</script>'));
  const legacyOutput = path.join(temp, 'legacy'); const legacyResult = run(legacy, legacyOutput); assert.equal(legacyResult.exportApi, false); assert.equal(legacyResult.slides, 3);
  assert(run(legacy, path.join(temp, 'unsupported-steps'), ['--steps'], false).includes('--steps requires'));
  const never = path.join(temp, 'never.html'); await fs.writeFile(never, fixture.replace('prepareExport:async({index,step})=>{', 'prepareExport:async({index,step})=>{if(index===1)await new Promise(()=>{});'));
  const error = run(never, path.join(temp, 'timeout'), ['--pages', '2', '--ready-timeout', '1000'], false);
  assert(error.includes('source page 2 (页面2), step all') && error.includes('timed out after 1000ms'), error);
  await assert.rejects(fs.access(path.join(temp, 'timeout')));
  const neverReady = path.join(temp, 'never-ready.html'); await fs.writeFile(neverReady, fixture.replace('ready:new Promise(resolve=>setTimeout(resolve,20))', 'ready:new Promise(()=>{})'));
  const readyError = run(neverReady, path.join(temp, 'ready-timeout'), ['--ready-timeout', '1000'], false);
  assert(readyError.includes('document initialization') && readyError.includes('timed out after 1000ms'), readyError);
  assert(run(source, path.join(temp, 'bad-range'), ['--pages', '4'], false).includes('--pages range'));
  console.log('Export features passed: native Chinese notes/paragraphs/list/cues, ordered ranges, initial/reveal mapping, pixel nonleakage, legacy default, readiness timeout identity, and single-launch timings.');
} finally { await fs.rm(temp, { recursive: true, force: true }); }
