const CONSTANTS = require("../constants");
const { fetchWithCache } = require("./cacheManager");
const { getChannel } = require("../providers/channelProvider");

const fetchOrGetChannel = async (filters = {}) => {
  const result = await fetchWithCache({
    cacheKey: CONSTANTS.CACHE_CHANNEL_PREFIX,
    ttl: CONSTANTS.CACHE_CHANNEL_TTL,
    providerFn: getChannel,
    label: "fetchChannel",
    filters,
  });

  if (!result) {
    return result; // either false or an object with invalid data
  }

  let filteredData = result;

  if ("channelId" in filters) {
    filteredData = filteredData.filter((item) => item.id === filters.channelId);
  }

  if ("isGainExp" in filters) {
    filteredData = filteredData.filter(
      (item) => item.is_active === filters.isGainExp
    );
  }

  return filteredData;
};

module.exports = {
  fetchOrGetChannel,
};
