-- ox_lib init (trimmed): the real file refuses to load before ox_lib is started
if GetResourceState('ox_lib') ~= 'started' then
    error('^1ox_lib must be started before this resource.^0', 0)
end
