// --- Required Libraries ---
// discord.js: A powerful Node.js module that allows you to interact with the Discord API.
// Collection: A utility class from discord.js that extends Map, useful for caching data.
// EmbedBuilder: A class from discord.js used to create rich, formatted message embeds.
const { Client, GatewayIntentBits, Collection, EmbedBuilder } = require('discord.js');

// @supabase/supabase-js: The official JavaScript client for interacting with Supabase services.
const { createClient } = require('@supabase/supabase-js');

const { handleLeaderboardCommand } = require('./managers/leaderBoardManager.js'); // Load the specific command
const { disAllowChannelArray } = require('./disAllowChannelArray.js');

// dotenv: A module to load environment variables from a .env file into process.env.
// This is crucial for keeping sensitive information (like tokens and keys) out of your code.
require('dotenv').config();

// --- Configuration ---
const TOKEN = process.env.DISCORD_TOKEN_COCO;
// const RANK_CHANNEL_ID = process.env.RANK_CHANNEL_ID; // Optional: Kept for potential future use, !rank works everywhere now
const ANNOUNCEMENT_CHANNEL_ID = process.env.ANNOUNCEMENT_CHANNEL_ID_COCO; // For level-ups ONLY
// const GAMING_CHANNEL_ID = process.env.GAMING_CHANNEL_ID; // For bot online, item drops, monster events, !bag, !monster

// --- Channel IDs for Item Drops (Loaded from .env) ---
const CHANNEL_ID_1 = ANNOUNCEMENT_CHANNEL_ID; //process.env.CHANNEL_ID_1;
// const CHANNEL_ID_2 = process.env.CHANNEL_ID_2;
// Add more channel ID variables here as needed

// Supabase Configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// --- Cat Language Replies ---
const catReplies = [
    "เหมียว?", // Meow?
    "เมี้ยววว...", // Meeeow...
    "*เอียงคอ* เหมี๊ยว?", // *tilts head* Mrrr?
    "พรืดดดด... ฟี้...", // Purrrr... Zzzz...
    "*คลอเคลีย* เหมียว!", // *nuzzles* Meow!
    "เหมียววววววววว...", // Puuuurrrrrrrrrrr...
    "เมี้ยว เมี้ยว!", // Meow meow!
    "*กะพริบตาช้าๆ*", // *blinks slowly*
    "หง่าววว?", // Mrow?
    "ว่าไงทาส เหมียว?", // What is it, human? Meow?
    "เรียกหาเหมียวเหรอ?", // Calling for meow?
];

// --- Configuration Validation ---
if (!TOKEN) {
    console.error('FATAL ERROR: DISCORD_TOKEN not found in .env file!');
    process.exit(1);
}
if (!ANNOUNCEMENT_CHANNEL_ID) {
    console.error('WARNING: ANNOUNCEMENT_CHANNEL_ID not found in .env file!');
    console.warn('Level-up announcements will not be sent to a dedicated channel.');
}
// if (!GAMING_CHANNEL_ID) {
//     console.error('WARNING: GAMING_CHANNEL_ID not found in .env file!');
//     console.warn('Bot online, item drop, monster event announcements, !bag, and !monster commands will not work.');
// }
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('WARNING: Supabase URL or Anon Key not found in .env file!');
    console.error('Database functionality will be limited or unavailable.');
    // process.exit(1); // Consider exiting if DB is absolutely essential
}

// --- Constants ---
const EXP_PER_CHARACTER = 1;
const LEVELING_FACTOR = 10;
const COOLDOWN_MILLISECONDS = 5 * 1000;
const COMMAND_PREFIX = '!';
const HOURLY_CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour in milliseconds

// --- Material Lists ---
const MATERIAL_LIST = [
    { emoji: '🪵', name: 'Wood' }, { emoji: '🧱', name: 'Concrete' }, { emoji: '🔩', name: 'Steel' },
    { emoji: '🪟', name: 'Glass' }, { emoji: '🏠', name: 'Plaster' }, { emoji: '🪨', name: 'Stone' },
    { emoji: '🛠️', name: 'Aluminum' }, { emoji: '🧵', name: 'Fabric' }, { emoji: '🌿', name: 'Bamboo' },
    { emoji: '🛢️', name: 'Plastic' },
    /*{ emoji: '🏮', name: 'Lamp' },
    { emoji: '🌹', name: 'Vase' },
    { emoji: '🧩', name: 'Foam' },
    { emoji: '🧥', name: 'Leather' },
    { emoji: '🦷', name: 'Rubber' },
    { emoji: '🕸️', name: 'Carbon Fiber' },
    { emoji: '🌳', name: 'Pine' },
    { emoji: '🌲', name: 'Oak' },
    { emoji: '🧶', name: 'Cotton' },
    { emoji: '🧺', name: 'Basket' },
    { emoji: '📦', name: 'Storage Box' }*/
];
const RARE_MATERIAL_LIST = [
    { emoji: '💎', name: 'Diamond' }, { emoji: '👑', name: 'Crown' }, { emoji: '🔮', name: 'Magic Orb' },
];

