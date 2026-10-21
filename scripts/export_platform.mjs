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

// Bundled Node uses node/bin/node on macOS and may use node/node.exe on Windows.
// Explicit runtime paths from load_workspace_dependencies always take precedence.
export function runtimeCandidates(execPath, env = process.env, platform = process.platform, paths = path) {
  const bin = paths.dirname(execPath);
  return {
    modules: env.ARTIFACT_NODE_MODULES || env.RUNTIME_NODE_MODULES
      ? [env.ARTIFACT_NODE_MODULES || env.RUNTIME_NODE_MODULES]
      : [paths.resolve(bin, '../node_modules'), paths.resolve(bin, 'node_modules')],
    python: env.RUNTIME_PYTHON ? [env.RUNTIME_PYTHON]
      : platform === 'win32'
        ? [paths.resolve(bin, '../python/python.exe'), paths.resolve(bin, '../../python/python.exe')]
        : [paths.resolve(bin, '../../python/bin/python3'), paths.resolve(bin, '../python/bin/python3')],
  };
}
