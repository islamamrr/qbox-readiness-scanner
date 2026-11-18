fx_version 'cerulean'
game 'gta5'
provide 'qb-core'
dependencies {
  '/server:10731',
  '/onesync',
  'ox_lib',
  'oxmysql',
}
shared_scripts { '@ox_lib/init.lua' }
server_scripts { '@oxmysql/lib/MySQL.lua', 'server/main.lua' }
