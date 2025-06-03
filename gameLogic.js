const { EmbedBuilder } = require('discord.js');
const { supabase } = require('./supabaseClient');
const constants = require('./constants'); // Changed import style
const {
    getUser, insertUser, updateUser, updateUsername, insertUserItem,
    getMonsterForDate, createMonster, logMonsterHit, getTotalDamageDealt,
    markMonsterAsDefeated, deleteMonsterHits
} = require('./dbUtils');
const { handleLevelUpAnnouncement, announceMonsterSpawn, announceMonsterDefeat } = require('./announcements');

// const { handleDropByLocation } = require('./dropItem.js'); // don't get exp on these channel
const { getChannel } = require('./providers/channelProvider');
const { handleItemDropV2 } = require('./managers/itemManager.js');
const { createDamageEmbed } = require('./managers/embedManager');
const { getMonsters } = require('./providers/monsterProvider');
const { fetchOrGetChannel } = require('./managers/channelManager.js');

/**
 * Gets the current UTC date as a string 'YYYY-MM-DD'.
 */
const getTodaysDateString = () => {
    return new Date().toISOString().slice(0, 10); // UTC date string
};

/**
 * Calculates the total EXP needed to reach the next level.
 */
const calculateNextLevelExp = (currentLevel) => {
    if (currentLevel === 0) return 50;
    const nextLevel = currentLevel + 1;
    return (currentLevel * constants.LEVELING_FACTOR) * nextLevel;
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
        newExp = 0; // Reset EXP on level up
        nextLevelExp = calculateNextLevelExp(newLevel);
    }
    return { newLevel, newExp, levelUpOccurred };
};

/**
 * Selects monster details and calls createMonster to spawn it for the given date.
 */
const spawnNewMonster = async (dateString) => {

    const allMonsters = await getMonsters();

    if (!allMonsters || allMonsters.length === 0) {
        console.error("[GameLogic] spawnNewMonster: No monsters found in the database to choose from. Cannot spawn a new monster.");
        return null; // Indicate that no monster could be spawned
    }

    const chosenMonster = allMonsters[Math.floor(Math.random() * allMonsters.length)];
    const monsterHp = chosenMonster.base_hp * (constants.LEVELING_FACTOR / 5);

    return await createMonster(dateString, chosenMonster.name, Math.round(monsterHp));
};

/**
 * Checks total damage against max HP and updates monster status if defeated.
 * Returns true if the monster was defeated *by this check*, false otherwise.
 */
const checkAndProcessMonsterDefeat = async (monsterDate, lastHitUserId, currentMonsterStateRef) => {
    if (!currentMonsterStateRef.current || !currentMonsterStateRef.current.is_alive) {
        return false;
    }
    const maxHp = currentMonsterStateRef.current.max_hp;
    const totalDamage = await getTotalDamageDealt(monsterDate);
    console.log(`[${lastHitUserId}] Check Damage for ${monsterDate}: Total ${totalDamage} / ${maxHp}`);

    if (totalDamage >= maxHp) {
        console.log(`Defeat condition met for ${monsterDate}. Attempting to mark as defeated.`);
        const updatedMonster = await markMonsterAsDefeated(monsterDate, lastHitUserId);

        if (updatedMonster) {
            console.log(`Monster ${monsterDate} was marked defeated by this check.`);
            // Update the shared state object directly
            currentMonsterStateRef.current = { ...currentMonsterStateRef.current, ...updatedMonster, is_alive: false, is_reward_announced: false };
            return true; // Defeated by this check
        } else {
            console.log(`Failed to mark ${monsterDate} as defeated (might already be done).`);
            // Re-sync state if it failed but DB shows it's dead
            if (currentMonsterStateRef.current.is_alive) {
                const checkDbAgain = await getMonsterForDate(monsterDate);
                if (checkDbAgain && !checkDbAgain.is_alive) {
                    console.log(`Syncing local state for ${monsterDate} to dead based on DB.`);
                    currentMonsterStateRef.current = { ...currentMonsterStateRef.current, ...checkDbAgain };
                }
            }
            return false; // Not defeated by this specific check/update attempt
        }
    }
    return false; // Not enough damage yet
};

/**
 * Processes messages for EXP gain, leveling, item drops, and monster damage logging/checking.
 */
