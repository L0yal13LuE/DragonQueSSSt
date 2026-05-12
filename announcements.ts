import dotenv from "dotenv";

dotenv.config({
  path: ({
    blue: ".env.blue",
    development: ".env",
    staging: ".env.staging",
    production: ".env.production",
  } as Record<string, string>)[process.env.NODE_ENV || "development"],
});

import { EmbedBuilder } from "discord.js";
import supabase from "./supabaseClient";
import { markRewardAnnounced, deleteMonsterHits } from "./dbUtils";
import {
  createItemDropEmbed,
  createDamageEmbed,
  createItemTransferEmbed,
  createSpinResultEmbed
} from "./managers/embedManager";

const ANNOUNCEMENT_CHANNEL_ID = process.env.ANNOUNCEMENT_CHANNEL_ID;
const ITEM_DROP_CHANNEL_ID = process.env.ITEM_DROP_CHANNEL_ID;
const DAMAGE_LOG_CHANNEL_ID = process.env.DAMAGE_LOG_CHANNEL_ID;
const LEVEL_CHANNEL_ID = process.env.LEVEL_CHANNEL_ID;

let announcementChannel: any = null;
let itemDropChannel: any = null;
let damageLogChannel: any = null;
let levelChannel: any = null;

const _fetchChannelById = async (client: any, channelId: string | undefined, channelType: string): Promise<any> => {
  if (!channelId) {
    console.warn(
      `[ChannelFetch] No ID provided for ${channelType} channel. Skipping.`
    );
    return null;
  }
  try {
    const channel = await client.channels.fetch(channelId);
    if (channel) {
      console.log(
        `[ChannelFetch] ${channelType} channel found: ${channel.name}`
      );
      return channel;
    } else {
      console.error(
        `[ChannelFetch] Could not find ${channelType} channel with ID: ${channelId}`
      );
      return null;
    }
  } catch (error) {
    console.error(
      `[ChannelFetch] Error fetching ${channelType} channel (ID: ${channelId}):`,
      error
    );
    return null;
  }
};

export const sendOnlineAnnouncement = async (): Promise<void> => {
  if (!announcementChannel) {
    console.error(
      "Announcement channel not found. Cannot send online announcement."
    );
    return;
  }
  const onlineMessage = `☀️ **Adventure, wake up!** <@&1378563196763242557>\nYour RPG bot is **online and ready to play**! ✨\nGo collect EXP in the city and resources area to earn new levels, items, and resources! 🔥\nType \`!bag\` to see your items, \`!level\` to see your level, and \`!monster\` to see the monsters! 🎯\nUse \`!craft\` to craft items, \`!shop\` to buy items, and \`/send\` to trade with friends!\nIt's time to **start your adventure!**, Click profile to learn more! 🚀`;
  try {
    await announcementChannel.send(onlineMessage);
    console.log("Bot online announcement sent.");
  } catch (error) {
    console.error("Error sending online announcement:", error);
  }
};

export const handleLevelUpAnnouncement = (message: any, newLevel: number, currentExp: number): void => {
  if (!levelChannel) {
    console.warn(
      `[${message.author.username}] Leveled up, but announcement channel unavailable.`
    );
    return;
  }
  const { calculateNextLevelExp } = require("./gameLogic");

  const levelUpEmbed = new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle("🎉 Level Up! 🎉")
    .setDescription(
      `${message.author.toString()} just leveled up! Great job 👍`
    )
    .addFields(
      { name: "New Level", value: newLevel.toString(), inline: true },
      { name: "Current EXP", value: currentExp.toString(), inline: true },
      {
        name: "EXP for Next Level",
        value: calculateNextLevelExp(newLevel).toString(),
        inline: true,
      }
    )
    .setThumbnail(message.author.displayAvatarURL())
    .setTimestamp();

  try {
    levelChannel.send({ embeds: [levelUpEmbed] });
    console.log(`[${message.author.username}] Sent level up announcement.`);
  } catch (error) {
    console.error(
      `Error sending level up announcement for ${message.author.username}:`,
      error
    );
  }
};

export const announceMonsterSpawn = (monsterData: any): void => {
  if (!announcementChannel || !monsterData) {
    console.warn(
      "Cannot announce monster spawn: Channel or monster data missing."
    );
    return;
  }

  const spawnEmbed = new EmbedBuilder()
    .setColor(0xff4500)
    .setTitle(`💥 Monster Invasion! ${monsterData.name} Has Appeared! 💥`)
    .setDescription(
      `**${monsterData.name}** has appeared! Attack it by chatting in any channel to earn EXP!\nEveryone's EXP counts as damage to the boss! 🔥`
    )
    .addFields(
      { name: "Total HP", value: `**${monsterData.max_hp}**`, inline: true },
      { name: "Spawn Date", value: monsterData.spawn_date, inline: true }
    )
    .setTimestamp();

  try {
    announcementChannel.send({
      content: "<@&1378563196763242557> The daily challenge mission has begun!",
      embeds: [spawnEmbed],
    });
    console.log(`Announced spawn of ${monsterData.name}`);
  } catch (error) {
    console.error(
      `Error sending monster spawn announcement for ${monsterData.name}:`,
      error
    );
  }
};

