import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { scan } from '../src/scan.js';
import { renderConsole, renderJson } from '../src/report.js';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const qb = scan({ root: join(fixtures, 'qbcore-server') });
const clean = scan({ root: join(fixtures, 'clean-qbox') });

const rules = (r) => r.findings.map((f) => `${f.rule}:${f.resource ?? '-'}`);
const verdict = (r, name) => r.qbox.results.find((x) => x.resource === name)?.verdict;

test('clean Qbox server has no findings and no false Qbox issues', () => {
  assert.deepEqual(clean.findings, []);
  assert.equal(clean.qbox.counts.adapt + clean.qbox.counts.incompatible, 0);
  assert.equal(verdict(clean, 'taxi-meter'), 'ok');
  assert.equal(clean.ensure.changed, false);
  assert.equal(clean.stats.bridgeEnabled, true);
});

test('server checks find each planted problem', () => {
  const found = rules(qb);
  for (const expected of [
    'SRS001:car-dealer',   // qb-vehicleshop missing
    'SRS002:police-job',   // @ox_lib imported, ox_lib ensured later
    'SRS005:corner-shop',     // two folders
    'SRS004:car-dealer',   // exports['ps-fuel'] missing
    'SRS006:-',            // lb-phone + qb-phone
    'SRS008:-',            // [jobs] alphabetical order
    'SRS009:-',            // ghost-resource, missing.cfg
    'SRS010:old-radio',    // legacy manifest
    'SRS012:-',            // escrowed fancy-hud
  ]) assert.ok(found.includes(expected), `missing ${expected} in ${found.join(', ')}`);
});

test('no false positives on resources that are fine', () => {
  const noisy = qb.findings.filter((f) => ['taxi-meter', 'qb-core', 'map-pack', 'jobs-lib'].includes(f.resource));
  assert.deepEqual(noisy, []);
  // /assetpacks style constraints are not dependencies
  assert.ok(!qb.findings.some((f) => f.message.includes('/assetpacks')));
});

test('optional integrations (GetResourceState, pcall, bridge folders) are not flagged', () => {
  assert.ok(!qb.findings.some((f) => f.rule === 'SRS004' && f.resource === 'taxi-meter'));
});

test('job writes are incompatible, other raw player writes only need adapting', () => {
  const mj = qb.qbox.results.find((x) => x.resource === 'my-multijob');
  const ids = mj.issues.map((i) => i.id);
  assert.ok(ids.includes('QBX-SQL-GROUPS'));
  assert.ok(ids.includes('QBX-SQL-PLAYERS'));
  assert.equal(mj.issues.find((i) => i.id === 'QBX-SQL-GROUPS').level, 'incompatible');
  assert.equal(mj.issues.find((i) => i.id === 'QBX-SQL-PLAYERS').level, 'adapt');
});

test('Qbox verdicts', () => {
  assert.equal(verdict(qb, 'my-multijob'), 'incompatible');
  assert.equal(verdict(qb, '[qb]/corner-shop'), 'adapt');
  assert.equal(verdict(qb, 'police-job'), 'adapt');
  assert.equal(verdict(qb, 'car-dealer'), 'adapt');
  assert.equal(verdict(qb, 'qb-inventory'), 'replace');
  assert.equal(verdict(qb, 'fancy-hud'), 'unknown');
  assert.equal(verdict(qb, 'taxi-meter'), 'ok');
  assert.equal(verdict(qb, 'map-pack'), 'none');
});

test('commented-out code is ignored', () => {
  const shops = qb.qbox.results.find((x) => x.resource === '[qb]/corner-shop');
  const inv = shops.issues.find((i) => i.id === 'QBX-INVENTORY');
  assert.equal(inv.hits.length, 2);
});

test('suggested order puts ox_lib before police-job and jobs-lib before garage-addon', () => {
  const o = qb.ensure.order;
  assert.ok(qb.ensure.changed);
  assert.ok(o.indexOf('ox_lib') < o.indexOf('police-job'));
  assert.ok(o.indexOf('jobs-lib') < o.indexOf('garage-addon'));
  assert.ok(o.indexOf('oxmysql') < o.indexOf('qb-core'));
});

test('free JSON has counts but no file/line locations', () => {
  const json = JSON.parse(renderJson(qb));
  const shops = json.qbox.results.find((x) => x.resource === '[qb]/corner-shop');
  const inv = shops.issues.find((i) => i.id === 'QBX-INVENTORY');
  assert.equal(inv.count, 2);
  assert.equal(inv.hits, undefined);
  assert.equal(inv.replacement, undefined);
});