const handleExpGain = async (message, userCooldowns, announcementChannel, itemDropChannel, damageLogChannel, currentMonsterStateRef) => {
    const userId = message.author.id;
    const username = message.author.username;
    const currentMessageTimestamp = message.createdTimestamp;

    // Clean up discord message prevent using emoji or http images spamming
    message.content = cleanDiscordMessage(message.content);

    console.log(`[${username}]--->${message.content}<---`);

    const allowedChannelData = await fetchOrGetChannel({isGainExp: true});
    const isChannelAllowed = allowedChannelData && allowedChannelData.some(channel => channel.id === message.channel.id);

    if (message.author.bot || !supabase || !isChannelAllowed) return;

    try {
        let userData = await getUser(userId);
        let userLevel = 0, userExp = 0;

        // EXP_PER_CHARACTER and COOLDOWN_MILLISECONDS are now loaded from constants, which are updated at startup
        if (userData) {
            userLevel = userData.level; userExp = userData.current_exp;
            if (userData.username !== username) await updateUsername(userId, username);
        } else {
            userLevel = 1; userExp = 0;
            const inserted = await insertUser(userId, username, userLevel, userExp, new Date(currentMessageTimestamp).toISOString());
            if (!inserted) return;
            userData = { level: userLevel, current_exp: userExp }; // Simulate userData for cooldown check
        }

        const lastExpTimestamp = userCooldowns.get(userId) || 0;
        const timeSinceLastExp = currentMessageTimestamp - lastExpTimestamp;

        if (timeSinceLastExp >= constants.COOLDOWN_MILLISECONDS) {
            const expGainedFromMessage = message.content.length * constants.EXP_PER_CHARACTER;

            if (expGainedFromMessage <= 0) {
                // Still update username if needed, even with 0 EXP gain
                if (userData && userData.username !== username) await updateUsername(userId, username);
                return;
            }

            console.log(`[${username}] Cooldown passed. Processing ${expGainedFromMessage} EXP.`);

            let monsterKilledThisCheck = false;
            const damageDealt = Math.min(expGainedFromMessage, 50); // Cap damage per message
            
            // Use the reference object for current monster state
            if (currentMonsterStateRef.current && currentMonsterStateRef.current.is_alive && damageDealt > 0) {
                console.log(`[${username}] Logging ${damageDealt} damage for monster ${currentMonsterStateRef.current.name}.`);
                const logged = await logMonsterHit(currentMonsterStateRef.current.spawn_date, userId, username, damageDealt);
                if (logged) {
                    // Announce damage dealt
                    if (damageLogChannel && currentMonsterStateRef.current && currentMonsterStateRef.current.name) {
                        try {
                            const damageEmbed = createDamageEmbed(message.author, currentMonsterStateRef.current.name, damageDealt);
                            await damageLogChannel.send({ embeds: [damageEmbed] });
                            console.log(`[${username}] Sent damage log for hitting ${currentMonsterStateRef.current.name} with ${damageDealt} damage.`);
                        } catch (error) {
                            console.error(`[${username}] Error sending damage log embed:`, error);
                        }
                    }
                    // Check if monster is defeated
                    monsterKilledThisCheck = await checkAndProcessMonsterDefeat(currentMonsterStateRef.current.spawn_date, userId, currentMonsterStateRef);
                } else {
                    console.error(`[${username}] Failed to log hit for monster ${currentMonsterStateRef.current.spawn_date}.`);
                }
            }

            const { newLevel, newExp, levelUpOccurred } = processUserExp(userId, username, userExp, userLevel, expGainedFromMessage);
            userCooldowns.set(userId, currentMessageTimestamp);

            const updated = await updateUser(userId, {
                username: username, level: newLevel, current_exp: newExp,
                last_online_timestamp: new Date(currentMessageTimestamp).toISOString()
            });

            // Check the reference object's state after potential update by checkAndProcessMonsterDefeat
            if (monsterKilledThisCheck && currentMonsterStateRef.current && !currentMonsterStateRef.current.is_reward_announced) {
                console.log(`Announcing defeat for ${currentMonsterStateRef.current.name} triggered by ${username}'s hit.`);
                await announceMonsterDefeat(announcementChannel, currentMonsterStateRef.current);
                // Mark announced in the shared state immediately after announcement attempt
                if (currentMonsterStateRef.current) currentMonsterStateRef.current.is_reward_announced = true;
            }

            if (updated && levelUpOccurred) {
                handleLevelUpAnnouncement(message, newLevel, newExp, announcementChannel);
            } else if (levelUpOccurred && !updated) {
                console.error(`[${username}] Leveled up but failed DB update.`);
            }

            await handleItemDropV2(message, itemDropChannel);

        } else {
            // Update username even if on cooldown
            if (userData && userData.username !== username) await updateUsername(userId, username);
        }

    } catch (error) {
        console.error(`[${username}] Unexpected error during EXP processing:`, error);
    }
};

