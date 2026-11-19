// Generic server checks (free tier). Each rule is a pure function of the graph.

import { activeResources, suggestOrder } from '../graph.js';
import { SYSTEMS, LEGACY_SQL, BUILTIN } from '../catalog.js';
import { grep, readCode } from '../code.js';
import { looksEncrypted } from '../inventory.js';
import { readFileSync } from 'node:fs';
import { relative, join } from 'node:path';

/**
 * @typedef {'error'|'warning'|'info'} Severity
 * @typedef {{rule: string, severity: Severity, resource?: string, message: string, file?: string, line?: number, fix?: string}} Finding
 * @typedef {import('../graph.js').Graph} Graph
 */

const mfile = (r) => relative(r.dir, r.manifestFile);

// An @import only breaks when started too early if the library file itself needs its resource running:
// ox_lib's init.lua errors unless ox_lib is started, ESX/qbx imports call exports at load time.
// Plain files (@PolyZone/client.lua, @oxmysql/lib/MySQL.lua, @qb-core/shared/locale.lua) load fine.
const NEEDS_STARTED = [
  /GetResourceState\s*\([^)]*\)\s*~=\s*['"]started['"]\s*then\s*(?:--[^\n]*\n\s*)?error\s*\(/,
  /^(?:local\s+)?[\w.]+\s*=\s*exports(?:\.\w+|\s*\[[^\]]+\])\s*[:.]\s*\w+\s*\(/m,
];
const needsCache = new Map();
/** @returns {boolean} true when the imported file needs its resource started first (or can't be read). */
export function importNeedsStarted(target, path) {
  if (/[*?]/.test(path)) return false; // globs pull in data/locale files
  const file = join(target.dir, path);
  if (!needsCache.has(file)) {
    let needs = true;
    try {
      const buf = readFileSync(file);
      needs = looksEncrypted(buf) || NEEDS_STARTED.some((re) => re.test(buf.toString('utf8')));
    } catch { /* unreadable: stay cautious */ }
    needsCache.set(file, needs);
  }
  return needsCache.get(file);
}

/** SRS001: declared dependency not installed. */
export function srs001(g) {
  const out = [];
  for (const r of activeResources(g)) {
    for (const d of r.dependencies) {
      if (!g.resolve(d.value) && !BUILTIN.includes(d.value)) {
        out.push({ rule: 'SRS001', severity: 'error', resource: r.name, message: `depends on '${d.value}', which is not installed`, file: mfile(r), line: d.line, fix: `install '${d.value}' or remove the dependency` });
      }
    }
  }
  return out;
}

/** SRS002: something the resource loads at start (an @import) is started after it. */
export function srs002(g) {
  if (!g.hasCfg) return [];
  const out = [];
  for (const r of activeResources(g)) {
    const myIdx = g.startIndex.get(r.name);
    const declared = new Set(r.dependencies.map((d) => g.resolve(d.value)?.name).filter(Boolean));
    for (const imp of r.imports) {
      const target = g.resolve(imp.resource);
      if (!target || declared.has(target.name) || !importNeedsStarted(target, imp.path)) continue;
      const idx = g.startIndex.get(target.name);
      const sameCategory = g.startOrder[myIdx]?.via === 'category' && g.startOrder[idx]?.category === g.startOrder[myIdx]?.category;
      if (idx !== undefined && idx > myIdx && !sameCategory) {
        out.push({ rule: 'SRS002', severity: 'error', resource: r.name, message: `loads @${imp.resource}/${imp.path} but '${target.name}' starts after it`, file: mfile(r), line: imp.line, fix: `ensure ${target.name} before ${r.name}, or add dependency '${target.name}' to its manifest` });
      }
    }
  }
  return out;
}

/** SRS003: @import target missing or never started. */
export function srs003(g) {
  const out = [];
  for (const r of activeResources(g)) {
    const declared = new Set(r.dependencies.map((d) => g.resolve(d.value)?.name).filter(Boolean));
    const reported = new Set();
    for (const imp of r.imports) {
      if (imp.resource === r.name || reported.has(imp.resource)) continue;
      const target = g.resolve(imp.resource);
      if (!target) {
        reported.add(imp.resource);
        out.push({ rule: 'SRS003', severity: 'error', resource: r.name, message: `loads @${imp.resource}/${imp.path}, but '${imp.resource}' is not installed`, file: mfile(r), line: imp.line, fix: `install '${imp.resource}'` });
      } else if (g.hasCfg && !g.startIndex.has(target.name) && !declared.has(target.name)) {
        reported.add(imp.resource);
        out.push({ rule: 'SRS003', severity: 'error', resource: r.name, message: `loads @${imp.resource}/${imp.path}, but '${target.name}' is never started`, file: mfile(r), line: imp.line, fix: `add 'ensure ${target.name}' before ${r.name}` });
      }
    }
  }
  return out;
}

