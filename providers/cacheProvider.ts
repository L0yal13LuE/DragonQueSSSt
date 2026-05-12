import fs from 'fs';
import path from 'path';

const CACHE_DIR = './cache';
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export const getCacheFilePath = (key: string, layerKey?: string): string => {
  const baseDir = layerKey ? path.join(CACHE_DIR, layerKey) : CACHE_DIR;
  return path.join(baseDir, `${key}.json`);
};

export const getCachedData = async <T>(key: string, layerKey?: string): Promise<T | null> => {
  const filePath = getCacheFilePath(key, layerKey);

  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const cacheEntry = JSON.parse(raw);

    if (
      cacheEntry &&
      typeof cacheEntry === "object" &&
      "expiresAt" in cacheEntry &&
      "data" in cacheEntry
    ) {
      if (Date.now() > cacheEntry.expiresAt) {
        fs.unlinkSync(filePath);
        console.log(`[Cache] Expired cache deleted for key: ${key}`);
        return null;
      }
      return (cacheEntry as CacheEntry<T>).data;
    } else {
      console.log(`[Cache] Invalid cache format for key: ${key}. Deleting.`);
      fs.unlinkSync(filePath);
      return null;
    }
  } catch (error) {
    console.error(
      `[Cache] Error reading or parsing cache for key ${key}:`,
      error
    );
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

export const saveCachedData = (key: string, data: unknown, ttlMs?: number, layerKey?: string): void => {
  const layerDir = layerKey ? path.join(CACHE_DIR, layerKey) : CACHE_DIR;

  if (!fs.existsSync(layerDir)) {
    fs.mkdirSync(layerDir, { recursive: true });
  }

  const filePath = path.join(layerDir, `${key}.json`);
  const effectiveTtl = ttlMs || CACHE_TTL_MS;

  const cacheEntry: CacheEntry<unknown> = {
    data,
    expiresAt: Date.now() + effectiveTtl,
  };

  fs.writeFileSync(filePath, JSON.stringify(cacheEntry, null, 2));
  console.log(`[Cache] Data saved for key: ${key}${layerKey ? ` in layer: ${layerKey}` : ""}`);
};

export const deleteCachedData = async (key: string): Promise<boolean> => {
  const filePath = getCacheFilePath(key);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log(`[Cache] Deleted cache for key: ${key}`);
    return true;
  }
  return false;
};
