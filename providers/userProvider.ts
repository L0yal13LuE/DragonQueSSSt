import supabase from '../supabaseClient';

interface UserMaterialWithRarity {
  amount: number;
  material: {
    name: string;
    default_points: number;
    rarity: { name: string; emoji: string; value: number }[] | null;
  }[] | null;
}

interface UserRow {
  id: string;
  username: string;
  userMaterial: UserMaterialWithRarity[];
}

interface UserFilters {
  username?: string;
  id?: string;
  isActive?: boolean;
}

export const getUser = async (filters: UserFilters = {}): Promise<UserRow[] | null> => {
  try {
    if (!supabase) {
      console.error("Supabase client not available in getUser");
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

    if ("username" in filters) {
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

    return data as UserRow[];
  } catch (error) {
    console.error("Function error:", error);
    return null;
  }
};
