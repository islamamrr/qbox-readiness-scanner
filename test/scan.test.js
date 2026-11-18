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
    'SRS005:qb-shops',     // two folders
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
  assert.equal(verdict(qb, '[qb]/qb-shops'), 'adapt');
  assert.equal(verdict(qb, 'police-job'), 'adapt');
  assert.equal(verdict(qb, 'car-dealer'), 'adapt');
  assert.equal(verdict(qb, 'qb-inventory'), 'replace');
  assert.equal(verdict(qb, 'fancy-hud'), 'unknown');
  assert.equal(verdict(qb, 'taxi-meter'), 'ok');
  assert.equal(verdict(qb, 'map-pack'), 'none');
});

test('commented-out code is ignored', () => {
  const shops = qb.qbox.results.find((x) => x.resource === '[qb]/qb-shops');
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
  const shops = json.qbox.results.find((x) => x.resource === '[qb]/qb-shops');
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
