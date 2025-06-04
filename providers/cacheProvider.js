const fs = require("fs");
const path = require("path");

const CACHE_DIR = "./cache";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Generates the file path for a given cache key.
 * @param {string} key - The unique key for the cache entry (e.g., "bag_userId", "shop_data").
 * @returns {string} The full file path for the cache file.
 */
const getCacheFilePath = (key) => {
  return path.join(CACHE_DIR, `${key}.json`);
};

/**
 * Retrieves cached data by key if it exists and is not expired.
 * @param {string} key - The unique key for the cache entry.
 * @returns {Promise<any|null>} The parsed JSON data or null if not found or expired.
 */
const getCachedData = async (key) => {
  const filePath = getCacheFilePath(key);

  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const cacheEntry = JSON.parse(raw); // Expects { data: ..., expiresAt: ... }

    var aa = typeof cacheEntry === "object";
    var bb = "expiresAt" in cacheEntry;
    var aa = "data" in cacheEntry;
    // Validate format and expiry
    if (
      cacheEntry &&
      typeof cacheEntry === "object" &&
      "expiresAt" in cacheEntry &&
      "data" in cacheEntry
    ) {
      if (Date.now() > cacheEntry.expiresAt) {
        fs.unlinkSync(filePath); // Delete expired cache file
        console.log(`[Cache] Expired cache deleted for key: ${key}`);
        return null;
      }
      return cacheEntry.data; // Return the actual data payload
    } else {
      // Invalid format, treat as corrupted/stale
      console.log(`[Cache] Invalid cache format for key: ${key}. Deleting.`);
      fs.unlinkSync(filePath);
      return null;
    }
  } catch (error) {
    console.error(
      `[Cache] Error reading or parsing cache for key ${key}:`,
      error
    );
    // Attempt to delete corrupted cache file
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log(`[Cache] Corrupted cache file deleted for key: ${key}`);
      } catch (deleteError) {
        console.error(
          `[Cache] Error deleting corrupted cache file for key ${key}:`,
          deleteError
        );
      }
    }
    return null;
  }
};

/**
 * Saves data to the cache with a given key.
 * @param {string} key - The unique key for the cache entry.
 * @param {any} data - The data to be cached (will be JSON.stringified).
 * @param {number} [ttlMs] - Optional Time-To-Live in milliseconds for this specific cache entry.
 */
const saveCachedData = (key, data, ttlMs) => {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
  const filePath = getCacheFilePath(key);
  const effectiveTtl = ttlMs || CACHE_TTL_MS;
  const cacheEntry = {
    data: data,
    expiresAt: Date.now() + effectiveTtl,
  };
  fs.writeFileSync(filePath, JSON.stringify(cacheEntry, null, 2));
  console.log(`[Cache] Data saved for key: ${key}`);
};

const deleteCachedData = async (key) => {
  const filePath = getCacheFilePath(key);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log(`[Cache] Deleted cache for key: ${key}`);
    return true;
  }
  return false;
};



module.exports = {
  getCachedData,
  saveCachedData,
  deleteCachedData,
  getCacheFilePath,
};
