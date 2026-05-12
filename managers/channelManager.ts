import * as constants from '../constants';
import { fetchWithCache } from './cacheManager';
import * as channelProvider from '../providers/channelProvider';

interface ChannelFilters {
  channelId?: string;
  isGainExp?: boolean;
}

export async function fetchOrGetChannel(filters: ChannelFilters = {}): Promise<any> {
  const result = await fetchWithCache({
    cacheKey: constants.CACHE_CHANNEL_PREFIX,
    ttl: constants.CACHE_CHANNEL_TTL,
    providerFn: channelProvider.getChannel,
    label: 'fetchChannel',
    filters,
  });

  if (!result) {
    return result;
  }

  let filteredData = result;
  if ('channelId' in filters) {
    filteredData = filteredData.filter((item: any) => item.id === filters.channelId);
  }

  if ('isGainExp' in filters) {
    filteredData = filteredData.filter((item: any) => item.is_active === filters.isGainExp);
  }

  return filteredData;
}
