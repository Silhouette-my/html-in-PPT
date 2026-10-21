import assert from 'node:assert/strict';
import path from 'node:path';
import { htmlHyperlink } from './export_platform.mjs';

for (const [paths, output, html] of [
  [path.posix, '/Users/me/演示/demo.pptx', '/Users/me/演示/100% #?.html'],
  [path.win32, 'C:\\Users\\me\\演示\\demo.pptx', 'C:\\Users\\me\\演示\\100% #?.html'],
  [path.win32, '\\\\server\\share\\演示\\demo.pptx', '\\\\server\\share\\演示\\100% #?.html'],
]) assert.equal(htmlHyperlink(output, html, undefined, paths), '100%25%20%23%3F.html');
assert.equal(htmlHyperlink('C:\\deck\\demo.pptx', 'C:\\html\\demo.html', undefined, path.win32), '../html/demo.html');
assert.throws(() => htmlHyperlink('C:\\demo.pptx', 'D:\\demo.html', undefined, path.win32), /different drives/);
assert.throws(() => htmlHyperlink('\\\\a\\share\\demo.pptx', '\\\\b\\share\\demo.html', undefined, path.win32), /different drives/);
assert.equal(htmlHyperlink('C:\\demo.pptx', 'D:\\demo.html', 'https://example.org/演示.html', path.win32), 'https://example.org/%E6%BC%94%E7%A4%BA.html');
assert.equal(htmlHyperlink('C:\\demo.pptx', 'D:\\demo.html', 'file:///D:/demo.html', path.win32), 'file:///D:/demo.html');
assert.throws(() => htmlHyperlink('/a.pptx', '/a.html', 'javascript:alert(1)'), /--url/);
console.log(`Export platform tests passed (${process.platform}; POSIX, Windows drive and UNC cases).`);
