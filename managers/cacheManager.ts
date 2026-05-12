import * as constants from '../constants';
import * as rarityProvider from '../providers/rarityProvider';
import * as channelProvider from '../providers/channelProvider';
import * as materialProvider from '../providers/materialProvider';
import { getCachedData, saveCachedData, deleteCachedData } from '../providers/cacheProvider';

interface FetchWithCacheParams {
  cacheKey: string;
  ttl: number;
  providerFn: () => Promise<any>;
  label?: string;
  filters?: Record<string, any>;
}

const fetchWithCache = async ({ cacheKey, ttl, providerFn, label = "fetchWithCache", filters = {}, }: FetchWithCacheParams): Promise<any> => {
  try {
    let directoryPath: string | undefined = undefined;
    if (cacheKey == constants.CACHE_MATERIAL_CHANNEL_PREFIX) directoryPath = 'MASTER';
    if (cacheKey == constants.CACHE_CHANNEL_PREFIX) directoryPath = 'MASTER';
    if (cacheKey == constants.CACHE_RARITIES_PREFIX) directoryPath = 'MASTER';

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

const setCachedDataOnStartUp = async (): Promise<void> => {
  try {
    await fetchWithCache({
      cacheKey: constants.CACHE_RARITIES_PREFIX,
      ttl: constants.CACHE_RARITIES_TTL,
      providerFn: rarityProvider.getRarity,
      label: "fetchRarity",
    });

    await fetchWithCache({
      cacheKey: constants.CACHE_CHANNEL_PREFIX,
      ttl: constants.CACHE_CHANNEL_TTL,
      providerFn: channelProvider.getChannel,
      label: "fetchChannel",
    });

    await fetchWithCache({
      cacheKey: constants.CACHE_MATERIAL_CHANNEL_PREFIX,
      ttl: constants.CACHE_MATERIAL_CHANNEL_TTL_MS,
      providerFn: materialProvider.getMaterialByChannel,
      label: "fetchMaterialChannel",
    });
  } catch (error) {
    console.error(`Unexpected error in setting master data cache:`, error);
    return { data: null, count: 0, error } as any;
  }
};

const resetCachedDataOnStartUp = async (): Promise<void> => {
  deleteCachedData(constants.CACHE_RARITIES_PREFIX);
  deleteCachedData(constants.CACHE_CHANNEL_PREFIX);
  deleteCachedData(constants.CACHE_MATERIAL_CHANNEL_PREFIX);
};

export {
  resetCachedDataOnStartUp,
  setCachedDataOnStartUp,
  fetchWithCache,
};
