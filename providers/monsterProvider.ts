import supabase from '../supabaseClient';

interface MonsterRow {
  id: number;
  name: string;
  [key: string]: unknown;
}

interface MonsterFilters {
  id?: number;
  name?: string;
  isActive?: boolean;
}

interface EventMonsterRow {
  name: string;
  user: { id: string; username: string }[] | null;
}

interface EventMonsterFilters {
  isActive?: boolean;
}

export const getMonsters = async (filters: MonsterFilters = {}): Promise<MonsterRow[] | null> => {
  try {
    if (!supabase) {
      console.error("Supabase client not available in getMonsters");
      return null;
    }
    let query = supabase.from("monsters").select("*");

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

    return data as MonsterRow[];
  } catch (error) {
    console.error("Error in getMonsters function:", error);
    return null;
  }
};

export const getEventMonsters = async (filters: EventMonsterFilters = {}): Promise<EventMonsterRow[] | null> => {
  try {
    if (!supabase) {
      console.error("Supabase client not available in getEventMonsters");
      return null;
    }
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

    return data as EventMonsterRow[];
  } catch (error) {
    console.error("Error in getMonsters function:", error);
    return null;
  }
};
