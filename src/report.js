// Console and JSON reporters for the free tier.
// The free tier reports each Qbox issue with its reason and how often it occurs;
// file/line locations and replacement code are part of Pro.

const useColor = (stream) => !process.env.NO_COLOR && !!stream.isTTY;

export function palette(enabled) {
  const wrap = (code) => (s) => (enabled ? `\x1b[${code}m${s}\x1b[0m` : String(s));
  return { red: wrap('31'), yellow: wrap('33'), green: wrap('32'), cyan: wrap('36'), magenta: wrap('35'), dim: wrap('2'), bold: wrap('1') };
}

/** Strip Pro-only detail from a scan result. */
export function toFreeResult(result) {
  return {
    ...result,
    qbox: {
      counts: result.qbox.counts,
      results: result.qbox.results.map((r) => ({
        resource: r.resource,
        verdict: r.verdict,
        partial: r.partial,
        ...(r.note ? { note: r.note } : {}),
        issues: r.issues.map((i) => ({ id: i.id, level: i.level, reason: i.reason, count: i.hits.length })),
      })),
    },
  };
}

const VERDICT_LABEL = {
  incompatible: 'incompatible',
  adapt: 'adapt',
  replace: 'replace',
  unknown: 'unknown',
  ok: 'bridge-OK',
  none: 'no QBCore use',
};

/**
 * @param {ReturnType<typeof import('./scan.js').scan>} result
 * @param {{color?: boolean, all?: boolean, stream?: NodeJS.WriteStream}} [opts]
 */
export function renderConsole(result, opts = {}) {
  const stream = opts.stream || process.stdout;
  const c = palette(opts.color ?? useColor(stream));
  const lines = [];
  const L = (s = '') => lines.push(s);
  const vColor = { incompatible: c.red, adapt: c.yellow, replace: c.magenta, unknown: c.dim, ok: c.green, none: c.dim };
  const sColor = { error: c.red, warning: c.yellow, info: c.cyan };

  const s = result.stats;
  L(c.bold(`Qbox Readiness Scanner v${result.version}`));
  L(c.dim(`${s.resources} resources found, ${s.active} active${result.paths.cfg ? ` (from ${result.paths.cfgFiles.join(', ')})` : ' (no server.cfg: checking every resource)'}, ${s.escrowed} escrowed`));
  L();

  // Qbox readiness
  const k = result.qbox.counts;
  L(c.bold('QBOX READINESS'));
  L(`  ${c.red(`${k.incompatible} incompatible`)}  ${c.yellow(`${k.adapt} adapt`)}  ${c.magenta(`${k.replace} replace`)}  ${c.dim(`${k.unknown} unknown`)}  ${c.green(`${k.ok} bridge-OK`)}  ${c.dim(`${k.none} no QBCore use`)}`);
  const shown = result.qbox.results.filter((r) => opts.all || !['ok', 'none'].includes(r.verdict));
  const width = Math.min(28, Math.max(10, ...shown.map((r) => r.resource.length)));
  for (const r of shown) {
    const label = vColor[r.verdict](VERDICT_LABEL[r.verdict].padEnd(14));
    const why = r.issues.length
      ? r.issues.map((i) => `${i.reason}${i.hits.length > 1 && i.id !== 'QBX-DEPENDENCY' ? ` (${i.hits.length}×)` : ''}`).join('; ')
      : r.note || (r.verdict === 'ok' ? 'uses QBCore through APIs the bridge covers' : '');
    L(`  ${label} ${r.resource.padEnd(width)}  ${c.dim(why)}`);
  }
  if (!opts.all && k.ok + k.none > 0) L(c.dim(`  … ${k.ok + k.none} more are bridge-OK or don't use QBCore (show them with --all)`));
  if (result.stats.bridgeEnabled === false && k.ok > 0) L(c.yellow(`  note: setr qbx:enableBridge "true" is not set; bridge-OK resources need it on Qbox`));
  L();

  // Server checks
  const f = result.findings;
  const n = (sev) => f.filter((x) => x.severity === sev).length;
  L(c.bold('SERVER CHECKS') + c.dim(`  ${n('error')} errors · ${n('warning')} warnings · ${n('info')} info`));
  if (!f.length) L(c.green('  no problems found'));
  for (const x of f) {
    const where = x.file ? c.dim(` [${x.resource ? x.resource + '/' : ''}${x.file}${x.line ? ':' + x.line : ''}]`) : '';
    L(`  ${sColor[x.severity](x.severity.toUpperCase().padEnd(7))} ${c.dim(x.rule)} ${x.resource ? c.bold(x.resource) + ' ' : ''}${x.message}${where}`);
    if (x.fix) L(`          ${c.dim('→ ' + x.fix)}`);
  }
  L();

  // Ensure order
  if (result.ensure.changed && result.ensure.order) {
    L(c.bold('SUGGESTED START ORDER') + c.dim('  (paste into server.cfg in place of your ensure lines)'));
    for (const name of result.ensure.order) L(`  ensure ${name}`);
    L();
  }

  L(c.dim('Read-only, offline scan. Report a wrong verdict: https://github.com/islamamrr/qbox-readiness-scanner/issues'));
  return lines.join('\n');
}

export function renderJson(result) {
  return JSON.stringify(toFreeResult(result), null, 2);
}
