// Orchestrates a full scan and returns plain data (no printing).

import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildInventory } from './inventory.js';
import { parseCfg } from './cfg.js';
import { buildGraph, suggestOrder, activeResources } from './graph.js';
import { SERVER_RULES } from './rules/server.js';
import { qboxAudit, summarize } from './rules/qbox.js';

export const VERSION = '0.1.0';

/**
 * @param {{root: string, resourcesDir?: string, cfgPath?: string}} opts
 */
export function scan(opts) {
  const root = resolve(opts.root);
  const resourcesDir = resolve(opts.resourcesDir || (existsSync(join(root, 'resources')) ? join(root, 'resources') : root));
  if (!existsSync(resourcesDir) || !statSync(resourcesDir).isDirectory()) throw new Error(`resources folder not found: ${resourcesDir}`);

  const cfgPath = opts.cfgPath ? resolve(opts.cfgPath) : [join(root, 'server.cfg')].find((p) => existsSync(p));
  if (opts.cfgPath && !existsSync(cfgPath)) throw new Error(`server.cfg not found: ${cfgPath}`);

  const inv = buildInventory(resourcesDir);
  const cfg = cfgPath ? parseCfg(cfgPath, root) : null;
  const graph = buildGraph(inv.resources, cfg);

  /** @type {import('./rules/server.js').Finding[]} */
  const findings = [];
  for (const rule of SERVER_RULES) findings.push(...rule(graph, inv));
  if (cfg) {
    for (const m of cfg.missingExec) findings.push({ rule: 'SRS009', severity: 'warning', message: `exec '${m.path}' points to a file that doesn't exist`, file: m.file, line: m.line });
  }
  const sevRank = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => sevRank[a.severity] - sevRank[b.severity] || a.rule.localeCompare(b.rule));

  const qbox = qboxAudit(graph);
  const { order, cycles } = suggestOrder(graph);
  const currentOrder = graph.cfgOrder;
  const orderChanged = !!cfg && order.filter((n) => currentOrder.includes(n)).join('|') !== currentOrder.join('|');

  return {
    version: VERSION,
    scannedAt: new Date().toISOString(),
    paths: { root, resourcesDir, cfg: cfgPath || null, cfgFiles: cfg?.files || [] },
    stats: {
      resources: inv.resources.length,
      active: activeResources(graph).length,
      escrowed: inv.resources.filter((r) => r.escrowed).length,
      bridgeEnabled: cfg ? /^"?true"?$/i.test(cfg.convars['qbx:enableBridge'] || '') : null,
    },
    findings,
    qbox: { counts: summarize(qbox), results: qbox },
    ensure: { changed: orderChanged, order: cycles.length ? null : order },
  };
}