export const announceMonsterDefeat = async (monsterData: any): Promise<void> => {
  if (!announcementChannel || !monsterData) {
    console.warn(
      "Cannot announce monster defeat: Channel or monster data missing."
    );
    return;
  }
  if (!supabase) {
    console.warn("Cannot announce monster defeat: Supabase client missing.");
    return;
  }

  const killerUser = monsterData.killed_by_user_id
    ? `<@${monsterData.killed_by_user_id}>`
    : "the adventurers";
  const defeatEmbed = new EmbedBuilder()
    .setColor(0x32cd32)
    .setTitle(`🎉 Victory! ${monsterData.name} Has Been Defeated! 🎉`)
    .setDescription(
      `**${monsterData.name}** has been defeated! Congrats to **${killerUser}** for landing the final blow! 🏆`
    )
    .addFields(
      { name: "Defeated On", value: monsterData.spawn_date, inline: true },
      { name: "Total HP", value: monsterData.max_hp.toString(), inline: true }
    )
    .setTimestamp(
      monsterData.killed_at_timestamp
        ? new Date(monsterData.killed_at_timestamp)
        : new Date()
    );

  if (monsterData.killed_by_user_id) {
    defeatEmbed.addFields({
      name: "Final Blow By",
      value: `<@${monsterData.killed_by_user_id}>`,
      inline: true,
    });
  }

  if (monsterData.killed_at_timestamp) {
    defeatEmbed.addFields({
      name: "Time Defeated",
      value: `<t:${Math.floor(
        new Date(monsterData.killed_at_timestamp).getTime() / 1000
      )}:R>`,
      inline: true,
    });
  }

  try {
    await announcementChannel.send({
      content: "<@&1378563196763242557> Daily monster defeated successfully!",
      embeds: [defeatEmbed],
    });
    console.log(`Announced defeat of ${monsterData.name}`);
    await markRewardAnnounced(monsterData.spawn_date);
    await deleteMonsterHits(monsterData.spawn_date);
  } catch (error) {
    console.error(
      `Error sending monster defeat announcement, marking reward, or deleting hits for ${monsterData.spawn_date}:`,
      error
    );
  }
};

export const announceItemDrop = (message: any, selectedItem: any, itemAmount: number): void => {
  try {
    const itemDropEmbed = createItemDropEmbed(
      message,
      selectedItem,
      itemAmount
    );
    itemDropChannel.send({ embeds: [itemDropEmbed] });
    console.log(`[${message.author.username}] Sending item drop announcement.`);
  } catch (error) {
    console.error(
      `Error sending item drop announcement for ${message.author.username}:`,
      error
    );
  }
};

export const announceItemTransfer = (receiver: any, selectedItem: any, itemAmount: number, sender: any): void => {
  try {
    const itemDropEmbed = createItemTransferEmbed(
      receiver,
      selectedItem,
      itemAmount,
      sender
    );
    itemDropChannel.send({ embeds: [itemDropEmbed] });
    console.log(`[${receiver.username}] Sending item drop announcement.`);
  } catch (error) {
    console.error(
      `Error sending item drop announcement for ${receiver.username}:`,
      error
    );
  }
};

export const announceDamageDealt = (message: any, currentMonsterStateRef: { current: any }, damageDealt: number): void => {
  try {
    const damageEmbed = createDamageEmbed(
      message.author,
      currentMonsterStateRef.current.name,
      damageDealt
    );
    damageLogChannel.send({ embeds: [damageEmbed] });
    console.log(
      `[${message.author.username}] Sent damage log for hitting ${currentMonsterStateRef.current.name} with ${damageDealt} damage.`
    );
  } catch (error) {
    console.error(
      `Error sending damage dealt announcement for ${message.author.username} (monster: '${currentMonsterStateRef.current.name}'):`,
      error
    );
  }
};

export const announceItemSpinResult = (interaction: any, selectedItem: any, itemAmount: number): void => {
  try {
    const itemDropEmbed = createSpinResultEmbed(
      interaction.user,
      selectedItem,
      itemAmount
    );
    itemDropChannel.send({ embeds: [itemDropEmbed] });
    console.log(`[${interaction.username}] Sending item drop announcement.`);
  } catch (error) {
    console.error(
      `Error sending item drop announcement for ${interaction.username}:`,
      error
    );
  }
};

export const initializeBotChannels = async (client: any): Promise<void> => {
  announcementChannel = await _fetchChannelById(
    client,
    ANNOUNCEMENT_CHANNEL_ID,
    "Announcement"
  );
  itemDropChannel = await _fetchChannelById(
    client,
    ITEM_DROP_CHANNEL_ID,
    "Item Drop"
  );
  damageLogChannel = await _fetchChannelById(
    client,
    DAMAGE_LOG_CHANNEL_ID,
    "Damage Log"
  );
  levelChannel = await _fetchChannelById(client, LEVEL_CHANNEL_ID, "Level");
};
