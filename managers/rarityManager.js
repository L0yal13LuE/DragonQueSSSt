const { getRarity } = require("../providers/rarityProvider");
const { getCachedData, saveCachedData } = require("./cacheManager");
const RARITIES_TTL_MS = 60 * 60 * 1000; // 1 hour
const CONSTANTS = require("../constants");

const fetchRarity = async () => {
  try {
    const cachedResult = await getCachedData(CONSTANTS.CACHE_RARITIES_PREFIX);

    if (cachedResult) {
      return cachedResult; // This is the { data, count, error } object
    } else {
      const result = await getRarity(); // from provider, returns { data, count, error }

      if (!result) {
        return false;
      }

      saveCachedData(
        CONSTANTS.CACHE_RARITIES_PREFIX,
        result.data,
        RARITIES_TTL_MS
      ); // Save the entire 'result' object.

      return result; // Return the full result object for consistency
    }
  } catch (error) {
    console.error(`Unexpected error in fetchRarity:`, error);
    return { data: null, count: 0, error };
  }
};

// Export the function to be used in other files
module.exports = {
  fetchRarity,
};
