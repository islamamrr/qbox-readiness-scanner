local QBCore = exports['qb-core']:GetCoreObject()
RegisterNetEvent('qb-shops:server:buy', function(item, amount)
  local src = source
  -- exports['qb-inventory']:RemoveItem(src, 'old', 1)  (commented out: must not count)
  exports['qb-inventory']:AddItem(src, item, amount)
  exports['qb-inventory']:AddItem(src, 'receipt', 1)
  TriggerEvent('inventory:server:OpenInventory', 'shop', 'itemshop_1')
end)