test('console report renders without color codes when disabled', () => {
  const out = renderConsole(qb, { color: false });
  assert.ok(out.includes('QBOX READINESS'));
  assert.ok(!out.includes('\x1b['));
});

test('useable-item rule only counts files with a callback, once per line', () => {
  const r = scan({ root: join(fixtures, 'item-callback') });
  const kit = r.qbox.results.find((x) => x.resource === 'evidence-kit');
  const cb = kit.issues.find((i) => i.id === 'QBX-ITEM-CALLBACK');
  assert.deepEqual(cb.hits, [{ file: 'server.lua', line: 4 }, { file: 'server.lua', line: 5 }]);
});

test('plain @imports and FXServer built-ins (chat, yarn) are not reported', () => {
  const r = scan({ root: join(fixtures, 'recipe-order') });
  assert.deepEqual(r.findings.filter((f) => f.resource !== 'appearance'), []);
  assert.equal(r.ensure.order[0], 'chat'); // suggested ensure lines keep built-ins
});

test('exports behind a GetResourceState check are optional, unguarded ones still count', () => {
  const r = scan({ root: join(fixtures, 'recipe-order') });
  const app = r.qbox.results.find((x) => x.resource === 'appearance');
  assert.deepEqual(app.issues.map((i) => i.id), ['QBX-INVENTORY']);
});

test("'god' commands point at group.admin, which Qbox creates by default", () => {
  const r = scan({ root: join(fixtures, 'item-callback') });
  const god = r.qbox.results.find((x) => x.resource === 'admin-tools').issues.find((i) => i.id === 'QBX-GOD-PERM');
  assert.ok(god.replacement.includes('group.admin'));
});

test('install-note folders and nested resource copies inside a resource are not scanned', () => {
  const r = scan({ root: join(fixtures, 'docs-folder') });
  const h = r.qbox.results.find((x) => x.resource === 'housing');
  assert.equal(h.verdict, 'none');
  assert.deepEqual(r.findings.filter((f) => f.rule === 'SRS004'), []);
});

test('QBCore.Functions.Progressbar is bridge-OK; only the progressbar export needs work; stock qb-* resources are replaced', () => {
  const r = scan({ root: join(fixtures, 'bridge-calls') });
  assert.equal(verdict(r, 'crafting-table'), 'ok');
  assert.equal(verdict(r, 'old-bars'), 'adapt');
  const g = r.qbox.results.find((x) => x.resource === 'qb-garages');
  assert.equal(g.verdict, 'replace');
  assert.ok(g.note.includes('qbx_garages'));
});

test('qb-inventory forks are replaced by ox_inventory', () => {
  const r = scan({ root: join(fixtures, 'community-scripts') });
  assert.equal(verdict(r, 'lj-inventory'), 'replace');
  assert.ok(r.qbox.results.find((x) => x.resource === 'lj-inventory').note.includes('ox_inventory'));
});

test('exports of replaced qb-* resources need adapting unless guarded, bridged or provided', () => {
  const r = scan({ root: join(fixtures, 'community-scripts') });
  const hud = r.qbox.results.find((x) => x.resource === 'street-hud');
  assert.equal(hud.verdict, 'adapt');
  const ex = hud.issues.find((i) => i.id === 'QBX-REPLACED-EXPORTS');
  assert.ok(ex.reason.includes('qb-smallresources'));
  assert.ok(!ex.reason.includes('qb-radialmenu')); // guarded by GetResourceState; the commented line is ignored
  assert.deepEqual(ex.hits, [{ file: 'client.lua', line: 4 }]);
  assert.equal(verdict(r, 'bank-app'), 'ok'); // qb-management is bridged, qb-phone is left alone
});

test('isStarted() guards (jim_bridge style) count as optional integrations', () => {
  const r = scan({ root: join(fixtures, 'community-scripts') });
  assert.equal(verdict(r, 'till-payments'), 'ok'); // qb-banking only behind isStarted("qb-banking")
  const banks = r.findings.filter((f) => f.rule === 'SRS004' && f.resource === 'till-payments' && !f.message.includes("'qb-core'"));
  assert.deepEqual(banks, []); // qb-banking / okokBanking / Renewed-Banking are all optional here
});
