const { supabase } = require('../supabaseClient');
const { getChannelPair } = require("./channelPairProvider");

const getChannel = async (filters = {}) => {
  try {
    if (!supabase) { console.error("Supabase client not available in getChannel"); return null; }
    let query = supabase.from("channels").select(`id, name`);

    if ("channelId" in filters) {
      const pairChannelId = await getChannelPair(supabase, filters.channelId);
      if (pairChannelId && pairChannelId > 0) filters.channelId = pairChannelId;
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

    return data;
  } catch (error) {
    console.error("Function error:", error);
    return null;
  }
};

const getChannelByArea = async (filters = {}) => {
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
      const pairChannelId = await getChannelPair(supabase, filters.channelId);
      if (pairChannelId && pairChannelId > 0) filters.channelId = pairChannelId;
      query = query.eq("channel_id", filters.channelId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Supabase query error:", error);
      return null;
    }

    return data;
  } catch (error) {
    console.error("Function error:", error);
    return null;
  }
};

module.exports = { getChannel, getChannelByArea };
