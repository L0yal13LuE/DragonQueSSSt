import supabase from './supabaseClient';

export const getUser = async (userId: string): Promise<any> => {
    if (!supabase) return null;
    try {
        const { data: userData, error } = await supabase.from('users').select('*').eq('id', userId).single();
        if (error && error.code !== 'PGRST116') {
            console.error(`Error fetching user ${userId}:`, error.message); return null;
        }
        return userData;
    } catch (error) { console.error(`Unexpected error fetching user ${userId}:`, error); return null; }
};

export const insertUser = async (userId: string, username: string, level: number, currentExp: number, timestamp: string): Promise<boolean> => {
    if (!supabase) return false;
    try {
        const { error } = await supabase.from('users').insert([{ id: userId, username: username, level: level, current_exp: currentExp, last_online_timestamp: timestamp }]);
        if (error) { console.error(`Error inserting user ${username}:`, error.message); return false; }
        console.log(`New user ${username} added.`);
        return true;
    } catch (error) { console.error(`Unexpected error inserting user ${username}:`, error); return false; }
};

export const updateUser = async (userId: string, dataToUpdate: Record<string, unknown>): Promise<boolean> => {
    if (!supabase) return false;
    try {
        const { error } = await supabase.from('users').update(dataToUpdate).eq('id', userId);
        if (error) { console.error(`Error updating user ${userId}:`, error.message); return false; }
        return true;
    } catch (error) { console.error(`Unexpected error updating user ${userId}:`, error); return false; }
};

export const updateUsername = async (userId: string, username: string): Promise<boolean> => {
    if (!supabase) return false;
    try {
        const { error } = await supabase.from('users').update({ username: username }).eq('id', userId);
        if (error) { console.error(`Error updating username for ${userId}:`, error.message); return false; }
        console.log(`Username updated for user ${userId}.`);
        return true;
    } catch (error) { console.error(`Unexpected error updating username for ${userId}:`, error); return false; }
};

export const insertUserItem = async (userid: string, channelid: string, item: { name: string; emoji: string }, itemamount: number, timestamp: string): Promise<boolean> => {
    if (!supabase) return false;
    try {
        const { data: existingItem, error: fetchError } = await supabase
            .from('user_item').select('id, itemamount').eq('userid', userid)
            .eq('channelid', channelid).eq('itemname', item.name).single();

        if (fetchError && fetchError.code !== 'PGRST116') {
            console.error(`Error fetching existing item for ${userid}:`, fetchError.message); return false;
        }

        if (existingItem) {
            const newAmount = (existingItem as { id: number; itemamount: number }).itemamount + itemamount;
            const { error: updateError } = await supabase.from('user_item')
                .update({ itemamount: newAmount, timestamp: timestamp }).eq('id', (existingItem as { id: number }).id);
            if (updateError) { console.error(`Error updating item for ${userid}:`, updateError.message); return false; }
            console.log(`User ${userid} gained ${itemamount} x ${item.name}. New total: ${newAmount}.`);
            return true;
        } else {
            const { error: insertError } = await supabase.from('user_item').insert([{
                userid: userid, channelid: channelid, itememoji: item.emoji, itemname: item.name,
                itemamount: itemamount, timestamp: timestamp
            }]);
            if (insertError) { console.error(`Error inserting new item for ${userid}:`, insertError.message); return false; }
            console.log(`User ${userid} earned new item: ${itemamount} x ${item.name}.`);
            return true;
        }
    } catch (error) { console.error(`Unexpected error in insertUserItem for ${userid}:`, error); return false; }
};

export const getUserItems = async (userId: string): Promise<any> => {
    if (!supabase) return null;
    try {
        const { data: userItems, error } = await supabase.from('user_item').select('*').eq('userid', userId);
        if (error && error.code !== 'PGRST116') {
            console.error(`Error fetching items for ${userId}:`, error.message); return null;
        }
        return userItems;
    } catch (error) { console.error(`Unexpected error fetching items for ${userId}:`, error); return null; }
};

export const getMonsterForDate = async (dateString: string): Promise<any> => {
    if (!supabase) return null;
    try {
        const { data, error } = await supabase
            .from('event_monster')
            .select('*')
            .eq('spawn_date', dateString);

        if (error && error.code !== 'PGRST116') {
            console.error(`Error fetching monster for date ${dateString}:`, error.message);
            return null;
        }
        return data && data.length > 0 ? data[0] : null;
    } catch (error) {
        console.error(`Unexpected error fetching monster for ${dateString}:`, error);
        return null;
    }
};

export const createMonster = async (dateString: string, name: string, maxHp: number): Promise<any> => {
    if (!supabase) return null;
    try {
        const monsterData = {
            spawn_date: dateString,
            name: name,
            max_hp: maxHp,
            current_hp: maxHp,
            is_alive: true,
            is_reward_announced: false,
        };
        const { data, error } = await supabase
            .from('event_monster')
            .insert(monsterData)
            .select()
            .single();

        if (error) {
            console.error(`Error creating monster ${name} for ${dateString}:`, error.message);
            return null;
        }
        console.log(`Successfully spawned monster: ${name} (HP: ${maxHp}) for ${dateString}`);
        return data;
    } catch (error) {
        console.error(`Unexpected error creating monster ${name}:`, error);
        return null;
    }
};

