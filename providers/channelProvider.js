const getChannel = async (supabase, filters = {}) => {
  try {
    let query = supabase.from("channels").select(`id, name`);

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

    return data;
  } catch (error) {
    console.error("Function error:", error);
    return null;
  }
};

const getChannelByArea = async (supabase, filters = {}) => {
  try {
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
