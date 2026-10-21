import path from 'node:path';

// Encode path components, not a whole URI: literal %, # and ? belong to filenames.
export function htmlHyperlink(output, html, explicitUrl, paths = path) {
  if (explicitUrl) {
    const url = new URL(explicitUrl);
    if (!['https:', 'http:', 'file:'].includes(url.protocol)) throw new Error('--url must use https:, http: or file:.');
    return url.href;
  }
  const relative = paths.relative(paths.dirname(output), html);
  if (paths.isAbsolute(relative)) {
    throw new Error('PPTX and HTML are on different drives or network shares. Put both in the same folder, or pass --url with an explicit https:, http: or file: URL.');
  }
  return relative.split(paths.sep).map(encodeURIComponent).join('/');
}