export const logMonsterHit = async (monsterDate: string, userId: string, username: string, damage: number): Promise<boolean> => {
    if (!supabase) return false;
    try {
        const { error } = await supabase
            .from('event_monster_hit')
            .insert({
                monster_spawn_date: monsterDate,
                user_id: userId,
                username: username,
                damage_dealt: damage,
            });

        if (error) {
            console.error(`Error logging hit for user ${username} on monster ${monsterDate}:`, error.message);
            return false;
        }
        return true;
    } catch (error) {
        console.error(`Unexpected error logging monster hit for user ${username}:`, error);
        return false;
    }
};

export const getTotalDamageDealt = async (monsterDate: string): Promise<number> => {
    if (!supabase) return 0;
    try {
        const { data, error } = await supabase.rpc('calculate_total_damage', {
            spawn_date_param: monsterDate
        });

        if (error) {
            console.error(`Error calling RPC calculate_total_damage for ${monsterDate}:`, error.message);
            return 0;
        }
        return data || 0;
    } catch (error) {
        console.error(`Unexpected error calling RPC for ${monsterDate}:`, error);
        return 0;
    }
};

export const markMonsterAsDefeated = async (monsterDate: string, killerUserId: string, finalHp: number = 0): Promise<any> => {
    if (!supabase) return null;
    try {
        const updateData: Record<string, unknown> = {
            is_alive: false,
            current_hp: finalHp,
            killed_by_user_id: killerUserId,
            killed_at_timestamp: new Date().toISOString()
        };
        const { data, error } = await supabase
            .from('event_monster')
            .update(updateData)
            .eq('spawn_date', monsterDate)
            .eq('is_alive', true)
            .select();

        if (error) {
            if (error.code !== 'PGRST116') {
                console.error(`Error marking monster ${monsterDate} as defeated:`, error.message);
            } else {
                console.log(`Monster ${monsterDate} likely already marked as defeated (no rows updated).`);
            }
            return null;
        }
        console.log(`Monster ${monsterDate} successfully marked as defeated by ${killerUserId}.`);
        return data && data.length > 0 ? data[0] : null;
    } catch (error) {
        console.error(`Unexpected error marking monster ${monsterDate} defeated:`, error);
        return null;
    }
};

export const markRewardAnnounced = async (dateString: string): Promise<boolean> => {
    if (!supabase) return false;
    try {
        const { error } = await supabase
            .from('event_monster')
            .update({ is_reward_announced: true })
            .eq('spawn_date', dateString);

        if (error) {
            console.error(`Error marking reward announced for monster ${dateString}:`, error.message);
            return false;
        }
        console.log(`Marked reward announced for monster ${dateString}.`);
        return true;
    } catch (error) {
        console.error(`Unexpected error marking reward announced for ${dateString}:`, error);
        return false;
    }
};

export const deleteMonsterHits = async (monsterDate: string): Promise<boolean> => {
    if (!supabase) { console.error(`[DeleteHits] Supabase client unavailable (likely not initialized).`); return false; }

    try {
        const { count, error: countError } = await supabase
            .from('event_monster_hit')
            .select('*', { count: 'exact', head: true })
            .eq('monster_spawn_date', monsterDate);

        if (countError) {
            console.error(`[DeleteHits] Error checking count for ${monsterDate}:`, countError.message);
        }

        if (count === 0 || count === null) {
            console.log(`[DeleteHits] No hit logs found for ${monsterDate}. No deletion needed.`);
            return true;
        }

        console.log(`[DeleteHits] Found ${count} hits for ${monsterDate}. Proceeding with deletion.`);

        const { error } = await supabase
            .from('event_monster_hit')
            .delete()
            .eq('monster_spawn_date', monsterDate);

        if (error) {
            console.error(`[DeleteHits] Error during deletion for ${monsterDate}:`, error.message);
            return false;
        }

        console.log(`[DeleteHits] Successfully triggered deletion for ${monsterDate}.`);
        return true;

    } catch (error) {
        console.error(`[DeleteHits] Unexpected error during process for ${monsterDate}:`, error);
        return false;
    }
};

export const getShop = async (channelId: string): Promise<any> => {
    if (!supabase) return null;
    try {
        const { data: shopData, error } = await supabase.from('shops')
            .select('*')
            .eq('channel_id', channelId)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error(`Error fetching shop for channel ${channelId}:`, error.message);
            return null;
        }

        return shopData || null;
    } catch (error) {
        console.error(`Unexpected error fetching shop for ${channelId}:`, error);
        return null;
    }
};

export const getShopItems = async (shopId: number): Promise<any> => {
    if (!supabase) return null;
    try {
        const { data: shopItems, error } = await supabase.from('shop_items')
            .select('*, materials(id,emoji,name)')
            .eq('shop_id', shopId)
            .eq('is_active', true)
            .eq('materials.is_active', true)
            .order('created_at');

        if (error) {
            console.error(`Error fetching items for shop ${shopId}:`, error.message);
            return null;
        }

        return shopItems;
    } catch (error) {
        console.error(`Unexpected error fetching items for shop ${shopId}:`, error);
        return null;
    }
};
