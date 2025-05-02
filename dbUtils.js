/**
 * Retrieves user data (level, exp, etc.) from the 'users' table.
 */
const getUser = async (supabase, userId) => {
    if (!supabase) return null;
    try {
        const { data: userData, error } = await supabase.from('users').select('*').eq('id', userId).single();
        if (error && error.code !== 'PGRST116') {
            console.error(`Error fetching user ${userId}:`, error.message); return null;
        }
        return userData;
    } catch (error) { console.error(`Unexpected error fetching user ${userId}:`, error); return null; }
};

/**
 * Inserts a new user record into the 'users' table.
 */
const insertUser = async (supabase, userId, username, level, currentExp, timestamp) => {
    if (!supabase) return false;
    try {
        const { error } = await supabase.from('users').insert([{ id: userId, username: username, level: level, current_exp: currentExp, last_online_timestamp: timestamp }]);
        if (error) { console.error(`Error inserting user ${username}:`, error.message); return false; }
        console.log(`New user ${username} added.`);
        return true;
    } catch (error) { console.error(`Unexpected error inserting user ${username}:`, error); return false; }
};

/**
 * Updates an existing user's data in the 'users' table.
 */
const updateUser = async (supabase, userId, dataToUpdate) => {
    if (!supabase) return false;
    try {
        const { error } = await supabase.from('users').update(dataToUpdate).eq('id', userId);
        if (error) { console.error(`Error updating user ${userId}:`, error.message); return false; }
        // console.log(`User ${userId} data updated.`);
        return true;
    } catch (error) { console.error(`Unexpected error updating user ${userId}:`, error); return false; }
};

/**
 * Updates only the username for a user.
 */
const updateUsername = async (supabase, userId, username) => {
    if (!supabase) return false;
    try {
        const { error } = await supabase.from('users').update({ username: username }).eq('id', userId);
        if (error) { console.error(`Error updating username for ${userId}:`, error.message); return false; }
        console.log(`Username updated for user ${userId}.`);
        return true;
    } catch (error) { console.error(`Unexpected error updating username for ${userId}:`, error); return false; }
};

/**
 * Inserts or updates (upserts) a user's item count in 'user_item'.
 */
