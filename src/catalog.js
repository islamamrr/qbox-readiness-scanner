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

/** QBCore resources that the Qbox stack replaces outright. */
export const QBOX_REPLACED = {
  'qb-core': 'qbx_core',
  'qb-inventory': 'ox_inventory',
  'qb-target': 'ox_target',
  'qb-menu': 'ox_lib menus',
  'qb-input': 'ox_lib input dialogs',
  'progressbar': 'ox_lib progress bars',
  'qb-multicharacter': 'qbx_core (multicharacter is built in)',
  'connectqueue': 'qbx_core (the connection queue is built in)',
};

/** Resources that are part of the Qbox/ox stack itself; never audited for migration. */
export const QBOX_STACK = /^(qbx_|ox_|oxmysql$|pma-voice$|screenshot-basic$|npwd$)/;
