import supabase from '../supabaseClient';

interface ConfigRow {
  key: string;
  value: string;
}

interface ConfigFilters {
  key?: string;
}

export const getConfig = async (filters: ConfigFilters = {}): Promise<ConfigRow[] | null> => {
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

    return data as ConfigRow[];
  } catch (error) {
    console.error("Function error:", error);
    return null;
  }
};
