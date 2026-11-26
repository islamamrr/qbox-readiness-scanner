// QBCore -> Qbox migration readiness. Patterns follow Qbox's own migration docs:
// https://docs.qbox.re/migrating/scripts and https://docs.qbox.re/migrating/converting-resources

import { activeResources } from '../graph.js';
import { checksResourceState, grep, readCode } from '../code.js';
import { QBOX_BRIDGE_PROVIDES, QBOX_REPLACED, QBOX_STACK } from '../catalog.js';

/**
 * @typedef {'ok'|'adapt'|'incompatible'|'replace'|'unknown'|'none'} Verdict
 * @typedef {{id: string, level: 'adapt'|'incompatible', reason: string, replacement: string, hits: {file: string, line: number}[]}} QboxIssue
 * @typedef {{resource: string, verdict: Verdict, usesQBCore: boolean, partial: boolean, issues: QboxIssue[], note?: string}} QboxResult
 */

/** @type {{id: string, level: 'adapt'|'incompatible', re: RegExp, reason: string, replacement: string, requires?: RegExp}[]} */
export const PATTERNS = [
  { id: 'QBX-SQL-GROUPS', level: 'incompatible', re: /\bUPDATE\s+`?players`?\s+SET\s+[^'"\n]*\b(?:job|gang)\b/i, reason: 'writes job/gang data straight into the players table', replacement: 'exports.qbx_core:SetJob / AddPlayerToJob (Qbox keeps memberships in player_groups); direct writes corrupt group data' },
  { id: 'QBX-SQL-PLAYERS', level: 'adapt', re: /\b(?:UPDATE\s+`?players`?\s+SET\s+(?![^'"\n]*\b(?:job|gang)\b)|INSERT\s+INTO\s+`?players`?\b|DELETE\s+FROM\s+`?players`?\b|ALTER\s+TABLE\s+`?players`?\b)/i, reason: 'writes other core player data (money, inventory, metadata) with raw SQL', replacement: 'qbx_core exports for offline players; inventory belongs to ox_inventory' },
  { id: 'QBX-MULTIJOB', level: 'incompatible', re: /\bCREATE\s+TABLE[^\n]*multi_?jobs?\b|\b(?:FROM|INTO|UPDATE)\s+`?(?:player_jobs|multijobs?)`?\b/i, reason: 'keeps its own multijob tables', replacement: 'Qbox has built-in multijob: exports.qbx_core:AddPlayerToJob and setr qbx:max_jobs_per_player' },
  { id: 'QBX-INVENTORY', level: 'adapt', re: /exports\s*\[\s*['"]qb-inventory['"]\s*\]/, reason: 'calls qb-inventory exports', replacement: 'ox_inventory exports (e.g. exports.ox_inventory:AddItem)' },
  { id: 'QBX-INV-EVENTS', level: 'adapt', re: /['"]inventory:(?:server|client):[A-Za-z]+['"]/, reason: 'uses inventory:server/client events', replacement: 'ox_inventory exports and hooks' },
  { id: 'QBX-ITEM-EVENTS', level: 'adapt', re: /['"]QBCore:Server:(?:AddItem|RemoveItem|UseItem)['"]/, reason: 'uses QBCore:Server:AddItem/RemoveItem/UseItem events (Qbox only warns)', replacement: 'exports.ox_inventory:AddItem / RemoveItem' },
  { id: 'QBX-PLAYERDATA-ITEMS', level: 'adapt', re: /PlayerData(?:\s*\(\s*\))?\.items\b/, reason: 'reads PlayerData.items (empty on Qbox)', replacement: 'exports.ox_inventory:Search or GetItemCount' },
  { id: 'QBX-TARGET', level: 'adapt', re: /exports\s*\[\s*['"]qb-target['"]\s*\]/, reason: 'calls qb-target exports', replacement: "ox_target (job = 'police' becomes groups = { police = 0 })" },
  { id: 'QBX-MENU', level: 'adapt', re: /exports\s*\[\s*['"]qb-(?:menu|input)['"]\s*\]/, reason: 'calls qb-menu / qb-input', replacement: 'lib.registerContext / lib.inputDialog from ox_lib' },
  // QBCore.Functions.Progressbar is fine: the bridge handles it (docs.qbox.re/migrating/resources). Only the export fails.
  { id: 'QBX-PROGRESSBAR', level: 'adapt', re: /exports\s*\[\s*['"]progressbar['"]\s*\]|exports\.progressbar\s*[:.]/, reason: "calls exports['progressbar'] (no progressbar resource on Qbox)", replacement: 'lib.progressBar / lib.progressCircle from ox_lib, or QBCore.Functions.Progressbar' },
  { id: 'QBX-FUEL', level: 'adapt', re: /exports\s*\[\s*['"](?:LegacyFuel|qb-fuel|cdn-fuel)['"]\s*\]|exports\.LegacyFuel\s*[:.]/, reason: 'reads fuel through LegacyFuel / qb-fuel / cdn-fuel exports', replacement: 'Entity(vehicle).state.fuel' },
  { id: 'QBX-GRADES', level: 'adapt', re: /grades\s*\[\s*tostring\s*\(|grades\s*\[\s*['"]\d+['"]\s*\]/, reason: 'indexes job/gang grades with string keys', replacement: 'numeric grade keys: grades[grade]' },
  { id: 'QBX-ITEM-CALLBACK', level: 'adapt', re: /\bitem\.(?:amount|info)\b/, requires: /CreateUseableItem/, reason: 'useable-item callback reads item.amount / item.info', replacement: 'item.count / item.metadata' },
  { id: 'QBX-GOD-PERM', level: 'adapt', re: /Commands\.Add\s*\([^\n]*['"]god['"]/, reason: "registers a command with the 'god' permission (becomes group.god, which Qbox doesn't create by default)", replacement: "'admin' → group.admin (Qbox maps qbcore.god/admin/mod to group.admin/mod/support)" },
  { id: 'QBX-VEHICLE-SHOP', level: 'adapt', re: /Shared\.Vehicles[^\n]*\.shop\b/, reason: 'reads the shop field of QBCore.Shared.Vehicles (removed in Qbox)', replacement: 'qbx_core vehicle data / your own shop config' },
  { id: 'QBX-CORE-VERSION', level: 'adapt', re: /GetCoreVersion\s*\(/, reason: 'compares GetCoreVersion (returns the qbx_core version on Qbox)', replacement: 'check for qbx_core directly' },
];

/**
 * exports['qb-target'] etc. behind a GetResourceState('qb-target') (or isStarted('qb-target')) check is an optional integration:
 * multi-framework scripts (illenium-appearance, xt-prison) fall back to ox_target when it isn't running.
 */
function isOptionalExport(match, allText) {
  const m = /exports\s*(?:\[\s*['"]([^'"]+)['"]\s*\]|\.([A-Za-z_]\w*))/.exec(match);
  const name = m && (m[1] || m[2]);
  if (!name) return false;
  return checksResourceState(name, allText);
}

// qb-* resources Qbox replaces whose exports aren't covered elsewhere: not bridged, not handled by a
// specific pattern above, and not qb-phone (Renewed's phone still ships under that name).
const OWN_RULE = ['qb-core', 'qb-inventory', 'qb-target', 'qb-menu', 'qb-input', 'qb-phone'];
const REPLACED_EXPORT_NAMES = Object.keys(QBOX_REPLACED)
  .filter((n) => n.startsWith('qb-') && !OWN_RULE.includes(n) && !QBOX_BRIDGE_PROVIDES.includes(n));
const REPLACED_EXPORT = new RegExp(`exports\\s*\\[\\s*['"](${REPLACED_EXPORT_NAMES.map((n) => n.replace(/-/g, '\\-')).join('|')})['"]\\s*\\]`);

const QBCORE_USE = /GetCoreObject\s*\(|\bQBCore\.|exports\s*\[\s*['"]qb-core['"]\s*\]|['"]QBCore:(?:Client|Server):/;

/**
 * @param {import('../graph.js').Graph} g
 * @returns {QboxResult[]}
 */
export function qboxAudit(g) {
  /** @type {QboxResult[]} */
  const results = [];
  for (const r of activeResources(g, { allCopies: true })) {
    const copies = g.byName.get(r.name)?.length || 1;
    const label = copies > 1 ? r.relDir : r.name;
    if (QBOX_STACK.test(r.name)) continue;

    if (QBOX_REPLACED[r.name]) {
      results.push({ resource: label, verdict: 'replace', usesQBCore: true, partial: false, issues: [], note: `replaced by ${QBOX_REPLACED[r.name]}` });
      continue;
    }

    const code = readCode(r);
    const partial = r.escrowed && code.encrypted > 0;
    /** @type {QboxIssue[]} */
    const issues = [];

    // Manifest: qb-* dependencies the bridge doesn't provide.
    const badDeps = r.dependencies.filter((d) => /^qb-/.test(d.value) && !QBOX_BRIDGE_PROVIDES.includes(d.value));
    if (badDeps.length) {
      issues.push({
        id: 'QBX-DEPENDENCY', level: 'adapt',
        reason: `depends on ${badDeps.map((d) => d.value).join(', ')}, which the Qbox bridge doesn't provide`,
        replacement: badDeps.map((d) => `${d.value} → ${QBOX_REPLACED[d.value] || 'its Qbox version, or keep it installed'}`).join('; '),
        hits: badDeps.map((d) => ({ file: 'fxmanifest.lua', line: d.line })),
      });
    }

    const allText = code.files.map((f) => f.text).join('\n');

    // Exports of other replaced qb-* resources (e.g. qb-smallresources:HasHarness) error on Qbox.
    const gone = new Map();
    for (const h of grep(r, REPLACED_EXPORT)) {
      const name = h.groups[0];
      if (isOptionalExport(h.match, allText) || (g.providers.get(name)?.length)) continue;
      if (!gone.has(name)) gone.set(name, []);
      const hits = gone.get(name);
      if (!hits.some((x) => x.file === h.file && x.line === h.line)) hits.push({ file: h.file, line: h.line });
    }
    if (gone.size) {
      issues.push({
        id: 'QBX-REPLACED-EXPORTS', level: 'adapt',
        reason: `calls exports of ${[...gone.keys()].join(', ')}, which Qbox replaces`,
        replacement: [...gone.keys()].map((n) => `${n} → ${QBOX_REPLACED[n]}`).join('; '),
        hits: [...gone.values()].flat(),
      });
    }

    for (const p of PATTERNS) {
      // `requires` is checked per file: a hit only counts in a file that also has the context
      // (e.g. item.amount in a client config loop is not a useable-item callback).
      const okFiles = p.requires ? new Set(code.files.filter((f) => p.requires.test(f.text)).map((f) => f.rel)) : null;
      if (okFiles && okFiles.size === 0) continue;
      const seen = new Set();
      const hits = [];
      for (const h of grep(r, p.re)) {
        const key = `${h.file}:${h.line}`;
        if ((okFiles && !okFiles.has(h.file)) || seen.has(key)) continue; // one hit per line
        if (isOptionalExport(h.match, allText)) continue;
        seen.add(key);
        hits.push({ file: h.file, line: h.line });
      }
      if (hits.length) issues.push({ id: p.id, level: p.level, reason: p.reason, replacement: p.replacement, hits });
    }

    const usesQBCore = QBCORE_USE.test(allText) || r.dependencies.some((d) => d.value === 'qb-core') || r.imports.some((i) => i.resource === 'qb-core');

    /** @type {Verdict} */
    let verdict;
    if (issues.some((i) => i.level === 'incompatible')) verdict = 'incompatible';
    else if (issues.length) verdict = 'adapt';
    else if (code.files.length === 0 && (r.escrowed || code.encrypted > 0)) verdict = 'unknown';
    else if (usesQBCore) verdict = partial ? 'unknown' : 'ok';
    else verdict = partial ? 'unknown' : 'none';

    results.push({ resource: label, verdict, usesQBCore, partial, issues, ...(verdict === 'unknown' ? { note: 'escrowed: code is encrypted, only the manifest and open files were checked' } : {}) });
  }

  const rank = { incompatible: 0, adapt: 1, replace: 2, unknown: 3, ok: 4, none: 5 };
  return results.sort((a, b) => rank[a.verdict] - rank[b.verdict] || a.resource.localeCompare(b.resource));
}

/** Count verdicts. */
export function summarize(results) {
  const counts = { ok: 0, adapt: 0, incompatible: 0, replace: 0, unknown: 0, none: 0 };
  for (const r of results) counts[r.verdict]++;
  return counts;
}
