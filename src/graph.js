// Turns inventory + cfg into a resource graph with an effective start order.

/**
 * @typedef {import('./inventory.js').Resource} Resource
 * @typedef {import('./cfg.js').ParsedCfg} ParsedCfg
 * @typedef {{name: string, by: {file: string, line: number}|null, via: 'cfg'|'category'|'dependency', category?: string}} StartEntry
 * @typedef {{
 *   resources: Resource[], byName: Map<string, Resource[]>, providers: Map<string, Resource[]>,
 *   hasCfg: boolean, startOrder: StartEntry[], cfgOrder: string[], startIndex: Map<string, number>,
 *   missingEnsures: {name: string, file: string, line: number}[],
 *   categoryEnsures: {name: string, file: string, line: number, members: string[]}[],
 *   resolve: (name: string) => Resource | undefined,
 *   isStarted: (name: string) => boolean,
 * }} Graph
 */

/**
 * @param {Resource[]} resources
 * @param {ParsedCfg|null} cfg
 * @returns {Graph}
 */
export function buildGraph(resources, cfg) {
  const byName = new Map();
  const providers = new Map();
  for (const r of resources) {
    if (!byName.has(r.name)) byName.set(r.name, []);
    byName.get(r.name).push(r);
    for (const p of r.provides) {
      if (!providers.has(p)) providers.set(p, []);
      providers.get(p).push(r);
    }
  }

  const resolve = (name) => byName.get(name)?.[0] ?? providers.get(name)?.[0];

  /** @type {StartEntry[]} */
  let startOrder = [];
  /** names in the order the cfg asks for them, before FXServer pulls dependencies forward */
  let cfgOrder = [];
  const missingEnsures = [];
  const categoryEnsures = [];

  if (cfg) {
    for (const c of cfg.commands) {
      if (c.action === 'stop') {
        startOrder = startOrder.filter((s) => s.name !== c.name);
        continue;
      }
      if (c.category) {
        const members = resources.filter((r) => r.categories.includes(c.name)).map((r) => r.name);
        categoryEnsures.push({ name: c.name, file: c.file, line: c.line, members });
        for (const m of members) {
          if (!startOrder.some((s) => s.name === m)) startOrder.push({ name: m, by: { file: c.file, line: c.line }, via: 'category', category: c.name });
        }
        if (members.length === 0) missingEnsures.push({ name: c.name, file: c.file, line: c.line });
        continue;
      }
      const res = resolve(c.name);
      if (!res) {
        missingEnsures.push({ name: c.name, file: c.file, line: c.line });
        continue;
      }
      if (!startOrder.some((s) => s.name === res.name)) startOrder.push({ name: res.name, by: { file: c.file, line: c.line }, via: 'cfg' });
    }

    // FXServer starts declared dependencies before the resource that needs them.
    const expanded = [];
    const placed = new Set();
    const place = (name, stack) => {
      if (placed.has(name) || stack.has(name)) return;
      const res = resolve(name);
      if (!res) return;
      stack.add(name);
      for (const d of res.dependencies) {
        const dep = resolve(d.value);
        if (dep && !placed.has(dep.name)) {
          const existing = startOrder.find((s) => s.name === dep.name);
          place(dep.name, stack);
          if (!existing && !expanded.some((s) => s.name === dep.name)) expanded.push({ name: dep.name, by: null, via: 'dependency' });
        }
      }
      stack.delete(name);
      if (!placed.has(res.name)) {
        placed.add(res.name);
        const entry = startOrder.find((s) => s.name === res.name);
        if (entry && !expanded.includes(entry)) expanded.push(entry);
      }
    };
    for (const s of startOrder) place(s.name, new Set());
    // dependency-only entries were pushed before their dependents; keep that order
    cfgOrder = startOrder.map((s) => s.name);
    startOrder = expanded;
  }

  const startIndex = new Map(startOrder.map((s, i) => [s.name, i]));

  return {
    resources,
    byName,
    providers,
    hasCfg: !!cfg,
    startOrder,
    cfgOrder,
    startIndex,
    missingEnsures,
    categoryEnsures,
    resolve,
    isStarted: (name) => {
      const r = resolve(name);
      return !!r && startIndex.has(r.name);
    },
  };
}

/**
 * Resources that matter for checks: started ones when a cfg exists, otherwise all.
 * @param {Graph} g
 */
export function activeResources(g, { allCopies = false } = {}) {
  const pick = (r) => allCopies || g.byName.get(r.name)?.[0] === r;
  if (!g.hasCfg) return g.resources.filter(pick);
  return g.resources.filter((r) => g.startIndex.has(r.name) && pick(r));
}

/**
 * Suggested start order: a stable topological sort over declared deps + imports,
 * keeping the owner's order wherever it is already valid.
 * @param {Graph} g
 * @returns {{order: string[], cycles: string[][]}}
 */
export function suggestOrder(g) {
  const nodes = g.hasCfg
    ? [...g.cfgOrder, ...g.startOrder.map((s) => s.name).filter((n) => !g.cfgOrder.includes(n))]
    : g.resources.map((r) => r.name);
  const nodeSet = new Set(nodes);
  const needs = new Map();
  for (const name of nodes) {
    const r = g.resolve(name);
    const reqs = new Set();
    if (r) {
      for (const d of [...r.dependencies.map((x) => x.value), ...r.imports.map((x) => x.resource)]) {
        const dep = g.resolve(d);
        if (dep && dep.name !== name && nodeSet.has(dep.name)) reqs.add(dep.name);
      }
    }
    needs.set(name, reqs);
  }

  const order = [];
  const done = new Set();
  const visiting = new Set();
  const cycles = [];
  const visit = (name, path) => {
    if (done.has(name)) return;
    if (visiting.has(name)) {
      const from = path.indexOf(name);
      cycles.push([...path.slice(from), name]);
      return;
    }
    visiting.add(name);
    const deps = [...(needs.get(name) || [])].sort((a, b) => nodes.indexOf(a) - nodes.indexOf(b));
    for (const d of deps) visit(d, [...path, name]);
    visiting.delete(name);
    done.add(name);
    order.push(name);
  };
  for (const n of nodes) visit(n, []);
  return { order, cycles };
}
