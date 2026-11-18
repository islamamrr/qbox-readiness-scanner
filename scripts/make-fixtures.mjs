import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';

const root = process.argv[2];
rmSync(root, { recursive: true, force: true });
const w = (p, s) => { const f = join(root, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, s); };
const fx = (extra = '') => `fx_version 'cerulean'\ngame 'gta5'\n${extra}`;

// --- qbcore-server: a typical QBCore server with one example of each problem
const S = 'qbcore-server';
w(`${S}/server.cfg`, `# Example QBCore server
endpoint_add_tcp "0.0.0.0:30120"
set mysql_connection_string "mysql://root@localhost/qbcore"

ensure police-job   # started before ox_lib on purpose
ensure ox_lib
ensure oxmysql
ensure qb-core
ensure [qb]
ensure [jobs]
ensure lb-phone
ensure ghost-resource
ensure fancy-hud
ensure car-dealer
ensure map-pack
ensure old-radio

exec permissions.cfg
exec missing.cfg
`);
w(`${S}/permissions.cfg`, `add_ace group.admin command allow\n`);

w(`${S}/resources/[standalone]/oxmysql/fxmanifest.lua`, fx(`server_script 'dist/build.js'\n`));
w(`${S}/resources/[standalone]/oxmysql/dist/build.js`, `// oxmysql build\n`);
w(`${S}/resources/[standalone]/ox_lib/fxmanifest.lua`, fx(`shared_script 'init.lua'\nlua54 'yes'\n`));
w(`${S}/resources/[standalone]/ox_lib/init.lua`, `-- ox_lib init\n`);
w(`${S}/resources/[standalone]/lb-phone/fxmanifest.lua`, fx(`client_script 'client.lua'\n`));
w(`${S}/resources/[standalone]/lb-phone/client.lua`, `print('phone')\n`);
w(`${S}/resources/[standalone]/map-pack/fxmanifest.lua`, fx(`this_is_a_map 'yes'\n`));

w(`${S}/resources/[qb]/qb-core/fxmanifest.lua`, fx(`description 'QBCore'\ndependencies {\n  'oxmysql',\n}\nshared_scripts { 'shared/jobs.lua' }\nserver_script 'server/main.lua'\n`));
w(`${S}/resources/[qb]/qb-core/shared/jobs.lua`, `QBShared = QBShared or {}\nQBShared.Jobs = {}\n`);
w(`${S}/resources/[qb]/qb-core/server/main.lua`, `QBCore = {}\nfunction QBCore.Functions.GetPlayer(src) end\n`);
w(`${S}/resources/[qb]/qb-inventory/fxmanifest.lua`, fx(`dependency 'qb-core'\nserver_script 'server.lua'\n`));
w(`${S}/resources/[qb]/qb-inventory/server.lua`, `local QBCore = exports['qb-core']:GetCoreObject()\n`);
w(`${S}/resources/[qb]/qb-target/fxmanifest.lua`, fx(`client_script 'client.lua'\n`));
w(`${S}/resources/[qb]/qb-target/client.lua`, `-- target\n`);
w(`${S}/resources/[qb]/qb-phone/fxmanifest.lua`, fx(`dependency 'qb-core'\nclient_script 'client.lua'\n`));
w(`${S}/resources/[qb]/qb-phone/client.lua`, `local QBCore = exports['qb-core']:GetCoreObject()\n`);
w(`${S}/resources/[qb]/qb-shops/fxmanifest.lua`, fx(`dependencies { 'qb-core', 'qb-inventory' }\nserver_script 'server.lua'\nclient_script 'client.lua'\n`));
w(`${S}/resources/[qb]/qb-shops/server.lua`, `local QBCore = exports['qb-core']:GetCoreObject()
RegisterNetEvent('qb-shops:server:buy', function(item, amount)
  local src = source
  -- exports['qb-inventory']:RemoveItem(src, 'old', 1)  (commented out: must not count)
  exports['qb-inventory']:AddItem(src, item, amount)
  exports['qb-inventory']:AddItem(src, 'receipt', 1)
  TriggerEvent('inventory:server:OpenInventory', 'shop', 'itemshop_1')
end)
`);
w(`${S}/resources/[qb]/qb-shops/client.lua`, `local QBCore = exports['qb-core']:GetCoreObject()
local items = QBCore.Functions.GetPlayerData().items
exports['qb-target']:AddBoxZone('shop', vector3(0,0,0), 1, 1, {}, {})
`);
// an old copy left behind -> duplicate name
w(`${S}/resources/[old]/qb-shops/fxmanifest.lua`, fx(`server_script 'server.lua'\n`));
w(`${S}/resources/[old]/qb-shops/server.lua`, `-- old copy\n`);

