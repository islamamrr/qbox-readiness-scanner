local QBCore = exports['qb-core']:GetCoreObject()
QBCore.Functions.Notify('Meter on', 'success')
if GetResourceState('cdn-fuel') == 'started' then local f = exports['cdn-fuel']:GetFuel(veh) end
pcall(function() exports['illenium-appearance']:setPedAppearance(PlayerPedId(), {}) end)