// --- Channel Specific Drop Configurations ---
const channelDropConfigs = {
    ...(CHANNEL_ID_1 && { [CHANNEL_ID_1]: { dropRate: 0.33, dropItems: MATERIAL_LIST } }),
    // ...(CHANNEL_ID_2 && { [CHANNEL_ID_2]: { dropRate: 0.15, dropItems: RARE_MATERIAL_LIST } }),
    // Add more channel configurations here
};

// --- Monster Definitions (Thai Names) ---
const POSSIBLE_MONSTERS = [
    { name: "ก็อบลินหน้าบูด", baseHp: 1000 }, // Grumpy Goblin
    { name: "สไลม์ยักษ์", baseHp: 1000 },     // Giant Slime
    { name: "นักรบโครงกระดูก", baseHp: 1000 },// Skeletal Warrior
    { name: "ภูตพงไพร", baseHp: 1000 },     // Forest Sprite
    { name: "โกเลมหินผา", baseHp: 1000 },   // Rock Golem
];

// --- Initialize Discord Client ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages, // Optional
    ],
});

// --- Initialize Supabase Client ---
const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY) ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// --- Caches and State ---
const userCooldowns = new Collection();
let announcementChannel = null;
let gamingChannel = null;
let currentMonsterState = null; // Holds { spawn_date, name, max_hp, is_alive, is_reward_announced, ... }

// --- Helper Functions for User/Item Database Interactions ---


/**
 * Retrieves user data (level, exp, etc.) from the 'users' table.
 */
