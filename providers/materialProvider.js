const { supabase } = require("../supabaseClient");

const getMaterial = async (filters = {}) => {
  try {
    if (!supabase) {
      console.error("Supabase client not available in getMaterial");
      return null;
    }
    let query = supabase
      .from("materials")
      .select("*, rarity:rarities(name, drop_rate, emoji)");

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

    if ("id" in filters) {
      query = query.eq("id", filters.id);
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

const getMaterialByChannel = async (filters = {}, isall = false) => {
  try {
    if (!supabase) {
      console.error("Supabase client not available in getMaterialByChannel");
      return null;
    }
    let query = supabase.from("material_channel").select(`
        channel_id,
        is_active,
        material:materials (
          id,
          name,
          emoji,
          is_active,
          rarity:rarities (
            name,     
            drop_rate,
            emoji
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

const getUserItem = async (filters = {}) => {
  try {
    let query = supabase
      .from("user_material")
      .select(
        "id, user_id, amount, material:materials(id, name, emoji, rarity_id, rarities(id, name, emoji, drop_rate, value))"
      );

    if ("userId" in filters) {
      query = query.eq("user_id", filters.userId);
    }

    if("userIdList" in filters)
    {
      query = query.in("user_id", filters.userIdList);
    }

    if ("itemId" in filters) {
      query = query.eq("material_id", filters.itemId);
    }

    if ("amount" in filters) {
      query = query.gte("amount", filters.amount); // use passed value
    }

    let { data, error } = await query;

    if (filters.name) {
      data = data.filter((row) =>
        row.material.name.toLowerCase().includes(filters.name.toLowerCase())
      );
    }

    if (data && data.length > 0) { // fixed error when no data
      // ✅ Sort by material name
      data.sort((a, b) => a.material.name.localeCompare(b.material.name));
    }

    return data;
  } catch (error) {
    console.error(
      `Unexpected error in insertUserItem for ${filters.userId}:`,
      error
    );
    return false;
  }
};

const insertUserItem = async (user, item, insertAmount) => {
  try {
    const { error: insertError } = await supabase.from("user_material").insert([
      {
        user_id: user.id,
        material_id: item.id,
        amount: insertAmount,
      },
    ]);
    if (insertError) {
      console.error(
        `Error inserting new item for ${user.id}:`,
        insertError.message
      );
      return false;
    }
    console.log(
      `User ${user.username} earned new item: ${insertAmount} x ${item.name}.`
    );
    return true;
  } catch (error) {
    console.error(`Unexpected error in insertUserItem for ${user.id}:`, error);
    return false;
  }
};

const updateUserItem = async (user, item, newAmount) => {
  try {
    const { error: updateError } = await supabase
      .from("user_material")
      .update({ amount: newAmount })
      .eq("id", item.id);

    if (updateError) {
      console.error(
        `[Item Update Error] User: ${user.id} | ${updateError.message}`
      );
      return false;
    }

    console.log(
      `[Item Update] User: ${user.id} ${user.username} | Item: ${item.material.name} ${item.material.emoji} | Old: ${item.amount} → New: ${newAmount}`
    );

    return true;
  } catch (error) {
    console.error(`[Unexpected Error] Updating item for ${user.id}:`, error);
    return false;
  }
};

module.exports = {
  getMaterial,
  getMaterialByChannel,
  getUserItem,
  insertUserItem,
  updateUserItem,
};
