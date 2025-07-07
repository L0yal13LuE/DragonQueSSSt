const CONSTANTS = require("../constants");
const { getRarity } = require("../providers/rarityProvider");
const { getChannel } = require("../providers/channelProvider");
const { getMaterialByChannel } = require("../providers/materialProvider");
const {
  getCachedData,
  saveCachedData,
  deleteCachedData,
} = require("../providers/cacheProvider");

const fetchWithCache = async ({
  cacheKey,
  ttl,
  providerFn,
  label = "fetchWithCache",
  filters = {},
}) => {
  try {
    let directoryPath = null;
    if(cacheKey == CONSTANTS.CACHE_MATERIAL_CHANNEL_PREFIX) directoryPath = 'MASTER';
    if(cacheKey == CONSTANTS.CACHE_CHANNEL_PREFIX) directoryPath = 'MASTER';
    if(cacheKey == CONSTANTS.CACHE_RARITIES_PREFIX) directoryPath = 'MASTER';

    const cachedResult = await getCachedData(cacheKey, directoryPath);

    if (cachedResult) {
      return cachedResult;
    }

    const result = await providerFn();

    if (!result) {
      return false;
    }

    saveCachedData(cacheKey, result, ttl, directoryPath);

    return result;
  } catch (error) {
    console.error(`Unexpected error in ${label}:`, error);
    return { data: null, count: 0, error };
  }
};

const setCachedDataOnStartUp = async () => {
  try {
    await fetchWithCache({
      cacheKey: CONSTANTS.CACHE_RARITIES_PREFIX,
      ttl: CONSTANTS.CACHE_RARITIES_TTL,
      providerFn: getRarity,
      label: "fetchRarity",
    });

    await fetchWithCache({
      cacheKey: CONSTANTS.CACHE_CHANNEL_PREFIX,
      ttl: CONSTANTS.CACHE_CHANNEL_TTL,
      providerFn: getChannel,
      label: "fetchChannel",
    });

    await fetchWithCache({
      cacheKey: CONSTANTS.CACHE_MATERIAL_CHANNEL_PREFIX,
      ttl: CONSTANTS.CACHE_MATERIAL_CHANNEL_TTL_MS,
      providerFn: getMaterialByChannel,
      label: "fetchMaterialChannel",
    });
  } catch (error) {
    console.error(`Unexpected error in setting master data cache:`, error);
    return { data: null, count: 0, error };
  }
};

const resetCachedDataOnStartUp = async () => {
  deleteCachedData(CONSTANTS.CACHE_RARITIES_PREFIX);
  deleteCachedData(CONSTANTS.CACHE_CHANNEL_PREFIX);
  deleteCachedData(CONSTANTS.CACHE_MATERIAL_CHANNEL_PREFIX);
};

module.exports = {
  resetCachedDataOnStartUp,
  setCachedDataOnStartUp,
  fetchWithCache,
};
