const { EmbedBuilder } = require('discord.js');
const {
    EXP_PER_CHARACTER, LEVELING_FACTOR, COOLDOWN_MILLISECONDS,
    MATERIAL_LIST, RARE_MATERIAL_LIST, POSSIBLE_MONSTERS
} = require('./constants');
const {
    getUser, insertUser, updateUser, updateUsername, insertUserItem,
    getMonsterForDate, createMonster, logMonsterHit, getTotalDamageDealt,
    markMonsterAsDefeated, deleteMonsterHits
} = require('./dbUtils');
const { handleLevelUpAnnouncement, announceMonsterSpawn, announceMonsterDefeat } = require('./announcements');

const { disAllowChannelArray } = require('./disAllowChannelArray.js'); // don't get exp on these channel

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
        newExp = 0; // Reset EXP on level up
        nextLevelExp = calculateNextLevelExp(newLevel);
    }
    return { newLevel, newExp, levelUpOccurred };
};

/**
 * Selects monster details and calls createMonster to spawn it for the given date.
 */
const spawnNewMonster = async (supabase, dateString) => {
    const chosenMonster = POSSIBLE_MONSTERS[Math.floor(Math.random() * POSSIBLE_MONSTERS.length)];
    const monsterHp = chosenMonster.baseHp * (LEVELING_FACTOR / 5);

    return await createMonster(supabase, dateString, chosenMonster.name, Math.round(monsterHp));
};

/**
 * Handles item drop logic based on channel configuration.
 */
const handleItemDrop = async (supabase, userId, channelId, message, announcementChannel) => {
    // manual fixed drop rate on every channel
    const dropConfig = { dropRate: 0.33, dropItems: MATERIAL_LIST };
    if (!dropConfig) return;

    const randomChance = Math.random();
    if (randomChance < dropConfig.dropRate) {
        const possibleItems = dropConfig.dropItems;
        if (!possibleItems || possibleItems.length === 0) return;

        const randomItem = possibleItems[Math.floor(Math.random() * possibleItems.length)];
        const itemAmount = 1;

        const itemInserted = await insertUserItem(supabase, userId, channelId, randomItem, itemAmount, new Date().toISOString());

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
            console.warn(`[${message.author.username}] Earned item, but announcement channel unavailable for announcement.`);
        }
    }
};

/**
 * Checks total damage against max HP and updates monster status if defeated.
 * Returns true if the monster was defeated *by this check*, false otherwise.
 */
