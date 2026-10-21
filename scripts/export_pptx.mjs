#!/usr/bin/env node
// One browser-rendered PNG per slide; the cover opens the companion HTML.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { htmlHyperlink, runtimeCandidates } from './export_platform.mjs';

const USAGE = 'node scripts/export_pptx.mjs --slides <png-directory> --html <deck.html> --output <new.pptx> [--manifest <json>] [--url <https/http/file-url>]';
const escapeXml = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const exists = async file => { try { await fs.access(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };

async function skillDirectory() {
  if (process.env.PPTX_SKILL_DIR) {
    const directory = path.resolve(process.env.PPTX_SKILL_DIR);
    if (!(await exists(path.join(directory, 'container_tools/artifact_tool_utils.mjs')))) throw new Error('PPTX_SKILL_DIR must point to the Presentations skill directory containing container_tools/artifact_tool_utils.mjs.');
    return directory;
  }
  const root = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'plugins/cache/openai-primary-runtime/presentations');
  if (!(await exists(root))) throw new Error('Presentations skill not found. Set PPTX_SKILL_DIR to its installed directory (containing container_tools).');
  const versions = (await fs.readdir(root)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const version of versions) {
    const candidate = path.join(root, version, 'skills/presentations');
    if (await exists(path.join(candidate, 'container_tools/artifact_tool_utils.mjs'))) return candidate;
  }
  throw new Error('Set PPTX_SKILL_DIR to the installed Presentations skill directory.');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) { console.log(USAGE); return; }
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    if (!['--slides', '--html', '--output', '--manifest', '--url'].includes(name) || !args[index + 1] || args[index + 1].startsWith('--') || options[name]) throw new Error(USAGE);
    options[name] = args[index + 1];
  }
  for (const name of ['--slides', '--html', '--output']) if (!options[name]) throw new Error(USAGE);
  const directory = path.resolve(options['--slides']);
  const htmlPath = path.resolve(options['--html']);
  const output = path.resolve(options['--output']);
  if (path.extname(output).toLowerCase() !== '.pptx') throw new Error('Output must end in .pptx.');
  if (await exists(output)) throw new Error(`Refusing to overwrite: ${output}`);
  if (!(await fs.stat(htmlPath)).isFile()) throw new Error(`HTML is not a file: ${htmlPath}`);
  let names;
  if (options['--manifest']) {
    const manifest = JSON.parse(await fs.readFile(path.resolve(options['--manifest']), 'utf8'));
    if (!Array.isArray(manifest.slides) || !manifest.slides.length || manifest.slides.some(name => typeof name !== 'string' || path.extname(name).toLowerCase() !== '.png')) throw new Error('Manifest needs a nonempty slides array of PNG filenames.');
    names = manifest.slides;
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
  const candidates = runtimeCandidates(process.execPath);
  const runtimeRoot = (await Promise.all(candidates.modules.map(async root => await exists(path.join(root, '@oai/artifact-tool/package.json')) ? root : undefined))).find(Boolean);
  if (!runtimeRoot) throw new Error('Artifact Tool runtime not found. Use load_workspace_dependencies and set RUNTIME_NODE_MODULES (or ARTIFACT_NODE_MODULES) to its Node.js packages path.');
  process.env.RUNTIME_NODE_MODULES = runtimeRoot;
  const require = createRequire(path.join(runtimeRoot, '__pptx_export__.cjs'));
  const { Presentation, PresentationFile } = await import(pathToFileURL(require.resolve('@oai/artifact-tool')).href);
  const JSZip = require('jszip');
  const skillDir = await skillDirectory();
  const pythonExecutable = (await Promise.all(candidates.python.map(async file => await exists(file) ? file : undefined))).find(Boolean);
  if (!pythonExecutable) throw new Error('Bundled Python not found. Use load_workspace_dependencies and set RUNTIME_PYTHON to its Python executable path.');
  await fs.mkdir(path.dirname(output), { recursive: true });
  const build = await fs.mkdtemp(path.join(path.dirname(output), '.pptx-export-'));
  // The marker belongs immediately before the first create operation.
  execFileSync(process.execPath, [path.join(skillDir, 'container_tools/mark_artifact_operation_started.mjs'), '--operation-kind', 'create', '--expected-output-count', '1', '--output-format', 'pptx'], { cwd: skillDir, stdio: 'inherit' });
  const { width, height } = images[0];
  const presentation = Presentation.create({ slideSize: { width, height } });
  for (const image of images) {
    const slide = presentation.slides.add();
    slide.images.add({ blob: new Uint8Array(image.bytes), contentType: 'image/png', alt: image.name, fit: 'contain', position: { left: 0, top: 0, width, height } });
  }
  const candidatePath = path.join(build, 'candidate.pptx');
  await (await PresentationFile.exportPptx(presentation)).save(candidatePath);
  const zip = await JSZip.loadAsync(await fs.readFile(candidatePath));
  const slidePath = 'ppt/slides/slide1.xml';
  const relPath = 'ppt/slides/_rels/slide1.xml.rels';
  let slideXml = await zip.file(slidePath).async('string');
  let relationships = await zip.file(relPath).async('string');
  const id = 'rIdHtmlCompanion';
  const link = `<a:hlinkClick r:id="${id}" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" tooltip="打开交互式 HTML 演示"/>`;
  // Artifact Tool's image API has no hyperlink property. Attach the OOXML
  // hyperlink to the picture's nonvisual properties, not an invisible overlay.
  const picture = /(<p:pic\b[\s\S]*?<p:cNvPr\b[^>]*)(\/>|>[\s\S]*?<\/p:cNvPr>)/;
  const match = slideXml.match(picture);
  if (!match) throw new Error('Exporter did not produce the expected cover picture.');
  slideXml = slideXml.replace(picture, (_, start, ending) => ending === '/>' ? `${start}>${link}</p:cNvPr>` : `${start}>${link}${ending.slice(1)}`);
  relationships = relationships.replace('</Relationships>', `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapeXml(target)}" TargetMode="External"/></Relationships>`);
  zip.file(slidePath, slideXml);
  zip.file(relPath, relationships);
  await fs.writeFile(candidatePath, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  const { finalizePresentation } = await import(pathToFileURL(path.join(skillDir, 'container_tools/artifact_tool_utils.mjs')).href);
  const finalPath = path.join(build, 'final', path.basename(output));
  await fs.mkdir(path.dirname(finalPath));
  await finalizePresentation({
    workspaceDir: path.dirname(output), candidatePath, finalPath,
    explicitTotalSlideCount: images.length,
    pythonExecutable,
    integrityValidatorPath: path.join(skillDir, 'container_tools/inspect_presentation_package_integrity.py'),
    layoutValidatorPath: path.join(skillDir, 'container_tools/inspect_presentation_layout_geometry.py'),
    layoutArgs: ['--expected-slide-size-emu', `${Math.round(width * 9525)},${Math.round(height * 9525)}`],
    verifyArtifactToolImport: true,
    receiptPath: path.join(build, 'validation.json'),
  });
  const finalZip = await JSZip.loadAsync(await fs.readFile(finalPath));
  const finalSlide = await finalZip.file(slidePath).async('string');
  const finalRels = await finalZip.file(relPath).async('string');
  if (!finalSlide.includes(`<a:hlinkClick r:id="${id}"`) || !finalRels.includes(`Target="${escapeXml(target)}" TargetMode="External"`)) throw new Error('Final PPTX lost the HTML hyperlink.');
  for (let index = 1; index <= images.length; index++) {
    const xml = await finalZip.file(`ppt/slides/slide${index}.xml`).async('string');
    if ((xml.match(/<p:pic\b/g) || []).length !== 1) throw new Error(`Slide ${index} must contain exactly one screenshot.`);
  }
  await fs.copyFile(finalPath, output, 1); // COPYFILE_EXCL: never overwrite a raced output.
  console.log(JSON.stringify({ output, slides: images.length, width, height, hyperlink: target, validationReceipt: path.join(build, 'validation.json') }, null, 2));
}

main().catch(error => { console.error(`PPTX export failed: ${error.message}`); process.exitCode = 1; });