/**
 * Checks the daily monster status every hour. Handles spawning, status verification, and cleanup.
 * Uses a reference object for currentMonsterState to allow modification.
 */
const hourlyMonsterCheck = async (client, announcementChannel, currentMonsterStateRef) => {
    if (!supabase || !announcementChannel) {
        console.log(`Hourly Check: Supabase (${!!supabase}) or Announcement Channel (${!!announcementChannel}) unavailable. Skipping.`);
        return;
    }

    console.log("Running hourly monster check...");
    const today = getTodaysDateString();
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = yesterdayDate.toISOString().slice(0, 10);

    try {
        // --- Check Yesterday's Monster ---
        const yesterdaysMonster = await getMonsterForDate(yesterday);
        if (yesterdaysMonster && yesterdaysMonster.is_alive) {
            console.warn(`Hourly Check: Found monster from yesterday (${yesterday}) still alive: ${yesterdaysMonster.name}. Marking defeated.`);
            const updatedYesterdaysMonster = await markMonsterAsDefeated(yesterday, client.user.id); // Use bot ID
            if (updatedYesterdaysMonster) {
                if (!updatedYesterdaysMonster.is_reward_announced) {
                    await announceMonsterDefeat(announcementChannel, updatedYesterdaysMonster);
                } else {
                    await deleteMonsterHits(yesterday); // Already announced, just delete hits
                }
            } else {
                console.error(`Failed to mark overdue monster ${yesterday} defeated.`);
            }
        } else if (yesterdaysMonster && !yesterdaysMonster.is_alive && yesterdaysMonster.is_reward_announced) {
            // Clean up hits if yesterday's monster is dead and announced
            await deleteMonsterHits(yesterday);
        }

        // --- Check Today's Monster ---
        let monsterForToday = await getMonsterForDate(today);

        if (!monsterForToday) {
            console.log("Hourly Check: No monster for today. Spawning...");
            const newMonster = await spawnNewMonster(today);
            if (newMonster) {
                currentMonsterStateRef.current = newMonster; // Update shared state
                announceMonsterSpawn(announcementChannel, currentMonsterStateRef.current);
            } else {
                console.error("Hourly Check: Failed to spawn new monster.");
                currentMonsterStateRef.current = null; // Update shared state
            }
            return; // Exit after spawning
        }

        // Monster exists for today, update local state
        currentMonsterStateRef.current = monsterForToday;
        console.log(`Hourly Check: Found today's monster: ${currentMonsterStateRef.current.name} (DB Alive: ${currentMonsterStateRef.current.is_alive}, Announced: ${currentMonsterStateRef.current.is_reward_announced})`);

        if (currentMonsterStateRef.current.is_alive) {
            const totalDamage = await getTotalDamageDealt(today);
            console.log(`Hourly Check (Today's Alive Monster): Total Damage ${totalDamage} / ${currentMonsterStateRef.current.max_hp}`);
            if (totalDamage >= currentMonsterStateRef.current.max_hp) {
                console.log(`Hourly Check: Monster ${today} should be dead based on damage. Marking defeated.`);
                // Pass the reference object here as well
                const defeatedNow = await checkAndProcessMonsterDefeat(today, client.user.id, currentMonsterStateRef);
                if (defeatedNow && currentMonsterStateRef.current && !currentMonsterStateRef.current.is_reward_announced) {
                    console.log("Hourly Check: Announcing defeat after correction.");
                    await announceMonsterDefeat(announcementChannel, currentMonsterStateRef.current);
                    if (currentMonsterStateRef.current) currentMonsterStateRef.current.is_reward_announced = true; // Mark announced in state
                } else if (!defeatedNow) {
                    console.warn(`Hourly Check: Failed to mark ${today} defeated via check function (might be done). Re-fetching.`);
                    currentMonsterStateRef.current = await getMonsterForDate(today); // Re-sync state
                }
            } else {
                console.log(`Hourly Check: Monster ${currentMonsterStateRef.current.name} correctly marked alive.`);
            }
        } else { // Dead in DB
            if (!currentMonsterStateRef.current.is_reward_announced) {
                console.log("Hourly Check: Monster dead but unannounced. Announcing.");
                await announceMonsterDefeat(announcementChannel, currentMonsterStateRef.current);
                if (currentMonsterStateRef.current) currentMonsterStateRef.current.is_reward_announced = true; // Mark announced in state
            } else {
                console.log("Hourly Check: Monster dead and announced. Cleaning up hits.");
                await deleteMonsterHits(today);
            }
        }

    } catch (error) {
        console.error("Error during hourly monster check:", error);
    }
};

  /**
   * Cleans the input message by replacing Discord custom emojis, hyperlinks,
   * markdown links (including attachments), and spoiler URLs with '0'.
   * Standard Unicode emojis are also removed.
   * @param {string} messageContent - The original message content from Discord.
   * @returns {string} The cleaned message content.
   */
