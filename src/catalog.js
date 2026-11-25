// Known resource "systems". Two started members of one system usually conflict.
// Membership is by folder name only, so a provider (ox_target provides qtarget)
// is never counted twice for its own alias.

export const SYSTEMS = {
  framework: ['es_extended', 'qb-core', 'qbx_core', 'ND_Core', 'vrp'],
  inventory: ['ox_inventory', 'qb-inventory', 'ps-inventory', 'lj-inventory', 'qs-inventory', 'core_inventory', 'codem-inventory', 'jpr-inventory', 'origen_inventory', 'tgiann-inventory'],
  phone: ['lb-phone', 'qb-phone', 'gksphone', 'okokPhone', 'qs-smartphone', 'yseries', 'npwd'],
  target: ['ox_target', 'qb-target', 'qtarget', 'sleepless_interact'],
  voice: ['pma-voice', 'saltychat', 'tokovoip_script', 'mumble-voip'],
  sql: ['oxmysql', 'mysql-async', 'ghmattimysql'],
};

export const LEGACY_SQL = ['mysql-async', 'ghmattimysql'];

/** QBCore-named dependencies the Qbox bridge provides (docs.qbox.re/migrating/scripts). */
export const QBOX_BRIDGE_PROVIDES = [
  'qb-core', 'qb-vehiclekeys', 'qb-weathersync', 'qb-management', 'qb-mechanicjob',
  'qb-taxijob', 'qb-towjob', 'qb-truckerjob', 'qb-scrapyard', 'qb-lapraces', 'qb-npwd',
];

/** QBCore resources that the Qbox stack replaces outright (docs.qbox.re/migrating/resources). */
export const QBOX_REPLACED = {
  'qb-core': 'qbx_core',
  'qb-multicharacter': 'qbx_core (multicharacter is built in)',
  'connectqueue': 'qbx_core (the connection queue is built in)',
  'qb-spawn': 'qbx_spawn',
  'qb-inventory': 'ox_inventory',
  // qb-inventory forks: qbx_core only works with ox_inventory ("qb-inventory is not compatible with qbx_core")
  'ps-inventory': 'ox_inventory (Qbox only supports ox_inventory)',
  'lj-inventory': 'ox_inventory (Qbox only supports ox_inventory)',
  'qb-weapons': 'ox_inventory (weapons, ammo and attachments are items)',
  'qb-shops': 'ox_inventory (shops live in ox_inventory/data/shops.lua)',
  'qb-crafting': 'ox_inventory (benches live in ox_inventory/data/crafting.lua)',
  'qb-target': 'ox_target',
  'qb-menu': 'ox_lib menus',
  'qb-input': 'ox_lib input dialogs',
  'progressbar': 'ox_lib progress bars',
  'qb-loading': 'loadscreen',
  'qb-banking': 'Renewed-Banking',
  'qb-management': 'qbx_management and Renewed-Banking',
  'qb-clothing': 'illenium-appearance',
  'qb-apartments': 'qbx_properties',
  'qb-houses': 'qbx_properties',
  'qb-interior': 'qbx_properties',
  'qb-phone': 'NPWD with qbx_npwd',
  'qb-cityhall': 'qbx_cityhall and qbx_idcard',
  'qb-garages': 'qbx_garages and qbx_vehicles',
  'qb-vehicleshop': 'qbx_vehicleshop',
  'qb-vehiclesales': 'qbx_vehiclesales',
  'qb-vehiclekeys': 'qbx_vehiclekeys',
  'qb-fuel': 'ox_fuel',
  'qb-mechanicjob': 'qbx_mechanicjob',
  'qb-policejob': 'qbx_police',
  'qb-ambulancejob': 'qbx_ambulancejob and qbx_medical',
  'qb-prison': 'xt-prison',
  'qb-doorlock': 'ox_doorlock (converts qb-doorlock configs)',
  'qb-diving': 'qbx_diving and qbx_divegear',
  'qb-hud': 'qbx_hud',
  'qb-radialmenu': 'qbx_radialmenu',
  'qb-scoreboard': 'qbx_scoreboard',
  'qb-adminmenu': 'qbx_adminmenu',
  'qb-smallresources': 'qbx_smallresources',
  'qb-weathersync': 'Renewed-Weathersync',
  'qb-radio': 'mm_radio',
  // qb-<name> → qbx_<name>, same name
  ...Object.fromEntries(['busjob', 'garbagejob', 'newsjob', 'recyclejob', 'vineyard', 'taxijob', 'towjob', 'scrapyard',
    'lapraces', 'bankrobbery', 'jewelery', 'storerobbery', 'truckrobbery', 'houserobbery', 'drugs', 'weed', 'pawnshop',
    'streetraces'].map((n) => [`qb-${n}`, `qbx_${n}`])),
};

/** Resources that are part of the Qbox/ox stack itself; never audited for migration. */
export const QBOX_STACK = /^(qbx_|ox_|oxmysql$|pma-voice$|screenshot-basic$|npwd$)/;

/** Resources bundled with FXServer itself (citizen/system_resources), so they need no folder. */
export const BUILTIN = ['chat', 'monitor', 'webpack', 'yarn'];