const getUser = async (userId) => {
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
const insertUser = async (userId, username, level, currentExp, timestamp) => {
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
const updateUser = async (userId, dataToUpdate) => {
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
const updateUsername = async (userId, username) => {
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
const insertUserItem = async (userid, channelid, item, itemamount, timestamp) => {
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
const getUserItems = async (userId) => {
    if (!supabase) return null;
    try {
        const { data: userItems, error } = await supabase.from('user_item').select('*').eq('userid', userId);
        if (error && error.code !== 'PGRST116') {
            console.error(`Error fetching items for ${userId}:`, error.message); return null;
        }
        return userItems;
    } catch (error) { console.error(`Unexpected error fetching items for ${userId}:`, error); return null; }
};


// --- Helper Functions for Monster Event ---

/**
 * Gets the current UTC date as a string 'YYYY-MM-DD'.
 */
const getTodaysDateString = () => {
    return new Date().toISOString().slice(0, 10); // UTC date string
};

/**
 * Fetches the monster record for a specific date from 'event_monster'.
 */
const getMonsterForDate = async (dateString) => {
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
const createMonster = async (dateString, name, maxHp) => {
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
const logMonsterHit = async (monsterDate, userId, username, damage) => {
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
const getTotalDamageDealt = async (monsterDate) => {
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
const markMonsterAsDefeated = async (monsterDate, killerUserId, finalHp = 0) => {
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
const markRewardAnnounced = async (dateString) => {
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
 * Selects monster details and calls createMonster to spawn it for the given date.
 */
const spawnNewMonster = async (dateString) => {
    const chosenMonster = POSSIBLE_MONSTERS[Math.floor(Math.random() * POSSIBLE_MONSTERS.length)];
    const monsterHp = chosenMonster.baseHp * (LEVELING_FACTOR / 5);

    return await createMonster(dateString, chosenMonster.name, Math.round(monsterHp));
};


// --- Core Logic Functions ---

/**
 * Calculates the total EXP needed to reach the next level.
 */
const calculateNextLevelExp = (currentLevel) => {
    if (currentLevel === 0) return 50;
    const nextLevel = currentLevel + 1;
    return (currentLevel * LEVELING_FACTOR) * nextLevel;
};

/**
 * Processes user EXP gain, handles level ups, and resets EXP on level up.
 */
const processUserExp = (userId, username, currentExp, userLevel, expGained) => {
    let newExp = currentExp + expGained;
    let newLevel = userLevel;
    let levelUpOccurred = false;
    let nextLevelExp = calculateNextLevelExp(newLevel);

    while (newExp >= nextLevelExp) {
        newExp -= nextLevelExp;
        newLevel++;
        levelUpOccurred = true;
        console.log(`[${username}] Leveled up to Level ${newLevel}.`);
        newExp = 0;
        nextLevelExp = calculateNextLevelExp(newLevel);
    }
    return { newLevel, newExp, levelUpOccurred };
};

// --- Announcement and Response Functions (Thai Translations) ---

/**
 * Sends the bot online announcement to the gaming channel.
 */
const sendOnlineAnnouncement = async () => {
    if (!announcementChannel) {
        console.error('Gaming channel not found. Cannot send online announcement.');
        return;
    }
    const onlineMessage = `☀️ **เหล่าเกมเมอร์ ตื่นได้แล้ว!** @everyone\nบอท RPG คู่ใจ **ออนไลน์พร้อมลุยแล้วจ้า!** ✨\nมาเก็บเวล (\`!level\`), เช็คของ (\`!bag\`), ตีมอนประจำวัน (\`!monster\`), แล้วหาไอเทมแรร์กัน! 🔥\n*ได้เวลา **เปิดศึก!*** 🚀`;
    try {
        await announcementChannel.send(onlineMessage);
        console.log('Bot online announcement sent.');
    } catch (error) { console.error('Error sending online announcement:', error); }
};

/**
 * Sends a level up announcement embed to the announcement channel.
 */
const handleLevelUpAnnouncement = (message, newLevel, currentExp) => {
    if (!announcementChannel) {
        console.warn(`[${message.author.username}] Leveled up, but announcement channel unavailable.`);
        return;
    }
    const levelUpEmbed = new EmbedBuilder()
        .setColor(0x00FF00).setTitle('🎉 เลเวลอัพ! 🎉')
        .setDescription(`${message.author.toString()} อัพเลเวลแล้ว! เก่งมั่กๆ 👍`)
        .addFields(
            { name: 'เลเวลใหม่', value: newLevel.toString(), inline: true },
            { name: 'EXP ปัจจุบัน', value: currentExp.toString(), inline: true },
            { name: 'EXP เวลถัดไป', value: calculateNextLevelExp(newLevel).toString(), inline: true }
        )
        .setThumbnail(message.author.displayAvatarURL()).setTimestamp();
    announcementChannel.send({ embeds: [levelUpEmbed] });
    console.log(`[${message.author.username}] Sent level up announcement.`);
};

/**
 * Announces that a new monster has spawned in the gaming channel.
 */
const announceMonsterSpawn = (monsterData) => {
    if (!announcementChannel || !monsterData) {
        console.warn("Cannot announce monster spawn: Channel or monster data missing."); return;
    }
    const spawnEmbed = new EmbedBuilder()
        .setColor(0xFF4500).setTitle(`💥 มอนสเตอร์บุก! ${monsterData.name} ปรากฏตัว! 💥`)
        .setDescription(`เจ้า **${monsterData.name}** โผล่มาแล้ว! โจมตีมันด้วยการแชทเก็บ EXP ในช่องไหนก็ได้!\nEXP ของทุกคนคือดาเมจใส่บอส! 🔥`)
        .addFields(
            { name: 'พลังชีวิตทั้งหมด (HP)', value: `**${monsterData.max_hp}**`, inline: true },
            { name: 'วันที่ปรากฏตัว', value: monsterData.spawn_date, inline: true }
        ).setTimestamp();
    announcementChannel.send({ content: "@everyone ภารกิจท้าทายรายวันมาแล้ว!", embeds: [spawnEmbed] });
    console.log(`Announced spawn of ${monsterData.name}`);
};

/**
 * Announces monster defeat in the gaming channel and marks reward announced in DB.
 */
const announceMonsterDefeat = async (monsterData) => {
    if (!announcementChannel || !monsterData) {
        console.warn("Cannot announce monster defeat: Channel or monster data missing."); return;
    }
    const killerUser = monsterData.killed_by_user_id ? `<@${monsterData.killed_by_user_id}>` : "เหล่านักผจญภัย";
    const defeatEmbed = new EmbedBuilder()
        .setColor(0x32CD32).setTitle(`🎉 ชัยชนะ! ปราบ ${monsterData.name} สำเร็จ! 🎉`)
        .setDescription(`โค่น **${monsterData.name}** ได้แล้ว! ยินดีกับ **${killerUser}** ที่ปิดจ๊อบสุดท้าย! 🏆`)
        .addFields(
            { name: 'ปราบวันที่', value: monsterData.spawn_date, inline: true },
            { name: 'HP ทั้งหมด', value: monsterData.max_hp.toString(), inline: true }
        )
        .setTimestamp(monsterData.killed_at_timestamp ? new Date(monsterData.killed_at_timestamp) : new Date());

    if (monsterData.killed_by_user_id) {
        defeatEmbed.addFields({ name: 'ปิดจ๊อบโดย', value: `<@${monsterData.killed_by_user_id}>`, inline: true });
    }
    if (monsterData.killed_at_timestamp) {
        defeatEmbed.addFields({
            name: 'เวลาที่ปราบ',
            value: `<t:${Math.floor(new Date(monsterData.killed_at_timestamp).getTime() / 1000)}:R>`,
            inline: true
        });
    }

    try {
        await announcementChannel.send({ content: "@everyone กำจัดมอนสเตอร์ประจำวันสำเร็จ!", embeds: [defeatEmbed] });
        console.log(`Announced defeat of ${monsterData.name}`);
        await markRewardAnnounced(monsterData.spawn_date);

        // --- ADD DELETION STEP ---
        // 3. Delete Hit Logs for this monster
        console.log(`Proceeding to delete hit logs for defeated monster: ${monsterData.spawn_date}`);
        const deleted = await deleteMonsterHits(monsterData.spawn_date);
        if (!deleted) {
            console.error(`Failed to delete hit logs for monster ${monsterData.spawn_date} after announcement.`);
            // Log error but don't block further execution - announcement already sent.
        }
        // --- END DELETION STEP ---

    } catch (error) {
        console.error(`Error sending monster defeat announcement or marking reward:`, error);
    }
};


// --- Event Handling Logic ---

/**
 * Handles item drop logic based on channel configuration.
 */
const handleItemDrop = async (userId, channelId, message) => {

    // drop rate by channel
    // const dropConfig = channelDropConfigs[channelId];

    // manual fixed drop rate on every channel
    const dropConfig = { dropRate: 0.33, dropItems: MATERIAL_LIST };
    if (!dropConfig) return;

    const randomChance = Math.random();
    if (randomChance < dropConfig.dropRate) {
        const possibleItems = dropConfig.dropItems;
        if (!possibleItems || possibleItems.length === 0) return;

        const randomItem = possibleItems[Math.floor(Math.random() * possibleItems.length)];
        const itemAmount = 1;

        const itemInserted = await insertUserItem(userId, channelId, randomItem, itemAmount, new Date().toISOString());

        if (itemInserted && announcementChannel) {
            console.log(`[${message.author.username}] Sending item drop announcement.`);
            const itemDropEmbed = new EmbedBuilder()
                .setColor(0xFFD700).setTitle('✨ เจอไอเทม! ✨')
                .setDescription(`${message.author.toString()} สุ่มได้ของ!`)
                .addFields(
                    { name: 'ไอเทม', value: `${randomItem.emoji} ${randomItem.name}`, inline: true },
                    { name: 'จำนวน', value: itemAmount.toString(), inline: true },
                    { name: 'เจอที่', value: `<#${channelId}>`, inline: true }
                ).setTimestamp();
            announcementChannel.send({ embeds: [itemDropEmbed] });
        } else if (itemInserted) {
            console.warn(`[${message.author.username}] Earned item, but gaming channel unavailable for announcement.`);
        }
    }
};

/**
 * Checks total damage against max HP and updates monster status if defeated.
 */
const checkAndProcessMonsterDefeat = async (monsterDate, lastHitUserId) => {
    if (!currentMonsterState || !currentMonsterState.is_alive) {
        return false;
    }
    const maxHp = currentMonsterState.max_hp;
    const totalDamage = await getTotalDamageDealt(monsterDate);
    console.log(`[${lastHitUserId}] Check Damage for ${monsterDate}: Total ${totalDamage} / ${maxHp}`);

    if (totalDamage >= maxHp) {
        console.log(`Defeat condition met for ${monsterDate}. Attempting to mark as defeated.`);
        const updatedMonster = await markMonsterAsDefeated(monsterDate, lastHitUserId);

        if (updatedMonster) {
            console.log(`Monster ${monsterDate} was marked defeated by this check.`);
            currentMonsterState = { ...currentMonsterState, ...updatedMonster };
            currentMonsterState.is_alive = false;
            currentMonsterState.is_reward_announced = false;

            return true;
        } else {
            console.log(`Failed to mark ${monsterDate} as defeated (might already be done).`);
            if (currentMonsterState.is_alive) {
                const checkDbAgain = await getMonsterForDate(monsterDate);
                if (checkDbAgain && !checkDbAgain.is_alive) {
                    console.log(`Syncing local state for ${monsterDate} to dead based on DB.`);
                    currentMonsterState = { ...currentMonsterState, ...checkDbAgain };
                }
            }
            return false;
        }
    }
    return false;
};

/**
 * Deletes all hit records for a specific monster spawn date from 'event_monster_hit'.
 * @param {string} monsterDate - The spawn date 'YYYY-MM-DD' of the monster whose hits should be deleted.
 * @returns {Promise<boolean>} True if deletion was successful or no rows needed deleting, false on error.
 */
const deleteMonsterHits = async (monsterDate) => {
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
        // You might need a brief pause or re-query here to *confirm* deletion in tests
        // await new Promise(resolve => setTimeout(resolve, 500)); // e.g., wait 500ms
        // const { count: finalCount } = await supabase.from('event_monster_hit').select('*', { count: 'exact', head: true }).eq('monster_spawn_date', monsterDate);
        // console.log(`[DeleteHits] Final count for ${monsterDate} after deletion attempt: ${finalCount}`);

        return true;

    } catch (error) {
        console.error(`[DeleteHits] Unexpected error during process for ${monsterDate}:`, error);
        return false;
    }
};

/**
 * Processes messages for EXP gain, leveling, item drops, and monster damage logging/checking.
 */
const handleExpGain = async (message) => {
    const userId = message.author.id;
    const username = message.author.username;
    const currentMessageTimestamp = message.createdTimestamp;

    if (message.author.bot || !supabase || disAllowChannelArray(message.channel.id)) return;

    try {
        let userData = await getUser(userId);
        let userLevel = 0, userExp = 0;

        if (userData) {
            userLevel = userData.level; userExp = userData.current_exp;
            if (userData.username !== username) await updateUsername(userId, username);
        } else {
            userLevel = 1; userExp = 0;
            const inserted = await insertUser(userId, username, userLevel, userExp, new Date(currentMessageTimestamp).toISOString());
            if (!inserted) return;
            userData = { level: userLevel, current_exp: userExp };
        }

        const lastExpTimestamp = userCooldowns.get(userId) || 0;
        const timeSinceLastExp = currentMessageTimestamp - lastExpTimestamp;

        if (timeSinceLastExp >= COOLDOWN_MILLISECONDS) {
            const expGainedFromMessage = message.content.length * EXP_PER_CHARACTER;

            if (expGainedFromMessage <= 0) {
                if (userData && userData.username !== username) await updateUsername(userId, username);
                return;
            }

            console.log(`[${username}] Cooldown passed. Processing ${expGainedFromMessage} EXP.`);

            let monsterKilledThisCheck = false;
            const damageDealt = (expGainedFromMessage >= 100) ? 100 : expGainedFromMessage;

            if (currentMonsterState && currentMonsterState.is_alive && damageDealt > 0) {
                console.log(`[${username}] Logging ${damageDealt} damage for monster ${currentMonsterState.name}.`);
                const logged = await logMonsterHit(currentMonsterState.spawn_date, userId, username, damageDealt);
                if (logged) {
                    monsterKilledThisCheck = await checkAndProcessMonsterDefeat(currentMonsterState.spawn_date, userId);
                } else {
                    console.error(`[${username}] Failed to log hit for monster ${currentMonsterState.spawn_date}.`);
                }
            }

            const { newLevel, newExp, levelUpOccurred } = processUserExp(userId, username, userExp, userLevel, expGainedFromMessage);
            userCooldowns.set(userId, currentMessageTimestamp);

            const updated = await updateUser(userId, {
                username: username, level: newLevel, current_exp: newExp,
                last_online_timestamp: new Date(currentMessageTimestamp).toISOString()
            });

            if (monsterKilledThisCheck && currentMonsterState && !currentMonsterState.is_reward_announced) {
                console.log(`Announcing defeat for ${currentMonsterState.name} triggered by ${username}'s hit.`);
                await announceMonsterDefeat(currentMonsterState);
                if (currentMonsterState) currentMonsterState.is_reward_announced = true;
            }

            if (updated && levelUpOccurred) {
                handleLevelUpAnnouncement(message, newLevel, newExp);
            } else if (levelUpOccurred && !updated) {
                console.error(`[${username}] Leveled up but failed DB update.`);
            }

            await handleItemDrop(userId, message.channel.id, message);

        } else {
            if (userData && userData.username !== username) await updateUsername(userId, username);
        }

    } catch (error) {
        console.error(`[${username}] Unexpected error during EXP processing:`, error);
    }
};


/**
 * Checks the daily monster status every hour. Handles spawning, status verification, and cleanup.
 */
const hourlyMonsterCheck = async () => {
    if (!supabase || !announcementChannel) {
        console.log(`Hourly Check: Supabase (${!!supabase}) or Gaming Channel (${!!announcementChannel}) unavailable. Skipping.`);
        return;
    }

    console.log("Running hourly monster check...");
    const today = getTodaysDateString();
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = yesterdayDate.toISOString().slice(0, 10);

    try {
        const yesterdaysMonster = await getMonsterForDate(yesterday);
        if (yesterdaysMonster && yesterdaysMonster.is_alive) {
            console.warn(`Hourly Check: Found monster from yesterday (${yesterday}) still alive: ${yesterdaysMonster.name}`);
            console.log(`Attempting to mark yesterday's monster (${yesterday}) defeated.`);
            const updatedYesterdaysMonster = await markMonsterAsDefeated(yesterday, client.user.id); // Use bot ID
            if (updatedYesterdaysMonster) {
                console.log(`Successfully marked overdue monster ${yesterday} defeated.`);
                if (!updatedYesterdaysMonster.is_reward_announced) {
                    console.log(`Announcing defeat for overdue monster ${yesterday}.`);
                    await announceMonsterDefeat(updatedYesterdaysMonster);
                } else {
                    // If already announced but just marked dead, still delete logs
                    console.log(`Overdue monster ${yesterday} was already announced, deleting logs.`);
                    await deleteMonsterHits(yesterday);
                }
            } else {
                console.error(`Failed to mark overdue monster ${yesterday} defeated.`);
            }
        }

        let monsterForToday = await getMonsterForDate(today);

        if (!monsterForToday) {
            console.log("Hourly Check: No monster for today. Spawning...");
            const newMonster = await spawnNewMonster(today);
            if (newMonster) {
                currentMonsterState = newMonster;
                announceMonsterSpawn(currentMonsterState);
            } else {
                console.error("Hourly Check: Failed to spawn new monster.");
                currentMonsterState = null;
            }
            return;
        }

        currentMonsterState = monsterForToday;
        console.log(`Hourly Check: Found today's monster: ${currentMonsterState.name} (DB Alive: ${currentMonsterState.is_alive}, Announced: ${currentMonsterState.is_reward_announced})`);

        if (currentMonsterState.is_alive) {
            const totalDamage = await getTotalDamageDealt(today);
            console.log(`Hourly Check (Today's Alive Monster): Total Damage ${totalDamage} / ${currentMonsterState.max_hp}`);
            if (totalDamage >= currentMonsterState.max_hp) {
                console.log(`Hourly Check: Monster ${today} should be dead. Marking defeated.`);
                const updatedMonster = await markMonsterAsDefeated(today, client.user.id); // Use bot ID
                if (updatedMonster) {
                    currentMonsterState = { ...currentMonsterState, ...updatedMonster };
                    console.log("Hourly Check: Monster status corrected to defeated.");
                    if (!currentMonsterState.is_reward_announced) {
                        console.log("Hourly Check: Announcing defeat after correction.");
                        await announceMonsterDefeat(currentMonsterState);
                        if (currentMonsterState) currentMonsterState.is_reward_announced = true;
                    }
                } else {
                    console.warn(`Hourly Check: Failed to mark ${today} defeated (might be done).`);
                    currentMonsterState = await getMonsterForDate(today); // Re-fetch
                }
            } else {
                console.log(`Hourly Check: Monster ${currentMonsterState.name} correctly marked alive.`);
            }
        } else { // Dead in DB
            if (!currentMonsterState.is_reward_announced) {
                console.log("Hourly Check: Monster dead but unannounced. Announcing.");
                await announceMonsterDefeat(currentMonsterState);
                if (currentMonsterState) currentMonsterState.is_reward_announced = true;
            } else {
                console.log("Hourly Check: Monster dead and announced.");
                await deleteMonsterHits(today);
            }
        }

    } catch (error) {
        console.error("Error during hourly monster check:", error);
    }
};

/**
 * Handles the '!rank' command with a fancier embed and progress bar. Works in any channel.
 * @param {object} message - Discord message object.
 */
const handleRankCommand = async (message) => {
    // No channel check needed anymore
    if (!supabase) {
        message.reply('ฐานข้อมูลมีปัญหา เช็คอันดับไม่ได้จ้า 😥'); // Thai Error
        return;
    }

    const userId = message.author.id;
    const username = message.author.username;
    const userAvatar = message.author.displayAvatarURL(); // Get user avatar URL

    try {
        const userData = await getUser(userId);
        if (userData) {
            const userLevel = userData.level;
            const userExp = userData.current_exp;
            const nextLevelExp = calculateNextLevelExp(userLevel);

            // --- Progress Bar Calculation ---
            const totalBlocks = 10; // Number of blocks in the progress bar
            let filledBlocks = 0;
            let percentage = 0;

            if (nextLevelExp > 0) { // Avoid division by zero
                // Ensure current EXP doesn't exceed needed EXP for calculation purposes
                const cappedExp = Math.min(userExp, nextLevelExp);
                percentage = (cappedExp / nextLevelExp) * 100;
                filledBlocks = Math.floor(percentage / (100 / totalBlocks));
            } else {
                // Handle cases where nextLevelExp might be 0 or negative (shouldn't happen with current formula)
                filledBlocks = totalBlocks; // Max out bar if next level isn't defined properly
                percentage = 100;
            }

            const emptyBlocks = totalBlocks - filledBlocks;
            // Using Green Square for filled, Black Square for empty
            const progressBar = '🟩'.repeat(filledBlocks) + '⬛'.repeat(emptyBlocks);
            // --- End Progress Bar Calculation ---

            // Thai Translation & Fancier Embed
            const rankEmbed = new EmbedBuilder()
                .setColor(0xFFD700) // Gold color for flair
                .setTitle(`🌟 เลเวล 🌟`) // Thai: Status of [Username]
                .setDescription(`${message.author.toString()} ขอส่องหน่อยซิว่าไปถึงไหนแล้ว!`)
                .setThumbnail(userAvatar) // Use user's avatar
                .addFields(
                    { name: 'เลเวลปัจจุบัน', value: `**${userLevel}**`, inline: true }, // Thai: Current Level
                    { name: 'ค่าประสบการณ์ (EXP)', value: `${userExp} / ${nextLevelExp}`, inline: true }, // Thai: Experience (EXP)
                    { name: 'ความคืบหน้าเลเวลถัดไป', value: `${progressBar} (${percentage.toFixed(1)}%)`, inline: false } // Thai: Progress Next Level
                )
                .setFooter({ text: `สะสม EXP ต่อไปนะ สู้ๆ! 💪` }) // Thai: Keep collecting EXP, fighting!
                .setTimestamp();

            message.reply({ embeds: [rankEmbed] });
            console.log(`[${username}] Replied to !rank with fancy embed in channel ${message.channel.name}.`);

        } else {
            message.reply('คุณยังไม่มีอันดับเลยนะ! ส่งข้อความเพื่อเริ่มเก็บ EXP สิ! 💪'); // Thai Encouragement
            console.log(`[${username}] User not found for !rank.`);
        }
    } catch (error) {
        console.error('Error during rank command:', error);
        message.reply('อุ๊ปส์! มีข้อผิดพลาดตอนเช็คอันดับ ลองใหม่นะ'); // Thai Error
    }
};


/**
 * Handles the '!chat' command.
 */
const handleChatCommand = async (message, args) => {
    const userMessage = args.join(' ');
    if (!userMessage) {
        message.reply('ลืมใส่ข้อความรึเปล่า? บอกหน่อยสิว่าจะให้พูดว่าอะไร 😉');
        return;
    }
    try {
        await message.channel.send(userMessage);
        console.log(`[${message.author.username}] Repeated chat message.`);
    } catch (error) {
        console.error('Error sending chat reply:', error);
        message.reply('อ่า... ส่งข้อความนี้ไม่ได้แฮะ ขอโทษที 🙏');
    }
};

/**
 * Handles the '!bag' command in the gaming channel.
 */
const handleBagCommand = async (message) => {
    // if (message.channel.id !== GAMING_CHANNEL_ID) {
    //     console.log(`[${message.author.username}] Used !bag in wrong channel: ${message.channel.name}.`);
    //     message.reply(`ใช้คำสั่ง \`!bag\` ในช่อง <#${GAMING_CHANNEL_ID}> เท่านั้นนะ!`);
    //     return;
    // }
    if (!supabase) {
        message.reply('ฐานข้อมูลมีปัญหา เปิดกระเป๋าไม่ได้จ้า 😥');
        return;
    }
    const userId = message.author.id;
    const username = message.author.username;
    try {
        const userItems = await getUserItems(userId);
        const itemList = (userItems && userItems.length > 0)
            ? Object.entries(userItems.reduce((accumulator, item) => {
                const key = item.itemname;  // Group by itemname
                if (!accumulator[key]) {
                    accumulator[key] = {
                        itememoji: item.itememoji,
                        itemname: item.itemname,
                        amount: 0
                    };
                }
                accumulator[key].amount += item.itemamount;
                return accumulator;
            }, {})).map(([_, value]) => `${value.itememoji} ${value.itemname}: ${value.amount}`).join('\n') : "กระเป๋าว่างเปล่าเลย... แชทเล่นหาของกันเถอะ!";
        const bagEmbed = new EmbedBuilder()
            .setColor(0x8A2BE2)
            .setTitle(`🎒 กระเป๋าของฉัน 🎒`)
            .setDescription(`${message.author.toString()} เปิดดูข้างในกระเป๋าหน่อยสิ\n\n${itemList}`)
            .setFooter({ text: `สะสมไอเทมเอาไว้นะเผื่อแลกรางวัล 😉` })
            .setTimestamp();
        message.reply({ embeds: [bagEmbed] });
        console.log(`[${username}] Replied to !bag.`);
    } catch (error) {
        console.error('Error during bag command:', error);
        message.reply('อุ๊ปส์! มีข้อผิดพลาดตอนเปิดกระเป๋า ลองใหม่นะ');
    }
};

/**
 * Handles the '!monster' command to show today's monster status in the gaming channel.
 */
const handleMonsterCommand = async (message) => {
    // if (message.channel.id !== GAMING_CHANNEL_ID) {
    //     console.log(`[${message.author.username}] Used !monster in wrong channel: ${message.channel.name}.`);
    //     message.reply(`ใช้คำสั่ง \`!monster\` ในช่อง <#${GAMING_CHANNEL_ID}> เท่านั้นนะ!`);
    //     return;
    // }
    if (!supabase) {
        message.reply('ฐานข้อมูลมีปัญหา เช็คสถานะมอนไม่ได้จ้า 😥');
        return;
    }
    const today = getTodaysDateString();
    console.log(`[${message.author.username}] Requested monster status for ${today}.`);
    try {
        let monsterData = currentMonsterState && currentMonsterState.spawn_date === today
            ? currentMonsterState
            : await getMonsterForDate(today);

        if (monsterData) {
            let status = "☠️";
            let remainingHpText = "0";
            let color = 0x32CD32;

            if (monsterData.is_alive) {
                const totalDamage = await getTotalDamageDealt(today);
                const remainingHp = Math.max(0, monsterData.max_hp - totalDamage);
                if (remainingHp <= 0) {
                    status = "☠️ (รออัพเดท)";
                } else {
                    status = "⚔️";
                    remainingHpText = remainingHp.toString();
                    color = 0xFF4500;
                }
            }

            const monsterEmbed = new EmbedBuilder()
                .setColor(color)
                .setTitle(`👽 สถานะมอนสเตอร์วันนี้ (${today}) 🦑`)
                .addFields(
                    { name: 'ชื่อ', value: monsterData.name, inline: true },
                    { name: 'สถานะ', value: `**${status}**`, inline: true },
                    { name: 'พลังชีวิต (HP)', value: `${remainingHpText} / ${monsterData.max_hp}`, inline: true },
                )
                .setTimestamp();

            if (!monsterData.is_alive && monsterData.killed_by_user_id) {
                monsterEmbed.addFields({ name: 'ปิดจ๊อบโดย', value: `<@${monsterData.killed_by_user_id}>`, inline: true });
            }
            if (!monsterData.is_alive && monsterData.killed_at_timestamp) {
                monsterEmbed.addFields({ name: 'เวลาที่ปราบ', value: `<t:${Math.floor(new Date(monsterData.killed_at_timestamp).getTime() / 1000)}:R>`, inline: true });
            }
            message.reply({ embeds: [monsterEmbed] });
        } else {
            message.reply(`ยังไม่มีมอนสเตอร์เกิดวันนี้ (${today}) เลยนะ! 😴`);
            console.log(`No monster found for ${today} via !monster command.`);
        }
    } catch (error) {
        console.error('Error during monster command:', error);
        message.reply('อุ๊ปส์! มีข้อผิดพลาดตอนเช็คสถานะมอนสเตอร์ ลองใหม่นะ');
    }
};


// --- Bot Ready Event ---
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    console.log(`Supabase client initialized: ${!!supabase}`);

    // Fetch Channel Objects
    if (ANNOUNCEMENT_CHANNEL_ID) {
        try {
            announcementChannel = await client.channels.fetch(ANNOUNCEMENT_CHANNEL_ID);
            if (announcementChannel) console.log(`Announcement channel found: ${announcementChannel.name}`);
            else console.error(`Could not find announcement channel: ${ANNOUNCEMENT_CHANNEL_ID}`);
        } catch (error) { console.error(`Error fetching announcement channel:`, error); announcementChannel = null; }
    }
    // if (GAMING_CHANNEL_ID) {
    //     try {
    //         gamingChannel = await client.channels.fetch(GAMING_CHANNEL_ID);
    //         if (gamingChannel) console.log(`Gaming channel found: ${gamingChannel.name}`);
    //         else console.error(`Could not find gaming channel: ${GAMING_CHANNEL_ID}.`);
    //     } catch (error) { console.error(`Error fetching gaming channel:`, error); gamingChannel = null; }
    // }

    // Send Online Announcement
    if (announcementChannel) {
        // await sendOnlineAnnouncement();
    } else {
        console.warn("Gaming channel unavailable, cannot send online announcement.");
    }

    // Setup Hourly Monster Check
    if (supabase && announcementChannel) {
        console.log("Setting up hourly monster check...");
        await hourlyMonsterCheck(); // Initial check on startup
        setInterval(hourlyMonsterCheck, HOURLY_CHECK_INTERVAL); // Recurring hourly check
        console.log(`Hourly monster check scheduled every ${HOURLY_CHECK_INTERVAL / (60 * 1000)} minutes.`);
    } else {
        console.warn("Hourly monster check cannot be started: Supabase or Gaming Channel unavailable.");
    }
});

// --- Message Create Event ---
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // Command Handling
    if (message.content.toLowerCase().startsWith(COMMAND_PREFIX)) {
        const args = message.content.slice(COMMAND_PREFIX.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        // !leaderboard
        if (command === 'leaderboard') {
            await handleLeaderboardCommand(message, supabase, client);
            return;
        }

        if (command === 'rank' || command === 'level') handleRankCommand(message);
        else if (command === 'chat') handleChatCommand(message, args);
        else if (command === 'bag') handleBagCommand(message);
        else if (command === 'monster') handleMonsterCommand(message);
        // Add other commands here
    }
    // Non-Command Message Processing
    else {
        // --- ADD BOT MENTION CHECK HERE ---
        // Check if the bot user was specifically mentioned (not @everyone or a role)
        if (message.mentions.has(client.user)) {
            // Select a random cat reply
            const randomIndex = Math.floor(Math.random() * catReplies.length);
            const replyText = catReplies[randomIndex];

            try {
                // Reply to the user's message
                await message.reply(replyText);
                console.log(`[${message.author.username}] Mentioned the bot. Replied with: ${replyText}`);
            } catch (error) {
                console.error("Error sending cat reply:", error);
            }
            // Stop further processing (like EXP gain) for this message after replying
            return;
        }
        // --- END BOT MENTION CHECK ---

        // If not mentioned, proceed with normal EXP gain logic
        // Add Supabase check back here specifically for EXP gain
        if (!supabase) {
            // console.log("Supabase not available, skipping EXP gain."); // Can be noisy
            return;
        }

        handleExpGain(message); // Handles EXP, item drops, hit logging, and defeat checks
    }
});

// --- Login to Discord ---
if (TOKEN) {
    client.login(TOKEN);
} else {
    console.error("FATAL: Bot cannot login without DISCORD_TOKEN!");
}

// --- Handle Process Exit ---
process.on('exit', () => console.log('Bot shutting down.'));
process.on('SIGINT', () => { console.log('SIGINT received. Shutting down.'); process.exit(); });