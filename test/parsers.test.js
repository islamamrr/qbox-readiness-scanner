import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tokenize, stripLuaComments } from '../src/lua.js';
import { parseManifest, manifestDependencies, manifestImports } from '../src/manifest.js';
import { parseCfg } from '../src/cfg.js';

test('tokenizer handles long strings, comments and CfxLua syntax', () => {
  const t = tokenize("local a = [[x\ny]] -- c\n--[==[ block\n ]==] b += `hash` c?.d");
  const strings = t.filter((x) => x.type === 'string').map((x) => x.value);
  assert.deepEqual(strings, ['x\ny']);
  assert.equal(t.filter((x) => x.type === 'comment').length, 2);
  assert.ok(t.some((x) => x.value === '+='));
  assert.ok(t.some((x) => x.value === '?.'));
});

test('stripLuaComments keeps line numbers and code', () => {
  const src = "a = 1 -- exports['qb-inventory']\n--[[\nexports['qb-target']\n]]\nb = 2";
  const out = stripLuaComments(src);
  assert.equal(out.split('\n').length, src.split('\n').length);
  assert.ok(!out.includes('qb-inventory'));
  assert.ok(!out.includes('qb-target'));
  assert.ok(out.includes('b = 2'));
});

test('manifest: plural tables expand to singular keys', () => {
  const m = parseManifest(`fx_version 'cerulean'
dependencies {
  '/server:10731',
  '/onesync',
  'ox_lib',
  "oxmysql",
}
shared_scripts { '@ox_lib/init.lua', 'config.lua' }
server_script '@oxmysql/lib/MySQL.lua'
provide 'qb-core'
`);
  assert.equal(m.first('fx_version'), 'cerulean');
  assert.deepEqual(manifestDependencies(m).map((d) => d.value), ['ox_lib', 'oxmysql']);
  assert.deepEqual(manifestImports(m).map((i) => i.resource), ['ox_lib', 'oxmysql']);
  assert.deepEqual(m.get('provide').map((p) => p.value), ['qb-core']);
});

test("manifest: key 'value' {table} form and keyed tables don't leak values", () => {
  const m = parseManifest(`fx_version 'cerulean'
my_data 'thing' { nested = 'no', 'also-no' }
ox_libs { 'locale' }
dependency 'pma-voice'
files { ['web/index.html'] = 'x', 'web/app.js' }
`);
  assert.equal(m.first('my_data'), 'thing');
  assert.deepEqual(m.get('dependency').map((d) => d.value), ['pma-voice']);
  assert.deepEqual(m.get('file').map((d) => d.value), ['web/app.js']);
});

test('manifest: call form and line numbers', () => {
  const m = parseManifest("fx_version('cerulean')\n\ndependency('qb-core')");
  assert.equal(m.first('fx_version'), 'cerulean');
  assert.equal(m.get('dependency')[0].line, 3);
});

test('cfg: comments, quotes, exec and categories', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qrs-'));
  writeFileSync(join(dir, 'server.cfg'), `# comment
ensure "ox_lib" # trailing
start qb-core
// another comment
ensure [jobs]
stop old
setr qbx:enableBridge "true"
set sv_hostname "My # server"
exec extra.cfg
exec nope.cfg
`);
  writeFileSync(join(dir, 'extra.cfg'), 'ensure late-one\n');
  const cfg = parseCfg(join(dir, 'server.cfg'), dir);
  assert.deepEqual(cfg.commands.map((c) => `${c.action}:${c.name}`), ['ensure:ox_lib', 'start:qb-core', 'ensure:[jobs]', 'stop:old', 'ensure:late-one']);
  assert.equal(cfg.commands[2].category, true);
  assert.equal(cfg.convars['qbx:enableBridge'], 'true');
  assert.equal(cfg.convars['sv_hostname'], 'My # server');
  assert.equal(cfg.missingExec.length, 1);
  assert.equal(cfg.commands[4].file, 'extra.cfg');
});
