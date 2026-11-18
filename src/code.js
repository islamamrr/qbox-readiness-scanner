// Reads a resource's code files once, strips comments, and flags encrypted files.

import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { stripLuaComments, stripJsComments } from './lua.js';
import { looksEncrypted } from './inventory.js';

/** @typedef {{rel: string, text: string, lines: string[]}} CodeFile */

const cache = new WeakMap();

/**
 * @param {import('./inventory.js').Resource} r
 * @returns {{files: CodeFile[], encrypted: number}}
 */
export function readCode(r) {
  if (cache.has(r)) return cache.get(r);
  const files = [];
  let encrypted = 0;
  for (const p of r.codeFiles) {
    let buf;
    try { buf = readFileSync(p); } catch { continue; }
    if (looksEncrypted(buf)) { encrypted++; continue; }
    const raw = buf.toString('utf8');
    const text = p.toLowerCase().endsWith('.lua') ? stripLuaComments(raw) : stripJsComments(raw);
    files.push({ rel: relative(r.dir, p), text, lines: text.split(/\r?\n/) });
  }
  const out = { files, encrypted };
  cache.set(r, out);
  return out;
}

/**
 * Find all matches of a regex across a resource's code, with line numbers.
 * @param {import('./inventory.js').Resource} r
 * @param {RegExp} re must not be global-stateful across calls; flags are normalised
 * @returns {{file: string, line: number, match: string, groups: string[]}[]}
 */
export function grep(r, re) {
  const flags = re.flags.includes('g') ? re.flags : re.flags + 'g';
  const out = [];
  for (const f of readCode(r).files) {
    f.lines.forEach((line, i) => {
      const rx = new RegExp(re.source, flags);
      let m;
      while ((m = rx.exec(line))) {
        out.push({ file: f.rel, line: i + 1, match: m[0], groups: m.slice(1) });
        if (m[0].length === 0) rx.lastIndex++;
      }
    });
  }
  return out;
}
