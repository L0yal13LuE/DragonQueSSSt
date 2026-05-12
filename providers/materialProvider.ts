import supabase from '../supabaseClient';

interface MaterialWithRarity {
  id: number;
  name: string;
  emoji?: string;
  is_active?: boolean;
  rarity_id?: number;
  default_points?: number;
  rarity: { name: string; drop_rate: number; emoji: string }[] | null;
}

interface MaterialFilters {
  is_active?: boolean;
  rarity_id?: number;
  name?: string;
  id?: number;
}

interface MaterialChannelFilters {
  channelId?: number;
  is_active?: boolean;
}

interface MaterialChannelRow {
  channel_id: number;
  is_active: boolean;
  material: {
    id: number;
    name: string;
    emoji: string;
    is_active: boolean;
    rarity: { name: string; drop_rate: number; emoji: string }[] | null;
  }[] | null;
  channel: {
    areaChannel: {
      area: { name: string }[] | null;
    }[];
  }[] | null;
}

interface UserMaterialRow {
  id: number;
  user_id: string;
  amount: number;
  material: {
    id: number;
    name: string;
    emoji: string;
    rarity_id: number;
    rarities: { id: number; name: string; emoji: string; drop_rate: number; value: number }[] | null;
  }[] | null;
}

interface UserItemFilters {
  userId?: string;
  userIdList?: string[];
  itemId?: number;
  amount?: number;
  name?: string;
}

export const getMaterial = async (filters: MaterialFilters = {}): Promise<MaterialWithRarity[] | null> => {
  try {
    if (!supabase) {
      console.error("Supabase client not available in getMaterial");
      return null;
    }
    let query = supabase
      .from("materials")
      .select("*, rarity:rarities(name, drop_rate, emoji)");

    if ("is_active" in filters) {
      query = query.eq("is_active", filters.is_active);
    }

    if ("rarity_id" in filters) {
      query = query.eq("rarity_id", filters.rarity_id);
    }

    if ("name" in filters) {
      query = query.ilike("name", `%${filters.name}%`);
    }

    if ("id" in filters) {
      query = query.eq("id", filters.id);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Supabase query error:", error);
      return null;
    }

    return data as MaterialWithRarity[];
  } catch (error) {
    console.error("Function error:", error);
    return null;
  }
};

export const getMaterialByChannel = async (filters: MaterialChannelFilters = {}, isall = false): Promise<MaterialChannelRow[] | null> => {
  try {
    if (!supabase) {
      console.error("Supabase client not available in getMaterialByChannel");
      return null;
    }
    let query = supabase.from("material_channel").select(`
        channel_id,
        is_active,
        material:materials (
          id,
          name,
          emoji,
          is_active,
          rarity:rarities (
            name,
            drop_rate,
            emoji
          )
        ),
        channel:channels (
          areaChannel:area_channel (
            area:areas (
              name
            )
          )
        )
      `);

    if ("channelId" in filters) {
      query = query.eq("channel_id", filters.channelId);
    }

    if (!isall) {
      const isActiveValue =
        typeof filters.is_active === "boolean" ? filters.is_active : true;
      query = query.eq("is_active", isActiveValue);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Supabase query error:", error);
      return null;
    }

    return data as MaterialChannelRow[];
  } catch (error) {
    console.error("Function error:", error);
    return null;
  }
};

export const getUserItem = async (filters: UserItemFilters = {}): Promise<UserMaterialRow[] | null> => {
  try {
    if (!supabase) {
      console.error("Supabase client not available in getUserItem");
      return null;
    }
    let query = supabase
      .from("user_material")
      .select(
        "id, user_id, amount, material:materials(id, name, emoji, rarity_id, rarities(id, name, emoji, drop_rate, value))"
      );

    if ("userId" in filters) {
      query = query.eq("user_id", filters.userId);
    }

    if ("userIdList" in filters) {
      query = query.in("user_id", filters.userIdList!);
    }

    if ("itemId" in filters) {
      query = query.eq("material_id", filters.itemId);
    }

    if ("amount" in filters) {
      query = query.gte("amount", filters.amount);
    }

    let { data, error } = await query;

    if (error) {
      console.error("Supabase query error:", error);
      return null;
    }

    let result = data as UserMaterialRow[] | null;

    if (filters.name && result) {
      result = result.filter((row) =>
        row.material && row.material[0] && row.material[0].name.toLowerCase().includes(filters.name!.toLowerCase())
      );
    }

    if (result && result.length > 0) {
      result.sort((a, b) => (a.material?.[0]?.name || '').localeCompare(b.material?.[0]?.name || ''));
    }

    return result;
  } catch (error) {
    console.error(
      `Unexpected error in getUserItem for ${filters.userId}:`,
      error
    );
    return null;
  }
};

export const insertUserItem = async (
  user: { id: string; username?: string },
  item: { id: number; name?: string },
  insertAmount: number
): Promise<boolean> => {
  try {
    if (!supabase) {
      console.error("Supabase client not available in insertUserItem");
      return false;
    }
    const { error: insertError } = await supabase.from("user_material").insert([
      {
        user_id: user.id,
        material_id: item.id,
        amount: insertAmount,
      },
    ]);
    if (insertError) {
      console.error(
        `Error inserting new item for ${user.id}:`,
        insertError.message
      );
      return false;
    }
    console.log(
      `User ${user.username} earned new item: ${insertAmount} x ${item.name}.`
    );
    return true;
  } catch (error) {
    console.error(`Unexpected error in insertUserItem for ${user.id}:`, error);
    return false;
  }
};

export const updateUserItem = async (
  user: { id: string; username?: string },
  item: { id: number; material?: { name?: string; emoji?: string }; amount?: number },
  newAmount: number
): Promise<boolean> => {
  try {
    if (!supabase) {
      console.error("Supabase client not available in updateUserItem");
      return false;
    }
    const { error: updateError } = await supabase
      .from("user_material")
      .update({ amount: newAmount })
      .eq("id", item.id);

    if (updateError) {
      console.error(
        `[Item Update Error] User: ${user.id} | ${updateError.message}`
      );
      return false;
    }

    console.log(
      `[Item Update] User: ${user.id} ${user.username} | Item: ${item.material?.name} ${item.material?.emoji} | Old: ${item.amount} \u2192 New: ${newAmount}`
    );

    return true;
  } catch (error) {
    console.error(`[Unexpected Error] Updating item for ${user.id}:`, error);
    return false;
  }
};
