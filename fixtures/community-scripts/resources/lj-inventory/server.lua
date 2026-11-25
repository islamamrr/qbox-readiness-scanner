local QBCore = exports['qb-core']:GetCoreObject()
QBCore.Functions.CreateUseableItem('bag', function(source, item)
    print(item.amount, item.info)
end)