const insertUserItem = async (supabase, userid, channelid, item, itemamount, timestamp) => {
    if (!supabase) return false;
    try {
        const { data: existingItem, error: fetchError } = await supabase
            .from('user_item').select('id, itemamount').eq('userid', userid)
            .eq('channelid', channelid).eq('itemname', item.name).single();

        if (fetchError && fetchError.code !== 'PGRST116') {
            console.error(`Error fetching existing item for ${userid}:`, fetchError.message); return false;
        }

        if (existingItem) {
            const newAmount = existingItem.itemamount + itemamount;
            const { error: updateError } = await supabase.from('user_item')
                .update({ itemamount: newAmount, timestamp: timestamp }).eq('id', existingItem.id);
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

/**
 * Retrieves all items for a specific user.
 */
const getUserItems = async (supabase, userId) => {
    if (!supabase) return null;
    try {
        const { data: userItems, error } = await supabase.from('user_item').select('*').eq('userid', userId);
        if (error && error.code !== 'PGRST116') {
            console.error(`Error fetching items for ${userId}:`, error.message); return null;
        }
        return userItems;
    } catch (error) { console.error(`Unexpected error fetching items for ${userId}:`, error); return null; }
};

/**
 * Fetches the monster record for a specific date from 'event_monster'.
 */
const getMonsterForDate = async (supabase, dateString) => {
    if (!supabase) return null;
    try {
        const { data, error } = await supabase
            .from('event_monster')
            .select('*')
            .eq('spawn_date', dateString)
            .single(); // Only one monster per date

        if (error && error.code !== 'PGRST116') { // Ignore 'not found' error
            console.error(`Error fetching monster for date ${dateString}:`, error.message);
            return null;
        }
        return data; // Returns null if not found (PGRST116)
    } catch (error) {
        console.error(`Unexpected error fetching monster for ${dateString}:`, error);
        return null;
    }
};

/**
 * Creates a new monster entry in 'event_monster'.
 */
const createMonster = async (supabase, dateString, name, maxHp) => {
    if (!supabase) return null;
    try {
        const monsterData = {
            spawn_date: dateString,
            name: name,
            max_hp: maxHp,
            current_hp: maxHp, // Set initial current_hp same as max_hp
            is_alive: true,
            is_reward_announced: false,
        };
        const { data, error } = await supabase
            .from('event_monster')
            .insert(monsterData)
            .select() // Return the inserted row
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

/**
 * Logs a player's hit against a monster in 'event_monster_hit'.
 */
const logMonsterHit = async (supabase, monsterDate, userId, username, damage) => {
    if (!supabase) return false;
    try {
        const { error } = await supabase
            .from('event_monster_hit')
            .insert({
                monster_spawn_date: monsterDate,
                user_id: userId,
                username: username,
                damage_dealt: damage,
                // hit_timestamp is handled by default value 'now()' in DB
            });

        if (error) {
            console.error(`Error logging hit for user ${username} on monster ${monsterDate}:`, error.message);
            return false;
        }
        // console.log(`Logged hit: User ${username} dealt ${damage} damage to monster ${monsterDate}`); // Can be noisy
        return true;
    } catch (error) {
        console.error(`Unexpected error logging monster hit for user ${username}:`, error);
        return false;
    }
};

/**
 * Calls the Supabase RPC function 'calculate_total_damage' to sum damage from 'event_monster_hit'.
 * Make sure the RPC function exists in your Supabase project!
 */
const getTotalDamageDealt = async (supabase, monsterDate) => {
    if (!supabase) return 0;
    try {
        // Assumes an RPC function named 'calculate_total_damage' exists in Supabase
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

/**
 * Updates the monster's status in the 'event_monster' table when it's defeated.
 */
const markMonsterAsDefeated = async (supabase, monsterDate, killerUserId, finalHp = 0) => {
    if (!supabase) return null;
    try {
        const updateData = {
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
            .select()
            .single();

        if (error) {
            if (error.code !== 'PGRST116') {
                console.error(`Error marking monster ${monsterDate} as defeated:`, error.message);
            } else {
                console.log(`Monster ${monsterDate} likely already marked as defeated (no rows updated).`);
            }
            return null;
        }
        console.log(`Monster ${monsterDate} successfully marked as defeated by ${killerUserId}.`);
        return data;
    } catch (error) {
        console.error(`Unexpected error marking monster ${monsterDate} defeated:`, error);
        return null;
    }
};

/**
 * Marks the monster's reward as announced in the 'event_monster' table.
 */
const markRewardAnnounced = async (supabase, dateString) => {
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

/**
 * Deletes all hit records for a specific monster spawn date from 'event_monster_hit'.
 * @param {object} supabase - The Supabase client instance.
 * @param {string} monsterDate - The spawn date 'YYYY-MM-DD' of the monster whose hits should be deleted.
 * @returns {Promise<boolean>} True if deletion was successful or no rows needed deleting, false on error.
 */
const deleteMonsterHits = async (supabase, monsterDate) => {
    if (!supabase) { console.error(`[DeleteHits] Supabase client unavailable.`); return false; }
    console.log(`[DeleteHits] Attempting deletion for date: '${monsterDate}' (Type: ${typeof monsterDate})`);

    try {
        // Check if rows exist first
        const { count, error: countError } = await supabase
            .from('event_monster_hit')
            .select('*', { count: 'exact', head: true }) // Only get count
            .eq('monster_spawn_date', monsterDate);

        if (countError) {
            console.error(`[DeleteHits] Error checking count for ${monsterDate}:`, countError.message);
            // Optionally return false or try deleting anyway
        }

        if (count === 0 || count === null) { // Handle count being 0 or null
            console.log(`[DeleteHits] No hit logs found for ${monsterDate}. No deletion needed.`);
            return true; // Success, nothing to delete
        }

        console.log(`[DeleteHits] Found ${count} hits for ${monsterDate}. Proceeding with deletion.`);

        // Perform the delete
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

module.exports = {
    getUser, insertUser, updateUser, updateUsername, insertUserItem, getUserItems,
    getMonsterForDate, createMonster, logMonsterHit, getTotalDamageDealt,
    markMonsterAsDefeated, markRewardAnnounced, deleteMonsterHits
};