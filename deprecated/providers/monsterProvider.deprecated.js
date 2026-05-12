const { supabase } = require("../supabaseClient");

const getMonsters = async (filters = {}) => {
  try {
    if (!supabase) {
      console.error("Supabase client not available in getMonsters");
      return null;
    }
    let query = supabase.from("monsters").select("*");

    // Dynamically apply filters if provided
    if ("id" in filters) {
      query = query.eq("id", filters.id);
    }

    if ("name" in filters) {
      query = query.ilike("name", `%${filters.name}%`);
    }

    if ("isActive" in filters) {
      query = query.eq("is_active", `%${filters.isActive}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Supabase query error fetching monsters:", error);
      return null;
    }

    return data;
  } catch (error) {
    console.error("Error in getMonsters function:", error);
    return null;
  }
};

const getEventMonsters = async (filters = {}) => {
  try {
    let query = supabase
      .from("event_monster")
      .select("name, user: users (id, username)");

    if ("isActive" in filters) {
      query = query.eq("is_active", `%${filters.isActive}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Supabase query error fetching monsters:", error);
      return null;
    }

    return data;
  } catch (error) {
    console.error("Error in getMonsters function:", error);
    return null;
  }
};

module.exports = { getMonsters, getEventMonsters };
