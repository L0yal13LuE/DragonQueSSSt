import supabase from './supabaseClient';
import * as constants from './constants';
import {
  getUser,
  insertUser,
  updateUser,
  updateUsername,
  getMonsterForDate,
  createMonster,
  logMonsterHit,
  getTotalDamageDealt,
  markMonsterAsDefeated,
  deleteMonsterHits,
} from './dbUtils';
import {
  handleLevelUpAnnouncement,
  announceMonsterSpawn,
  announceMonsterDefeat,
  announceDamageDealt,
} from './announcements';
import { handleItemDrop } from './managers/itemManager';
import { getMonsters } from './providers/monsterProvider';
import { fetchOrGetChannel } from './managers/channelManager';

export const getTodaysDateString = (): string => {
  return new Date().toISOString().slice(0, 10);
};

export const calculateNextLevelExp = (currentLevel: number): number => {
  if (currentLevel === 0) return 50;
  const nextLevel = currentLevel + 1;
  return currentLevel * constants.LEVELING_FACTOR * nextLevel;
};

export const processUserExp = (
  userId: string,
  username: string,
  currentExp: number,
  userLevel: number,
  expGained: number
): { newLevel: number; newExp: number; levelUpOccurred: boolean } => {
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

export const spawnNewMonster = async (dateString: string): Promise<any> => {
  const allMonsters = await getMonsters();

  if (!allMonsters || allMonsters.length === 0) {
    console.error(
      "[GameLogic] spawnNewMonster: No monsters found in the database to choose from. Cannot spawn a new monster."
    );
    return null;
  }

  const chosenMonster = allMonsters[Math.floor(Math.random() * allMonsters.length)];
  const monsterHp = (chosenMonster as any).base_hp as number;

  return await createMonster(
    dateString,
    chosenMonster.name,
    Math.round(monsterHp)
  );
};

export const checkAndProcessMonsterDefeat = async (
  monsterDate: string,
  lastHitUserId: string,
  currentMonsterStateRef: { current: any }
): Promise<boolean> => {
  if (
    !currentMonsterStateRef.current ||
    !currentMonsterStateRef.current.is_alive
  ) {
    return false;
  }
  const maxHp = currentMonsterStateRef.current.max_hp;
  const totalDamage = await getTotalDamageDealt(monsterDate);
  console.log(
    `[${lastHitUserId}] Check Damage for ${monsterDate}: Total ${totalDamage} / ${maxHp}`
  );

  if (totalDamage >= maxHp) {
    console.log(
      `Defeat condition met for ${monsterDate}. Attempting to mark as defeated.`
    );
    const updatedMonster = await markMonsterAsDefeated(
      monsterDate,
      lastHitUserId
    );

    if (updatedMonster) {
      console.log(`Monster ${monsterDate} was marked defeated by this check.`);
      currentMonsterStateRef.current = {
        ...currentMonsterStateRef.current,
        ...updatedMonster,
        is_alive: false,
        is_reward_announced: false,
      };
      return true;
    } else {
      console.log(
        `Failed to mark ${monsterDate} as defeated (might already be done).`
      );
      if (currentMonsterStateRef.current.is_alive) {
        const checkDbAgain = await getMonsterForDate(monsterDate);
        if (checkDbAgain && !checkDbAgain.is_alive) {
          console.log(
            `Syncing local state for ${monsterDate} to dead based on DB.`
          );
          currentMonsterStateRef.current = {
            ...currentMonsterStateRef.current,
            ...checkDbAgain,
          };
        }
      }
      return false;
    }
  }
  return false;
};

export const handleExpGain = async (
  message: any,
  userCooldowns: Map<string, number>,
  currentMonsterStateRef: { current: any }
): Promise<void> => {
  const userId = message.author.id;
  const username = message.author.username;
  const currentMessageTimestamp = message.createdTimestamp;

  message.content = cleanDiscordMessage(message.content);

  console.log(`[${username}]--->${message.content}<---`);

  const allowedChannelData = await fetchOrGetChannel({ isGainExp: true });
  const isChannelAllowed =
    allowedChannelData &&
    allowedChannelData.some((channel: any) => channel.id === message.channel.id);

  if (message.author.bot || !supabase || !isChannelAllowed) return;

  try {
    let userData = await getUser(userId);
    let userLevel = 0,
      userExp = 0;

    if (userData) {
      userLevel = userData.level;
      userExp = userData.current_exp;
      if (userData.username !== username)
        await updateUsername(userId, username);
    } else {
      userLevel = 1;
      userExp = 0;
      const inserted = await insertUser(
        userId,
        username,
        userLevel,
        userExp,
        new Date(currentMessageTimestamp).toISOString()
      );
      if (!inserted) return;
      userData = { level: userLevel, current_exp: userExp };
    }

    const lastExpTimestamp = userCooldowns.get(userId) || 0;
    const timeSinceLastExp = currentMessageTimestamp - lastExpTimestamp;

    if (timeSinceLastExp >= constants.COOLDOWN_MILLISECONDS) {
      const expGainedFromMessage =
        message.content.length * constants.EXP_PER_CHARACTER;

      if (expGainedFromMessage <= 0) {
        if (userData && userData.username !== username)
          await updateUsername(userId, username);
        return;
      }

      console.log(
        `[${username}] Cooldown passed. Processing ${expGainedFromMessage} EXP.`
      );

      let monsterKilledThisCheck = false;
      const damageDealt = Math.min(expGainedFromMessage, 50);

      if (
        currentMonsterStateRef.current &&
        currentMonsterStateRef.current.is_alive &&
        damageDealt > 0
      ) {
        console.log(
          `[${username}] Logging ${damageDealt} damage for monster ${currentMonsterStateRef.current.name}.`
        );
        const logged = await logMonsterHit(
          currentMonsterStateRef.current.spawn_date,
          userId,
          username,
          damageDealt
        );
        if (logged) {
          if (
            currentMonsterStateRef.current &&
            currentMonsterStateRef.current.name
          ) {
            try {
              announceDamageDealt(message, currentMonsterStateRef, damageDealt);
            } catch (error) {
              console.error(
                `[${username}] Error sending damage log embed:`,
                error
              );
            }
          }
          monsterKilledThisCheck = await checkAndProcessMonsterDefeat(
            currentMonsterStateRef.current.spawn_date,
            userId,
            currentMonsterStateRef
          );
        } else {
          console.error(
            `[${username}] Failed to log hit for monster ${currentMonsterStateRef.current.spawn_date}.`
          );
        }
      }

      const { newLevel, newExp, levelUpOccurred } = processUserExp(
        userId,
        username,
        userExp,
        userLevel,
        expGainedFromMessage
      );
      userCooldowns.set(userId, currentMessageTimestamp);

      const updated = await updateUser(userId, {
        username: username,
        level: newLevel,
        current_exp: newExp,
        last_online_timestamp: new Date(currentMessageTimestamp).toISOString(),
      });

      if (
        monsterKilledThisCheck &&
        currentMonsterStateRef.current &&
        !currentMonsterStateRef.current.is_reward_announced
      ) {
        console.log(
          `Announcing defeat for ${currentMonsterStateRef.current.name} triggered by ${username}'s hit.`
        );
        await announceMonsterDefeat(currentMonsterStateRef.current);
        if (currentMonsterStateRef.current)
          currentMonsterStateRef.current.is_reward_announced = true;
      }

      if (updated && levelUpOccurred) {
        handleLevelUpAnnouncement(message, newLevel, newExp);
      } else if (levelUpOccurred && !updated) {
        console.error(`[${username}] Leveled up but failed DB update.`);
      }

      await handleItemDrop(message);
    } else {
      if (userData && userData.username !== username)
        await updateUsername(userId, username);
    }
  } catch (error) {
    console.error(
      `[${username}] Unexpected error during EXP processing:`,
      error
    );
  }
};

export const hourlyMonsterCheck = async (
  client: any,
  currentMonsterStateRef: { current: any }
): Promise<void> => {
  if (!supabase) {
    console.log(
      `Hourly Check: Supabase (${!!supabase}) unavailable. Skipping.`
    );
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
      console.warn(
        `Hourly Check: Found monster from yesterday (${yesterday}) still alive: ${yesterdaysMonster.name}. Marking defeated.`
      );
      const updatedYesterdaysMonster = await markMonsterAsDefeated(
        yesterday,
        client.user.id
      );
      if (updatedYesterdaysMonster) {
        if (!updatedYesterdaysMonster.is_reward_announced) {
          await announceMonsterDefeat(updatedYesterdaysMonster);
        } else {
          await deleteMonsterHits(yesterday);
        }
      } else {
        console.error(`Failed to mark overdue monster ${yesterday} defeated.`);
      }
    } else if (
      yesterdaysMonster &&
      !yesterdaysMonster.is_alive &&
      yesterdaysMonster.is_reward_announced
    ) {
      await deleteMonsterHits(yesterday);
    }

    let monsterForToday = await getMonsterForDate(today);

    if (!monsterForToday) {
      console.log("Hourly Check: No monster for today. Spawning...");
      const newMonster = await spawnNewMonster(today);
      if (newMonster) {
        currentMonsterStateRef.current = newMonster;
      } else {
        console.error("Hourly Check: Failed to spawn new monster.");
        currentMonsterStateRef.current = null;
      }
      return;
    }

    currentMonsterStateRef.current = monsterForToday;
    console.log(
      `Hourly Check: Found today's monster: ${currentMonsterStateRef.current.name} (DB Alive: ${currentMonsterStateRef.current.is_alive}, Announced: ${currentMonsterStateRef.current.is_reward_announced})`
    );

    if (currentMonsterStateRef.current.is_alive) {
      const totalDamage = await getTotalDamageDealt(today);
      console.log(
        `Hourly Check (Today's Alive Monster): Total Damage ${totalDamage} / ${currentMonsterStateRef.current.max_hp}`
      );
      if (totalDamage >= currentMonsterStateRef.current.max_hp) {
        console.log(
          `Hourly Check: Monster ${today} should be dead based on damage. Marking defeated.`
        );
        const defeatedNow = await checkAndProcessMonsterDefeat(
          today,
          client.user.id,
          currentMonsterStateRef
        );
        if (
          defeatedNow &&
          currentMonsterStateRef.current &&
          !currentMonsterStateRef.current.is_reward_announced
        ) {
          console.log("Hourly Check: Announcing defeat after correction.");
          await announceMonsterDefeat(currentMonsterStateRef.current);
          if (currentMonsterStateRef.current)
            currentMonsterStateRef.current.is_reward_announced = true;
        } else if (!defeatedNow) {
          console.warn(
            `Hourly Check: Failed to mark ${today} defeated via check function (might be done). Re-fetching.`
          );
          currentMonsterStateRef.current = await getMonsterForDate(today);
        }
      } else {
        console.log(
          `Hourly Check: Monster ${currentMonsterStateRef.current.name} correctly marked alive.`
        );
      }
    } else {
      if (!currentMonsterStateRef.current.is_reward_announced) {
        console.log("Hourly Check: Monster dead but unannounced. Announcing.");
        await announceMonsterDefeat(currentMonsterStateRef.current);
        if (currentMonsterStateRef.current)
          currentMonsterStateRef.current.is_reward_announced = true;
      } else {
        console.log(
          "Hourly Check: Monster dead and announced. Cleaning up hits."
        );
        await deleteMonsterHits(today);
      }
    }
  } catch (error) {
    console.error("Error during hourly monster check:", error);
  }
};

export const cleanDiscordMessage = (messageContent: string): string => {
  let cleanedText = messageContent.replace(/<[^>]+>/g, "0");
  cleanedText = cleanedText.replace(/:\S+/g, "0");
  cleanedText = cleanedText.replace(/https?:\/\/\S+/g, "0");

  if (messageContent != "" && cleanedText == "") {
    cleanedText = "0";
  }

  return cleanedText.trim();
};
