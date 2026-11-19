if GetResourceState('ox_target') ~= 'started' then return end
function AddShopTarget(ped) exports.ox_target:addLocalEntity(ped, {}) end
