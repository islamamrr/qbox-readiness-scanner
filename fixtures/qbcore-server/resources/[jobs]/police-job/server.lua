local QBCore = exports['qb-core']:GetCoreObject()
local function label(job, grade)
  return QBCore.Shared.Jobs[job].grades[tostring(grade)].name
end
QBCore.Commands.Add('cuffall', 'Cuff everyone', {}, false, function() end, 'god')
