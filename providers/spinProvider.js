const { supabase } = require("../supabaseClient");

const getSpin = async (filters = {}) => {
  try {
    if (!supabase) {
      console.error("Supabase client not available in getMaterial");
      return null;
    }
    let query = supabase
      .from("spins")
      .select(
        `id, name, required_material_id, pool:spin_pool(material:material_id(id, name, emoji, rarity:rarities(name, emoji)))`
      );

    // Dynamically apply filters if provided
    if ("name" in filters) {
      query = query.ilike("name", `%${filters.name}%`);
    }

    if ("id" in filters) {
      query = query.eq("id", filters.id);
    }

    let { data, error, count } = await query;

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

module.exports = {
  getSpin,
};
