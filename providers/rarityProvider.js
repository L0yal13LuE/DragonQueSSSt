const { supabase } = require("../supabaseClient");

const getRarity = async (filters = {}) => {
  try {
    if (!supabase) {
      console.error("Supabase client not available in getMaterial");
      return null;
    }
    let query = supabase.from("rarities").select("id, name, drop_rate, emoji");

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
  getRarity,
};
