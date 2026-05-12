import supabase from '../supabaseClient';

interface SpinPoolMaterial {
  id: number;
  name: string;
  emoji: string;
  rarity: { name: string; emoji: string }[] | null;
}

interface SpinPoolEntry {
  material: SpinPoolMaterial[] | null;
}

interface SpinRow {
  id: number;
  name: string;
  required_material_id: number;
  pool: SpinPoolEntry[];
}

interface SpinFilters {
  name?: string;
  id?: number;
}

export const getSpin = async (filters: SpinFilters = {}): Promise<SpinRow[] | null> => {
  try {
    if (!supabase) {
      console.error("Supabase client not available in getSpin");
      return null;
    }
    let query = supabase
      .from("spins")
      .select(
        `id, name, required_material_id, pool:spin_pool(material:material_id(id, name, emoji, rarity:rarities(name, emoji)))`
      );

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

    return data as SpinRow[];
  } catch (error) {
    console.error("Function error:", error);
    return null;
  }
};
