import supabase from '../supabaseClient';

interface ChannelRow {
  id: number;
  name: string;
  is_active: boolean;
}

interface ChannelFilters {
  channelId?: number;
  isGainExp?: boolean;
}

interface AreaChannelRow {
  area: { name: string }[] | null;
  channel: { id: number; name: string }[] | null;
}

interface AreaChannelFilters {
  areaId?: number;
  channelId?: number;
}

export const getChannel = async (filters: ChannelFilters = {}): Promise<ChannelRow[] | null> => {
  try {
    if (!supabase) { console.error("Supabase client not available in getChannel"); return null; }
    let query = supabase.from("channels").select(`id, name, is_active`);

    if ("channelId" in filters) {
      query = query.eq("id", filters.channelId);
    }

    if ("isGainExp" in filters) {
      query = query.eq("is-gain-exp", filters.isGainExp);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Supabase query error:", error);
      return null;
    }

    return data as ChannelRow[];
  } catch (error) {
    console.error("Function error:", error);
    return null;
  }
};

export const getChannelByArea = async (filters: AreaChannelFilters = {}): Promise<AreaChannelRow[] | null> => {
  try {
    if (!supabase) { console.error("Supabase client not available in getChannelByArea"); return null; }
    let query = supabase.from("area_channel").select(`
        area:areas (
          name
        ),
        channel:channels (
          id,
          name
        )
      `);

    if ("areaId" in filters) {
      query = query.eq("area_id", filters.areaId);
    }

    if ("channelId" in filters) {
      query = query.eq("channel_id", filters.channelId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Supabase query error:", error);
      return null;
    }

    return data as AreaChannelRow[];
  } catch (error) {
    console.error("Function error:", error);
    return null;
  }
};
