local QBCore = exports['qb-core']:GetCoreObject()
-- jim_bridge style: isStarted() wraps GetResourceState, so each bank is an optional integration
function isStarted(script) return GetResourceState(script):find('start') end
RegisterNetEvent('till:pay', function(job, amount)
    if isStarted('Renewed-Banking') then
        exports['Renewed-Banking']:addAccountMoney(job, amount)
    elseif isStarted("qb-banking") then
        exports["qb-banking"]:AddMoney(job, amount)
    elseif isStarted("okokBanking") then
        exports["okokBanking"]:AddMoney(job, amount)
    end
    print(QBCore.Functions.GetPlayer(source))
end)
