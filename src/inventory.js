// Walks a resources folder the way FXServer does: a folder with a manifest is a
// resource; a [bracketed] folder is a category that is searched further.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, basename } from 'node:path';
import { parseManifest, manifestDependencies, manifestImports } from './manifest.js';

const CODE_EXT = /\.(lua|js)$/i;
const SKIP_DIRS = new Set(['node_modules', '.git', 'stream', 'html', 'web', 'ui', 'nui', 'dist-ui']);
// Install notes and edits for *other* resources (e.g. ps-housing's "README - INSTALL INSTRUCTIONS/QBCore/qb-doorlock")
// are never loaded, so their code must not count against this resource.
const DOC_DIR = /readme|instructions|^(?:docs?|examples?|install(?:ation)?|\.github)$/i;
const MAX_CODE_BYTES = 1_000_000;
const MAX_CODE_FILES = 400;

/**
 * @typedef {{
 *   name: string, dir: string, relDir: string, categories: string[],
 *   manifestFile: string, legacyManifest: boolean, manifest: import('./manifest.js').Manifest,
 *   dependencies: {value: string, line: number}[],
 *   imports: {resource: string, path: string, line: number, key: string}[],
 *   provides: string[], escrowed: boolean, codeFiles: string[]
 * }} Resource
 */

/** Is this buffer an escrow-encrypted (binary) file rather than source text? */
export function looksEncrypted(buf) {
  const sample = buf.subarray(0, 512);
  let bad = 0;
  for (const b of sample) if (b === 0 || (b < 9) || (b > 13 && b < 32)) bad++;
  return sample.length > 0 && bad / sample.length > 0.05;
}

function listCodeFiles(dir) {
  const out = [];
  const walk = (d) => {
    if (out.length >= MAX_CODE_FILES) return;
    let ents;
    try { ents = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = join(d, e.name);
      if (e.isDirectory()) {
        // A sub-folder with its own manifest is a separate (unloaded) resource copy, not part of this one.
        const nested = existsSync(join(p, 'fxmanifest.lua')) || existsSync(join(p, '__resource.lua'));
        if (!SKIP_DIRS.has(e.name.toLowerCase()) && !DOC_DIR.test(e.name) && !nested) walk(p);
      } else if (CODE_EXT.test(e.name) && !/^(fxmanifest|__resource)\.lua$/i.test(e.name)) {
        try { if (statSync(p).size <= MAX_CODE_BYTES) out.push(p); } catch { /* unreadable */ }
      }
    }
  };
  walk(dir);
  return out;
}

/**
 * @param {string} resourcesDir
 * @returns {{resources: Resource[], strayFolders: string[]}}
 */
export function buildInventory(resourcesDir) {
  /** @type {Resource[]} */
  const resources = [];
  const strayFolders = [];

  const walk = (dir, categories) => {
    let ents;
    try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!e.isDirectory()) continue;
      const p = join(dir, e.name);
      const fx = join(p, 'fxmanifest.lua');
      const legacy = join(p, '__resource.lua');
      if (existsSync(fx) || existsSync(legacy)) {
        const manifestFile = existsSync(fx) ? fx : legacy;
        const manifest = parseManifest(readFileSync(manifestFile, 'utf8'));
        let escrowed = false;
        try { escrowed = readdirSync(p).some((f) => f.toLowerCase().endsWith('.fxap')); } catch { /* ignore */ }
        resources.push({
          name: e.name,
          dir: p,
          relDir: relative(resourcesDir, p),
          categories: [...categories],
          manifestFile,
          legacyManifest: manifestFile === legacy,
          manifest,
          dependencies: manifestDependencies(manifest),
          imports: manifestImports(manifest),
          provides: manifest.get('provide').map((x) => x.value),
          escrowed,
          codeFiles: listCodeFiles(p),
        });
      } else if (/^\[.*\]$/.test(e.name)) {
        walk(p, [...categories, e.name]);
      } else if (!e.name.startsWith('.')) {
        strayFolders.push(relative(resourcesDir, p));
      }
    }
  };
  walk(resourcesDir, []);
  return { resources, strayFolders };
}

export { basename };
