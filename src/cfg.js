// Parses server.cfg (following `exec` includes) into an ordered list of resource commands.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';

/**
 * @typedef {{action: 'ensure'|'start'|'stop'|'restart', name: string, category: boolean, file: string, line: number}} CfgCommand
 * @typedef {{commands: CfgCommand[], convars: Record<string, string>, files: string[], missingExec: {path: string, file: string, line: number}[]}} ParsedCfg
 */

/** Split a cfg line into args, honouring double quotes. */
function splitArgs(line) {
  const args = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m;
  while ((m = re.exec(line))) args.push(m[1] ?? m[2]);
  return args;
}

/** Remove comments: whole-line # or //, and trailing ones preceded by whitespace. */
function stripComment(line) {
  const t = line.trim();
  if (t.startsWith('#') || t.startsWith('//')) return '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuote = !inQuote;
    if (inQuote) continue;
    if ((ch === '#' || (ch === '/' && line[i + 1] === '/')) && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

/**
 * @param {string} cfgPath absolute path
 * @param {string} rootDir server-data root, used to resolve exec paths
 * @returns {ParsedCfg}
 */
export function parseCfg(cfgPath, rootDir = dirname(cfgPath)) {
  /** @type {ParsedCfg} */
  const result = { commands: [], convars: {}, files: [], missingExec: [] };
  const seen = new Set();

  const visit = (file) => {
    const abs = resolve(file);
    if (seen.has(abs)) return;
    seen.add(abs);
    result.files.push(relative(rootDir, abs) || abs);
    const lines = readFileSync(abs, 'utf8').split(/\r?\n/);
    lines.forEach((raw, idx) => {
      const args = splitArgs(stripComment(raw));
      if (args.length === 0) return;
      const cmd = args[0].toLowerCase();
      const rel = relative(rootDir, abs) || abs;
      if (['ensure', 'start', 'stop', 'restart'].includes(cmd) && args[1]) {
        const name = args[1];
        const category = /^\[.*\]$/.test(name);
        result.commands.push({ action: /** @type any */ (cmd), name, category, file: rel, line: idx + 1 });
      } else if (cmd === 'exec' && args[1]) {
        const candidates = [resolve(rootDir, args[1]), resolve(dirname(abs), args[1])];
        const found = candidates.find((p) => existsSync(p));
        if (found) visit(found);
        else result.missingExec.push({ path: args[1], file: rel, line: idx + 1 });
      } else if ((cmd === 'set' || cmd === 'setr' || cmd === 'sets') && args[1]) {
        result.convars[args[1]] = args.slice(2).join(' ');
      }
    });
  };

  visit(cfgPath);
  return result;
}
