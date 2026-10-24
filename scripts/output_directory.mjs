import fs from 'node:fs/promises';
import path from 'node:path';

// mkdir is the exclusive reservation; simultaneous exporters cannot share a version.
export async function allocateVersion(prefix) {
  const absolute = path.resolve(prefix);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  for (let version = 1; ; version++) {
    const directory = `${absolute}-${String(version).padStart(3, '0')}`;
    try { await fs.mkdir(directory); return directory; }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
}
