local QBCore = exports['qb-core']:GetCoreObject()
-- Building a shop list from config is not a useable-item callback.
local function BuildItems()
    local items = {}
    for _, item in pairs(Config.Items) do
        items[#items + 1] = { name = item.name, amount = tonumber(item.amount), info = item.info or {} }
    end
    return items
end