/** SRS004: exports called on a resource that is not installed. */
export function srs004(g) {
  const out = [];
  const EXPORT_RE = /exports\s*\[\s*['"]([A-Za-z0-9_\-.]+)['"]\s*\]|exports\.([A-Za-z_][A-Za-z0-9_]*)\s*[:.]/;
  for (const r of activeResources(g)) {
    const seen = new Set();
    const code = readCode(r);
    const allText = code.files.map((f) => f.text).join('\n');
    for (const hit of grep(r, EXPORT_RE)) {
      const name = hit.groups[0] || hit.groups[1];
      if (!name || name === r.name || seen.has(name)) continue;
      // Optional integrations: guarded by GetResourceState or wrapped in pcall, or chosen in a config file.
      const lineText = code.files.find((f) => f.rel === hit.file)?.lines[hit.line - 1] || '';
      const esc = name.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
      if (new RegExp(`GetResourceState\\s*\\(\\s*['"]${esc}['"]`).test(allText) || /\bpcall\s*\(/.test(lineText) || /(^|[\\/])(config|bridges?|frameworks?|compat|integrations?)[\\/]|^config\.lua$/i.test(hit.file)) { seen.add(name); continue; }
      seen.add(name);
      if (!g.resolve(name) && !BUILTIN.includes(name)) {
        out.push({ rule: 'SRS004', severity: 'warning', resource: r.name, message: `calls exports of '${name}', which is not installed`, file: hit.file, line: hit.line, fix: `install '${name}', or this feature will error at runtime` });
      }
    }
  }
  return out;
}

/** SRS005: duplicate resource names. */
export function srs005(g) {
  const out = [];
  for (const [name, list] of g.byName) {
    if (list.length > 1) {
      out.push({ rule: 'SRS005', severity: 'error', resource: name, message: `${list.length} folders are named '${name}': ${list.map((r) => r.relDir).join(', ')}`, fix: 'keep one copy; FXServer may load either' });
    }
  }
  return out;
}

/** SRS006 + SRS007: more than one member of a system is active. */
export function srs006(g) {
  const out = [];
  const active = new Set(activeResources(g).map((r) => r.name));
  for (const [system, members] of Object.entries(SYSTEMS)) {
    if (system === 'sql') continue; // handled by SRS011
    const present = members.filter((m) => active.has(m));
    if (present.length < 2) continue;
    if (system === 'framework') {
      out.push({ rule: 'SRS007', severity: 'warning', message: `${present.length} frameworks are running: ${present.join(', ')}`, fix: 'run one framework; Qbox already provides the qb-core name' });
    } else {
      out.push({ rule: 'SRS006', severity: 'warning', message: `${present.length} ${system} systems are running: ${present.join(', ')}`, fix: `keep one ${system} system and point other resources at it` });
    }
  }
  return out;
}

/** SRS008: ensure [category] while members depend on each other. */
export function srs008(g) {
  const out = [];
  for (const c of g.categoryEnsures) {
    const members = new Set(c.members);
    const internal = [];
    for (const name of c.members) {
      const r = g.resolve(name);
      const myIdx = g.startIndex.get(name);
      const mine = g.startOrder[myIdx];
      if (!r || !mine || mine.category !== c.name) continue; // started earlier by its own line
      const declared = new Set(r.dependencies.map((d) => g.resolve(d.value)?.name).filter(Boolean));
      for (const imp of r.imports) {
        const t = g.resolve(imp.resource);
        if (!t || !members.has(t.name) || declared.has(t.name) || !importNeedsStarted(t, imp.path)) continue;
        const tIdx = g.startIndex.get(t.name);
        if (tIdx !== undefined && tIdx > myIdx && g.startOrder[tIdx].category === c.name) internal.push(`${name} needs ${t.name}`);
      }
    }
    if (internal.length) {
      out.push({ rule: 'SRS008', severity: 'warning', message: `'ensure ${c.name}' starts its resources alphabetically, so these start before what they need: ${internal.slice(0, 3).join('; ')}`, file: c.file, line: c.line, fix: `ensure those resources one by one in the right order instead of ensure ${c.name}` });
    }
  }
  return out;
}

/** SRS009: ensured but missing; installed but never started. */
export function srs009(g) {
  const out = [];
  for (const m of g.missingEnsures) {
    out.push({ rule: 'SRS009', severity: 'warning', message: `'${m.name}' is ensured, but no such resource is installed`, file: m.file, line: m.line, fix: 'remove the line or install the resource' });
  }
  if (g.hasCfg) {
    const idle = g.resources.filter((r) => !g.startIndex.has(r.name) && !r.provides.some((p) => g.startIndex.has(p)));
    if (idle.length) {
      out.push({ rule: 'SRS009', severity: 'info', message: `${idle.length} installed resource(s) are never started: ${idle.slice(0, 8).map((r) => r.name).join(', ')}${idle.length > 8 ? ', …' : ''}`, fix: 'remove unused resources to keep the server lean' });
    }
  }
  return out;
}

/** SRS010: manifest lint. */
export function srs010(g, inv) {
  const out = [];
  for (const r of g.resources) {
    if (r.legacyManifest) out.push({ rule: 'SRS010', severity: 'warning', resource: r.name, message: 'uses the legacy __resource.lua manifest', file: mfile(r), fix: "rename to fxmanifest.lua and add fx_version 'cerulean' and game 'gta5'" });
    else if (!r.manifest.first('fx_version')) out.push({ rule: 'SRS010', severity: 'warning', resource: r.name, message: 'manifest has no fx_version', file: mfile(r), fix: "add fx_version 'cerulean'" });
    if (r.manifest.first('resource_manifest_version')) out.push({ rule: 'SRS010', severity: 'info', resource: r.name, message: 'uses deprecated resource_manifest_version', file: mfile(r), fix: "replace with fx_version 'cerulean'" });
    for (const w of r.manifest.parseWarnings) out.push({ rule: 'SRS010', severity: 'warning', resource: r.name, message: `manifest could not be fully read: ${w}`, file: mfile(r) });
  }
  for (const f of inv.strayFolders) {
    out.push({ rule: 'SRS010', severity: 'info', message: `folder '${f}' has no fxmanifest.lua and isn't a [category], so FXServer ignores it`, fix: 'add a manifest, or wrap the folder name in [brackets] if it holds resources' });
  }
  return out;
}

/** SRS011: legacy SQL libraries next to oxmysql. */
export function srs011(g) {
  const active = new Set(activeResources(g).map((r) => r.name));
  const legacy = LEGACY_SQL.filter((l) => active.has(l) && (g.byName.get(l)?.[0]?.provides.length === 0));
  if (!legacy.length) return [];
  return [{ rule: 'SRS011', severity: 'info', message: `legacy SQL wrapper(s) running: ${legacy.join(', ')}${active.has('oxmysql') ? ' (next to oxmysql)' : ''}`, fix: 'move resources to oxmysql and remove the legacy wrapper' }];
}

/** SRS012: escrowed resources (code checks are partial). */
export function srs012(g) {
  const esc = activeResources(g).filter((r) => r.escrowed);
  if (!esc.length) return [];
  const unreadable = esc.filter((r) => readCode(r).encrypted > 0).length;
  return [{ rule: 'SRS012', severity: 'info', message: `${esc.length} escrowed resource(s) (${unreadable} with encrypted code); only their manifests and open files were checked: ${esc.slice(0, 6).map((r) => r.name).join(', ')}${esc.length > 6 ? ', …' : ''}` }];
}

/** SRS102: dependency cycles. */
export function srs102(g) {
  const { cycles } = suggestOrder(g);
  return cycles.map((c) => ({ rule: 'SRS102', severity: 'error', message: `dependency cycle: ${c.join(' → ')}`, fix: 'remove one of these dependencies; FXServer cannot start a cycle' }));
}

export const SERVER_RULES = [srs001, srs002, srs003, srs004, srs005, srs006, srs008, srs009, srs010, srs011, srs012, srs102];