const cleanDiscordMessage = (messageContent) => {
    /*let cleaned = messageContent;

    // 1. Remove standard Unicode emojis
    // This regex matches most common Unicode emojis.
    // It's a broad match and might not cover all edge cases, but covers many.
    cleaned = cleaned.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F200}-\u{1F25F}\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{2500}-\u{25FF}\u{2100}-\u{21FF}\u{2A00}-\u{2AFF}\u{2E00}-\u{2E7F}\u{3000}-\u{303F}\uFE0F]/gu, '');

    // 2. Replace Discord custom emojis (e.g., <:emoji_name:emoji_id>) with '0'
    // This regex looks for the pattern <:[a-zA-Z0-9_]+:[0-9]+>
    // It also handles animated emojis <a:emoji_name:emoji_id>
    cleaned = cleaned.replace(/<a?:[a-zA-Z0-9_]+:[0-9]+>/g, '0');

    // 3. Replace Discord markdown links (e.g., [text](url), ![alt](url)) with '0'
    // This covers both regular markdown links and image markdown links,
    // including those using http/https or attachment:// schemes.
    cleaned = cleaned.replace(/!?\[.*?\]\((https?|attachment):\/\/[^\s]+\)/g, '0');

    // 4. Replace Discord spoiler URLs (e.g., ||url||) with '0'
    // This specifically targets URLs wrapped in spoiler tags.
    cleaned = cleaned.replace(/\|\|(https?|attachment):\/\/[^\s]+\|\|/g, '0');

    // 5. Replace any remaining generic hyperlinks (http/https/attachment URLs) with '0'
    // This acts as a catch-all for any URLs not covered by the markdown or spoiler regexes.
    cleaned = cleaned.replace(/(https?|attachment):\/\/[^\s]+/g, '0');

    // 6. Trim any leading/trailing whitespace that might result from replacements
    cleaned = cleaned.trim();

    if (messageContent && messageContent != "" && cleaned == "") {
        cleaned = "0";
    }

    return cleaned;*/

    // Regex to replace anything inside <>, anything after :, and http/https links
    // [1] Replace content within <...>
    // [2] Replace content after : (e.g., :emoji:)
    // [3] Replace http and https links
    let cleanedText = messageContent.replace(/<[^>]+>/g, '0'); // [1]
    cleanedText = cleanedText.replace(/:\S+/g, '0');    // [2] (Matches a colon followed by one or more non-whitespace characters)
    cleanedText = cleanedText.replace(/https?:\/\/\S+/g, '0'); // [3]

    if (messageContent != "" && cleanedText == "") {
        // user actually typing something but our script went wrong so return 1 character.
        cleanedText = "0";
    }

    return cleanedText.trim();
};

module.exports = {
    calculateNextLevelExp,
    processUserExp,
    checkAndProcessMonsterDefeat,
    handleExpGain,
    hourlyMonsterCheck,
    getTodaysDateString // Export if needed elsewhere, e.g., !monster command
};