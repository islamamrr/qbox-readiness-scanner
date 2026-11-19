if GetResourceState('qb-target') ~= 'started' then return end
function AddShopTarget(ped) exports['qb-target']:AddTargetEntity(ped, { options = {} }) end