const checkAndProcessMonsterDefeat = async (supabase, monsterDate, lastHitUserId, currentMonsterStateRef) => {
    if (!currentMonsterStateRef.current || !currentMonsterStateRef.current.is_alive) {
        return false;
    }
    const maxHp = currentMonsterStateRef.current.max_hp;
    const totalDamage = await getTotalDamageDealt(supabase, monsterDate);
    console.log(`[${lastHitUserId}] Check Damage for ${monsterDate}: Total ${totalDamage} / ${maxHp}`);

    if (totalDamage >= maxHp) {
        console.log(`Defeat condition met for ${monsterDate}. Attempting to mark as defeated.`);
        const updatedMonster = await markMonsterAsDefeated(supabase, monsterDate, lastHitUserId);

        if (updatedMonster) {
            console.log(`Monster ${monsterDate} was marked defeated by this check.`);
            // Update the shared state object directly
            currentMonsterStateRef.current = { ...currentMonsterStateRef.current, ...updatedMonster, is_alive: false, is_reward_announced: false };
            return true; // Defeated by this check
        } else {
            console.log(`Failed to mark ${monsterDate} as defeated (might already be done).`);
            // Re-sync state if it failed but DB shows it's dead
            if (currentMonsterStateRef.current.is_alive) {
                const checkDbAgain = await getMonsterForDate(supabase, monsterDate);
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
const handleExpGain = async (message, supabase, userCooldowns, announcementChannel, currentMonsterStateRef) => {
    const userId = message.author.id;
    const username = message.author.username;
    const currentMessageTimestamp = message.createdTimestamp;

    if (message.author.bot || !supabase || disAllowChannelArray(message.channel.id)) return;

    try {
        let userData = await getUser(supabase, userId);
        let userLevel = 0, userExp = 0;

        if (userData) {
            userLevel = userData.level; userExp = userData.current_exp;
            if (userData.username !== username) await updateUsername(supabase, userId, username);
        } else {
            userLevel = 1; userExp = 0;
            const inserted = await insertUser(supabase, userId, username, userLevel, userExp, new Date(currentMessageTimestamp).toISOString());
            if (!inserted) return;
            userData = { level: userLevel, current_exp: userExp }; // Simulate userData for cooldown check
        }

        const lastExpTimestamp = userCooldowns.get(userId) || 0;
        const timeSinceLastExp = currentMessageTimestamp - lastExpTimestamp;

        if (timeSinceLastExp >= COOLDOWN_MILLISECONDS) {
            const expGainedFromMessage = message.content.length * EXP_PER_CHARACTER;

            if (expGainedFromMessage <= 0) {
                // Still update username if needed, even with 0 EXP gain
                if (userData && userData.username !== username) await updateUsername(supabase, userId, username);
                return;
            }

            console.log(`[${username}] Cooldown passed. Processing ${expGainedFromMessage} EXP.`);

            let monsterKilledThisCheck = false;
            const damageDealt = Math.min(expGainedFromMessage, 100); // Cap damage per message

            // Use the reference object for current monster state
            if (currentMonsterStateRef.current && currentMonsterStateRef.current.is_alive && damageDealt > 0) {
                console.log(`[${username}] Logging ${damageDealt} damage for monster ${currentMonsterStateRef.current.name}.`);
                const logged = await logMonsterHit(supabase, currentMonsterStateRef.current.spawn_date, userId, username, damageDealt);
                if (logged) {
                    // Pass the reference object to the check function
                    monsterKilledThisCheck = await checkAndProcessMonsterDefeat(supabase, currentMonsterStateRef.current.spawn_date, userId, currentMonsterStateRef);
                } else {
                    console.error(`[${username}] Failed to log hit for monster ${currentMonsterStateRef.current.spawn_date}.`);
                }
            }

            const { newLevel, newExp, levelUpOccurred } = processUserExp(userId, username, userExp, userLevel, expGainedFromMessage);
            userCooldowns.set(userId, currentMessageTimestamp);

            const updated = await updateUser(supabase, userId, {
                username: username, level: newLevel, current_exp: newExp,
                last_online_timestamp: new Date(currentMessageTimestamp).toISOString()
            });

            // Check the reference object's state after potential update by checkAndProcessMonsterDefeat
            if (monsterKilledThisCheck && currentMonsterStateRef.current && !currentMonsterStateRef.current.is_reward_announced) {
                console.log(`Announcing defeat for ${currentMonsterStateRef.current.name} triggered by ${username}'s hit.`);
                await announceMonsterDefeat(supabase, announcementChannel, currentMonsterStateRef.current);
                // Mark announced in the shared state immediately after announcement attempt
                if (currentMonsterStateRef.current) currentMonsterStateRef.current.is_reward_announced = true;
            }

            if (updated && levelUpOccurred) {
                handleLevelUpAnnouncement(message, newLevel, newExp, announcementChannel);
            } else if (levelUpOccurred && !updated) {
                console.error(`[${username}] Leveled up but failed DB update.`);
            }

            await handleItemDrop(supabase, userId, message.channel.id, message, announcementChannel);

        } else {
            // Update username even if on cooldown
            if (userData && userData.username !== username) await updateUsername(supabase, userId, username);
        }

    } catch (error) {
        console.error(`[${username}] Unexpected error during EXP processing:`, error);
    }
};

/**
 * Checks the daily monster status every hour. Handles spawning, status verification, and cleanup.
 * Uses a reference object for currentMonsterState to allow modification.
 */
const hourlyMonsterCheck = async (supabase, client, announcementChannel, currentMonsterStateRef) => {
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
        const yesterdaysMonster = await getMonsterForDate(supabase, yesterday);
        if (yesterdaysMonster && yesterdaysMonster.is_alive) {
            console.warn(`Hourly Check: Found monster from yesterday (${yesterday}) still alive: ${yesterdaysMonster.name}. Marking defeated.`);
            const updatedYesterdaysMonster = await markMonsterAsDefeated(supabase, yesterday, client.user.id); // Use bot ID
            if (updatedYesterdaysMonster) {
                if (!updatedYesterdaysMonster.is_reward_announced) {
                    await announceMonsterDefeat(supabase, announcementChannel, updatedYesterdaysMonster);
                } else {
                    await deleteMonsterHits(supabase, yesterday); // Already announced, just delete hits
                }
            } else {
                console.error(`Failed to mark overdue monster ${yesterday} defeated.`);
            }
        } else if (yesterdaysMonster && !yesterdaysMonster.is_alive && yesterdaysMonster.is_reward_announced) {
             // Clean up hits if yesterday's monster is dead and announced
             await deleteMonsterHits(supabase, yesterday);
        }

        // --- Check Today's Monster ---
        let monsterForToday = await getMonsterForDate(supabase, today);

        if (!monsterForToday) {
            console.log("Hourly Check: No monster for today. Spawning...");
            const newMonster = await spawnNewMonster(supabase, today);
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
            const totalDamage = await getTotalDamageDealt(supabase, today);
            console.log(`Hourly Check (Today's Alive Monster): Total Damage ${totalDamage} / ${currentMonsterStateRef.current.max_hp}`);
            if (totalDamage >= currentMonsterStateRef.current.max_hp) {
                console.log(`Hourly Check: Monster ${today} should be dead based on damage. Marking defeated.`);
                // Pass the reference object here as well
                const defeatedNow = await checkAndProcessMonsterDefeat(supabase, today, client.user.id, currentMonsterStateRef);
                if (defeatedNow && currentMonsterStateRef.current && !currentMonsterStateRef.current.is_reward_announced) {
                    console.log("Hourly Check: Announcing defeat after correction.");
                    await announceMonsterDefeat(supabase, announcementChannel, currentMonsterStateRef.current);
                    if (currentMonsterStateRef.current) currentMonsterStateRef.current.is_reward_announced = true; // Mark announced in state
                } else if (!defeatedNow) {
                     console.warn(`Hourly Check: Failed to mark ${today} defeated via check function (might be done). Re-fetching.`);
                     currentMonsterStateRef.current = await getMonsterForDate(supabase, today); // Re-sync state
                }
            } else {
                console.log(`Hourly Check: Monster ${currentMonsterStateRef.current.name} correctly marked alive.`);
            }
        } else { // Dead in DB
            if (!currentMonsterStateRef.current.is_reward_announced) {
                console.log("Hourly Check: Monster dead but unannounced. Announcing.");
                await announceMonsterDefeat(supabase, announcementChannel, currentMonsterStateRef.current);
                if (currentMonsterStateRef.current) currentMonsterStateRef.current.is_reward_announced = true; // Mark announced in state
            } else {
                console.log("Hourly Check: Monster dead and announced. Cleaning up hits.");
                await deleteMonsterHits(supabase, today);
            }
        }

    } catch (error) {
        console.error("Error during hourly monster check:", error);
    }
};

module.exports = {
    calculateNextLevelExp,
    processUserExp,
    handleItemDrop,
    checkAndProcessMonsterDefeat,
    handleExpGain,
    hourlyMonsterCheck,
    getTodaysDateString // Export if needed elsewhere, e.g., !monster command
};