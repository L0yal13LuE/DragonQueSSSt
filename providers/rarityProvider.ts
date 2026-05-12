import supabase from '../supabaseClient';

interface RarityRow {
  id: number;
  name: string;
  drop_rate: number;
  emoji: string;
}

interface RarityFilters {
  name?: string;
  id?: number;
}

export const getRarity = async (filters: RarityFilters = {}): Promise<RarityRow[] | null> => {
  try {
    if (!supabase) {
      console.error("Supabase client not available in getRarity");
      return null;
    }
    let query = supabase.from("rarities").select("id, name, drop_rate, emoji");

    if ("name" in filters) {
      query = query.ilike("name", `%${filters.name}%`);
    }

    if ("id" in filters) {
      query = query.eq("id", filters.id);
    }

    let { data, error } = await query;

    if (error) {
      console.error("Supabase query error:", error);
      return null;
    }

    return data as RarityRow[];
  } catch (error) {
    console.error("Function error:", error);
    return null;
  }
};
