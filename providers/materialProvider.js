const { supabase } = require("../supabaseClient");

const getMaterial = async (filters = {}) => {
  try {
    if (!supabase) {
      console.error("Supabase client not available in getMaterial");
      return null;
    }
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

const getUserItem = async (filters = {}) => {
  try {
    let query = supabase
      .from("user_material")
      .select("id, amount, material:materials(id, name, emoji)");

    if ("userId" in filters) {
      query = query.eq("user_id", filters.userId);
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

    // ✅ Sort by material name
    data.sort((a, b) => a.material.name.localeCompare(b.material.name));

    return data;
  } catch (error) {
    console.error(
      `Unexpected error in insertUserItem for ${filters.userId}:`,
      error
    );
    return false;
  }
};

const getUserItemV2 = async (filters = {}, page = 0, limit = -1) => {
  try {
    let query = supabase
      .from("user_material")
      .select("id, amount, material:materials(id, name, emoji)", { count: 'exact' }); // Get total count

    if ("userId" in filters) {
      query = query.eq("user_id", filters.userId);
    }

    if ("itemId" in filters) {
      query = query.eq("material_id", filters.itemId); // This is material_id in user_material
    }

    if ("amount" in filters) {
      query = query.gte("amount", filters.amount); // use passed value
    }

    // Apply pagination only if limit is positive
    if (limit > 0) {
      const from = page * limit;
      const to = from + limit - 1;
      query = query.range(from, to);
    }

    // Apply sorting at the database level for consistency across pages
    // Sorting by the joined table 'materials' field 'name'
    query = query.order('name', { foreignTable: 'materials', ascending: true });

    let { data, error, count } = await query;

    if (error) {
      console.error(`Supabase query error in getUserItem for UserID ${filters.userId}, Page ${page}:`, error);
      return { data: null, count: 0, error };
    }

    // In-memory name filter (Note: This filters *after* pagination and DB count)
    // If this filter is heavily used with pagination, consider moving it to the DB query for accurate total counts.
    // For handleBagCommand, this filter is not typically used, so `count` should be accurate.
    if (filters.name && data) {
      data = data.filter((row) =>
        row.material.name.toLowerCase().includes(filters.name.toLowerCase())
      );
    }
    return { data, count, error: null };
  } catch (error) {
    console.error(
      `Unexpected error in getUserItem for UserID ${filters.userId}, Page ${page}:`,
      error
    );
    return { data: null, count: 0, error };
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

const updateUserItem = async (user, item, oldAmount, newAmount) => {
  try {
    const { error: updateError } = await supabase
      .from("user_material")
      .update({ amount: newAmount })
      .eq("id", item.id);
    if (updateError) {
      console.error(`Error updating item for ${user.id}:`, updateError.message);
      return false;
    }
    console.log(
      `User ${user.id} gained ${newAmount - oldAmount} x ${
        item.material.name
      } ${item.material.emoji}. New total: ${newAmount}.`
    );
    return true;
  } catch (error) {
    console.error(`Unexpected error in insertUserItem for ${user.id}:`, error);
    return false;
  }
};

const updateUserItemV2 = async (user, item, newAmount) => {
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
      `[Item Update] User: ${user.id} | Item: ${item.material.name} ${item.material.emoji} | Old: ${item.amount} → New: ${newAmount}`
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
  updateUserItemV2,
  getUserItemV2
};
