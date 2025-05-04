const getMaterial = async (supabase, filters = {}) => {
  try {
    let query = supabase.from("materials").select("*");

    // Dynamically apply filters if provided
    if ("is_active" in filters) {
      query = query.eq("is_active", filters.is_active);
    }

    if ("rarity_id" in filters) {
      query = query.eq("rarity_id", filters.rarity_id);
    }

    if ("name" in filters) {
      query = query.ilike("name", `%${filters.name}%`);
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

const getMaterialByChannel = async (supabase, filters = {}, isall = false) => {
  try {
    let query = supabase.from("material_channel").select(`
        channel_id,
        is_active,
        material:materials (
          name,
          emoji,
          is_active,
          rarity:rarities (
            name,     
            drop_rate
          )
        ),
        channel:channels (
          areaChannel:area_channel (
            area:areas (
              name
            )          
          )
        )
      `);

    if ("channelId" in filters) {
      query = query.eq("channel_id", filters.channelId);
    }

    if (!isall) {
      const isActiveValue =
        typeof filters.is_active === "boolean" ? filters.isActive : true;
      query = query.eq("is_active", isActiveValue);
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

module.exports = { getMaterial, getMaterialByChannel };