w(`${S}/resources/[jobs]/police-job/fxmanifest.lua`, fx(`shared_scripts {\n  '@ox_lib/init.lua',\n  'config.lua',\n}\nserver_script 'server.lua'\ndependency 'qb-core'\n`));
w(`${S}/resources/[jobs]/police-job/config.lua`, `Config = {}\n`);
w(`${S}/resources/[jobs]/police-job/server.lua`, `local QBCore = exports['qb-core']:GetCoreObject()
local function label(job, grade)
  return QBCore.Shared.Jobs[job].grades[tostring(grade)].name
end
QBCore.Commands.Add('cuffall', 'Cuff everyone', {}, false, function() end, 'god')
`);
w(`${S}/resources/[jobs]/my-multijob/fxmanifest.lua`, fx(`dependency 'qb-core'\nserver_script 'server.lua'\n`));
w(`${S}/resources/[jobs]/my-multijob/server.lua`, `local QBCore = exports['qb-core']:GetCoreObject()
MySQL.query([[CREATE TABLE IF NOT EXISTS multijobs (citizenid VARCHAR(50), job VARCHAR(50))]])
local function setJob(cid, job)
  MySQL.update('UPDATE players SET job = ? WHERE citizenid = ?', { job, cid })
end
`);
w(`${S}/resources/[jobs]/taxi-meter/fxmanifest.lua`, fx(`client_script 'client.lua'\n`));
w(`${S}/resources/[jobs]/taxi-meter/client.lua`, `local QBCore = exports['qb-core']:GetCoreObject()
QBCore.Functions.Notify('Meter on', 'success')
if GetResourceState('cdn-fuel') == 'started' then local f = exports['cdn-fuel']:GetFuel(veh) end
pcall(function() exports['illenium-appearance']:setPedAppearance(PlayerPedId(), {}) end)
`);
w(`${S}/resources/[jobs]/taxi-meter/bridge/esx.lua`, `local ESX = exports['es_extended']:getSharedObject()\n`);
w(`${S}/resources/[jobs]/my-multijob/server/offline.lua`, `MySQL.update('UPDATE players SET money = ? WHERE citizenid = ?', { m, cid })\n`);
w(`${S}/resources/[jobs]/garage-addon/fxmanifest.lua`, fx(`shared_script '@jobs-lib/shared.lua'\nclient_script 'client.lua'\n`));
w(`${S}/resources/[jobs]/garage-addon/client.lua`, `print('garage')\n`);
w(`${S}/resources/[jobs]/jobs-lib/fxmanifest.lua`, fx(`shared_script 'shared.lua'\n`));
w(`${S}/resources/[jobs]/jobs-lib/shared.lua`, `JobsLib = {}\n`);

// escrowed, encrypted code
w(`${S}/resources/[paid]/fancy-hud/fxmanifest.lua`, fx(`client_script 'client.lua'\nescrow_ignore { 'config.lua' }\ndependency '/assetpacks'\n`));
w(`${S}/resources/[paid]/fancy-hud/.fxap`, Buffer.from([0x46, 0x58, 0x41, 0x50, 0, 1, 2, 3]));
w(`${S}/resources/[paid]/fancy-hud/client.lua`, Buffer.from(Array.from({ length: 300 }, (_, i) => (i * 37) % 256)));

w(`${S}/resources/[paid]/car-dealer/fxmanifest.lua`, fx(`dependencies { 'qb-core', 'qb-vehicleshop' }\nserver_script 'server.lua'\n`));
w(`${S}/resources/[paid]/car-dealer/server.lua`, `local QBCore = exports['qb-core']:GetCoreObject()
local fuel = exports['ps-fuel']:GetFuel(veh)
local shop = QBCore.Shared.Vehicles['adder'].shop
`);
w(`${S}/resources/old-radio/__resource.lua`, `resource_manifest_version '44febabe-d386-4d18-afbe-5e627f4af937'\nclient_script 'client.lua'\n`);
w(`${S}/resources/old-radio/client.lua`, `print('radio')\n`);
w(`${S}/resources/notes/readme.txt`, `not a resource\n`);

// --- clean-qbox: a healthy Qbox server; should produce no errors
const Q = 'clean-qbox';
w(`${Q}/server.cfg`, `setr qbx:enableBridge "true"\nensure oxmysql\nensure ox_lib\nensure qbx_core\nensure ox_inventory\nensure ox_target\nensure taxi-meter\n`);
w(`${Q}/resources/[ox]/oxmysql/fxmanifest.lua`, fx(`server_script 'lib/MySQL.lua'\n`));
w(`${Q}/resources/[ox]/oxmysql/lib/MySQL.lua`, `MySQL = {}\n`);
w(`${Q}/resources/[ox]/ox_lib/fxmanifest.lua`, fx(`shared_script 'init.lua'\n`));
w(`${Q}/resources/[ox]/ox_lib/init.lua`, `-- init\n`);
w(`${Q}/resources/[ox]/ox_inventory/fxmanifest.lua`, fx(`dependencies { 'oxmysql', 'ox_lib' }\nshared_script '@ox_lib/init.lua'\n`));
w(`${Q}/resources/[ox]/ox_target/fxmanifest.lua`, fx(`provide 'qtarget'\ndependency 'ox_lib'\nshared_script '@ox_lib/init.lua'\n`));
w(`${Q}/resources/[qbx]/qbx_core/fxmanifest.lua`, fx(`provide 'qb-core'\ndependencies {\n  '/server:10731',\n  '/onesync',\n  'ox_lib',\n  'oxmysql',\n}\nshared_scripts { '@ox_lib/init.lua' }\nserver_scripts { '@oxmysql/lib/MySQL.lua', 'server/main.lua' }\n`));
w(`${Q}/resources/[qbx]/qbx_core/server/main.lua`, `-- core\n`);
w(`${Q}/resources/[jobs]/taxi-meter/fxmanifest.lua`, fx(`dependency 'qb-core'\nclient_script 'client.lua'\n`));
w(`${Q}/resources/[jobs]/taxi-meter/client.lua`, `local QBCore = exports['qb-core']:GetCoreObject()\nQBCore.Functions.Notify('Meter on', 'success')\n`);
console.log('fixtures written to', root);
