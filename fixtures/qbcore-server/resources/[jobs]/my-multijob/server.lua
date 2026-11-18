local QBCore = exports['qb-core']:GetCoreObject()
MySQL.query([[CREATE TABLE IF NOT EXISTS multijobs (citizenid VARCHAR(50), job VARCHAR(50))]])
local function setJob(cid, job)
  MySQL.update('UPDATE players SET job = ? WHERE citizenid = ?', { job, cid })
end
