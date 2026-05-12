const { supabase } = require("../supabaseClient");

const getUser = async (filters = {}) => {
  try {
    if (!supabase) {
      console.error("Supabase client not available in getMaterial");
      return null;
    }

    let query = supabase.from("users").select(`
        id, 
        username, 
        userMaterial:user_material (
            amount, 
            material:materials (
                name,
                default_points,
                rarity:rarities (
                    name,
                    emoji,
                    value
                )
            )
        )
    `);

    // Dynamically apply filters if provided
    if ("name" in filters) {
      query = query.ilike("name", `%${filters.username}%`);
    }

    if ("id" in filters) {
      query = query.eq("id", filters.id);
    }

    if ("isActive" in filters) {
      query = query.eq("is_active", filters.isActive);
    }

    let { data, error } = await query;

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
  getUser,
};
