const { supabase } = require('../supabaseClient');

const getConfig = async (filters = {}) => {
  try {
    if (!supabase) { console.error("Supabase client not available in getConfig"); return null; }
    let query = supabase
      .from("configs")
      .select(`key, value`)
      .eq("is_active", true);

    if ("key" in filters) {
      query = query.eq("key", filters.key);
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

module.exports = { getConfig };
