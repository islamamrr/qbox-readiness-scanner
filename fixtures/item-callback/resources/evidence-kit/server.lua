local QBCore = exports['qb-core']:GetCoreObject()
QBCore.Functions.CreateUseableItem('moneybag', function(source, item)
    local Player = QBCore.Functions.GetPlayer(source)
    if not item.info or item.info == '' then return end
    Player.Functions.AddMoney('cash', tonumber(item.info.cash))
end)
