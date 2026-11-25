local QBCore = exports['qb-core']:GetCoreObject()
-- exports the bridge or a provider covers are fine
local jobs = Config.useRenewedPhone and exports['qb-phone']:getJobs('ABC123')
exports['qb-management']:AddMoney('police', 100)
print(jobs, QBCore.Functions.GetPlayer(1))
