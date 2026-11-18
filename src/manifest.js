// Parses fxmanifest.lua / __resource.lua into key -> values entries.
// Mirrors FXServer's rule that plural table directives expand into singular keys
// (client_scripts {..} -> client_script entries).

import { tokenize } from './lua.js';

const PLURAL = {
  dependencies: 'dependency',
  client_scripts: 'client_script',
  server_scripts: 'server_script',
  shared_scripts: 'shared_script',
  files: 'file',
  provides: 'provide',
  data_files: 'data_file',
  exports: 'export',
  server_exports: 'server_export',
  escrow_ignores: 'escrow_ignore',
};

/**
 * @typedef {{key: string, value: string, line: number}} ManifestEntry
 * @typedef {{entries: ManifestEntry[], get: (key: string) => ManifestEntry[], first: (key: string) => string | undefined, parseWarnings: string[]}} Manifest
 */

/**
 * @param {string} src
 * @returns {Manifest}
 */
export function parseManifest(src) {
  const tokens = tokenize(src).filter((t) => t.type !== 'comment');
  /** @type {ManifestEntry[]} */
  const entries = [];
  const parseWarnings = [];

  const isStatementStart = (idx) => {
    if (idx === 0) return true;
    const prev = tokens[idx - 1];
    // A directive starts a statement: previous token closes a value or is a keyword boundary.
    if (prev.type === 'string' || prev.type === 'number') return true;
    if (prev.type === 'punct' && (prev.value === '}' || prev.value === ')' || prev.value === ';')) return true;
    if (prev.type === 'name' && ['then', 'do', 'else', 'end'].includes(prev.value)) return true;
    return false;
  };

  /** Collect list strings from a table starting at tokens[idx] === '{'. Returns index after the closing brace. */
  const readTable = (idx, key) => {
    let depth = 0;
    let j = idx;
    for (; j < tokens.length; j++) {
      const t = tokens[j];
      if (t.type === 'punct' && t.value === '{') { depth++; continue; }
      if (t.type === 'punct' && t.value === '}') { depth--; if (depth === 0) return j + 1; continue; }
      if (depth === 1 && t.type === 'string') {
        const prev = tokens[j - 1];
        const next = tokens[j + 1];
        const isValueOfKey = prev && prev.type === 'punct' && prev.value === '=';
        const isKeyInBrackets = prev && prev.value === '[' && next && next.value === ']';
        if (!isValueOfKey && !isKeyInBrackets) entries.push({ key, value: t.value, line: t.line });
      }
    }
    parseWarnings.push(`unclosed table for '${key}'`);
    return j;
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'name' || !isStatementStart(i)) continue;
    const next = tokens[i + 1];
    if (!next) break;
    const rawKey = t.value;
    const key = PLURAL[rawKey] || rawKey;

    if (next.type === 'string') {
      entries.push({ key, value: next.value, line: next.line });
      const after = tokens[i + 2];
      if (after && after.type === 'punct' && after.value === '{') {
        // key 'value' { ... } form: FXServer stores the table as key_extra (JSON); we skip its contents.
        let depth = 0;
        let j = i + 2;
        for (; j < tokens.length; j++) {
          if (tokens[j].value === '{') depth++;
          else if (tokens[j].value === '}') { depth--; if (depth === 0) break; }
        }
        i = j;
      } else {
        i += 1;
      }
      continue;
    }
    if (next.type === 'punct' && next.value === '{') {
      i = readTable(i + 1, key) - 1;
      continue;
    }
    if (next.type === 'punct' && next.value === '(') {
      // call form: dependency('x') or dependencies({ ... })
      const arg = tokens[i + 2];
      if (arg && arg.type === 'string') entries.push({ key, value: arg.value, line: arg.line });
      else if (arg && arg.value === '{') readTable(i + 2, key);
    }
  }

  return {
    entries,
    parseWarnings,
    get: (k) => entries.filter((e) => e.key === k),
    first: (k) => entries.find((e) => e.key === k)?.value,
  };
}

/** Script-ish keys whose values may carry @resource/ imports. */
export const SCRIPT_KEYS = ['client_script', 'server_script', 'shared_script', 'file', 'ui_page', 'loadscreen'];

/**
 * Extract `@resource/path` imports.
 * @param {Manifest} manifest
 * @returns {{resource: string, path: string, line: number, key: string}[]}
 */
export function manifestImports(manifest) {
  const out = [];
  for (const e of manifest.entries) {
    if (!SCRIPT_KEYS.includes(e.key)) continue;
    const m = /^@([^/]+)\/(.+)$/.exec(e.value);
    if (m) out.push({ resource: m[1], path: m[2], line: e.line, key: e.key });
  }
  return out;
}

/**
 * Declared dependencies, without `/server:`-style constraints.
 * @param {Manifest} manifest
 */
export function manifestDependencies(manifest) {
  return manifest.get('dependency').filter((e) => !e.value.startsWith('/'));
}
