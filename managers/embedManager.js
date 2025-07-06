const { EmbedBuilder } = require("discord.js");

// Basic template that sets the timestamp and optionally other common attributes
const createBaseEmbed = (options = {}) => {
  const embed = new EmbedBuilder();

  // Apply optional attributes
  if (options.color) embed.setColor(options.color);
  if (options.title) embed.setTitle(options.title);
  if (options.description) embed.setDescription(options.description);
  if (options.thumbnail) embed.setThumbnail(options.thumbnail);
  if (options.footer) embed.setFooter(options.footer); // Expects { text: '...', iconURL: '...' }
  if (options.field) embed.addFields(options.field);
  if (options.timestamp) embed.setTimestamp(options.timestamp);

  // Always set timestamp unless explicitly overridden later
  embed.setTimestamp();

  return embed;
};

// --- Command Embeds ---

const createRankEmbed = (
  author,
  userAvatar,
  userLevel,
  userExp,
  nextLevelExp,
  progressBar,
  percentage
) => {
  return createBaseEmbed({
    color: 0xffd700, // Gold color
    title: `🌟 Level 🌟`,
    footer: { text: `Keep collecting EXP, keep fighting! 💪` },
    description: `${author.toString()} Let's see how far you've progressed!`,
    thumbnail: userAvatar,
  }).addFields(
    { name: "Current Level", value: `**${userLevel}**`, inline: true },
    {
      name: "Experience (EXP)",
      value: `${userExp} / ${nextLevelExp}`,
      inline: true,
    },
    {
      name: "Progress to Next Level",
      value: `${progressBar} (${percentage.toFixed(1)}%)`,
      inline: false,
    }
  );
};

const createBagEmbed = (author, itemList) => {
  return createBaseEmbed({
    color: 0x8a2be2, // Purple
    title: `🎒 My Bag 🎒`,
    footer: { text: `Collect items for rewards! 😉` },
    description: `${author.toString()} Let's see what's inside!\n\n${itemList}`,
  });
};

const createMonsterStatusEmbed = (
  today,
  monsterData,
  status,
  remainingHpText,
  color
) => {
  const embed = createBaseEmbed({
    color: color,
    title: `👽 Today's Monster Status (${today}) 🦑`,
  }).addFields(
    { name: "Name", value: monsterData.name, inline: true },
    { name: "Status", value: `**${status}**`, inline: true },
    {
      name: "HP",
      value: `${remainingHpText}`,
      inline: true,
    }
  );

  if (!monsterData.is_alive && monsterData.killed_by_user_id) {
    embed.addFields({
      name: "Finished By",
      value: `<@${monsterData.killed_by_user_id}>`,
      inline: true,
    });
  }
  if (!monsterData.is_alive && monsterData.killed_at_timestamp) {
    embed.addFields({
      name: "Defeated At",
      value: `<t:${Math.floor(
        new Date(monsterData.killed_at_timestamp).getTime() / 1000
      )}:R>`,
      inline: true,
    });
  }
  return embed;
};

const createCardEmbed = (author, randomCard) => {
  return createBaseEmbed({
    color: 0x8a2be2, // Purple color
    title: `✨ Card Found ✨`,
    footer: { text: `Congratz!` },
    description: `${author.toString()} found a card! \n**[${randomCard.code}] ${
      randomCard.title
    }**`,
  });
  // Optional: .setImage(randomCard.image_url || null)
};

// --- Announcement Embeds ---
const createLevelUpEmbed = (author, newLevel, currentExp, nextLevelExp) => {
  return createBaseEmbed({ color: 0x00ff00, title: "🎉 Level Up! 🎉" })
    .setDescription(`${author.toString()} Leveled up! Great job! 👍`)
    .addFields(
      { name: "New Level", value: newLevel.toString(), inline: true },
      { name: "Current EXP", value: currentExp.toString(), inline: true },
      { name: "Next Level EXP", value: nextLevelExp.toString(), inline: true }
    )
    .setThumbnail(author.displayAvatarURL());
};

const createMonsterSpawnEmbed = (monsterData) => {
  return createBaseEmbed({
    color: 0xff4500,
    title: `💥 Monster Attack! ${monsterData.name} has appeared! 💥`,
    description: `The **${monsterData.name}** has appeared! Attack it by chatting to gain EXP in any channel!\nEveryone's EXP is damage to the boss! 🔥`,
  }).addFields(
    {
      name: "Total Health (HP)",
      value: `**${monsterData.max_hp}**`,
      inline: true,
    },
    { name: "Appearance Date", value: monsterData.spawn_date, inline: true }
  );
};

const createMonsterDefeatEmbed = (monsterData) => {
  const killerUser = monsterData.killed_by_user_id
    ? `<@${monsterData.killed_by_user_id}>`
    : "The Adventurers";
  const embed = createBaseEmbed({
    color: 0x32cd32,
    title: `🎉 Victory! ${monsterData.name} Defeated! 🎉`,
    description: `**${monsterData.name}** has been defeated! Congratulations to **${killerUser}** for the final blow! 🏆`,
    timestamp: monsterData.killed_at_timestamp
      ? new Date(monsterData.killed_at_timestamp)
      : new Date(),
  }).addFields(
    { name: "Defeated Date", value: monsterData.spawn_date, inline: true },
    {
      name: "Total HP",
      value: monsterData.max_hp.toString(),
      inline: true,
    }
  );

  if (monsterData.killed_by_user_id) {
    embed.addFields({
      name: "Finished By",
      value: `<@${monsterData.killed_by_user_id}>`,
      inline: true,
    });
  }
  if (monsterData.killed_at_timestamp) {
    embed.addFields({
      name: "Time Defeated",
      value: `<t:${Math.floor(
        new Date(monsterData.killed_at_timestamp).getTime() / 1000
      )}:R>`,
      inline: true,
    });
  }
  return embed;
};

// --- Game Logic Embeds ---

const createItemDropEmbed = (message, selectedItem, itemAmount) => {
  const itemDropEmbed = createBaseEmbed({
    color: 0xffd700,
    title: "✨ Found Item! ✨",
    description: `${message.author.toString()} got the item!`,
  }).addFields(
    { name: "Rarity", value: `${selectedItem.rarityEmoji}`, inline: true },
    {
      name: "Item",
      value: `${selectedItem.name} ${selectedItem.emoji}`,
      inline: true,
    },
    { name: "Amount", value: itemAmount.toString(), inline: true },
    { name: "From", value: `<#${message.channelId}>`, inline: true }
  );

  return itemDropEmbed;
};

const createItemTransferEmbed = (
  receiver,
  selectedItem,
  itemAmount,
  sender
) => {
  const itemDropEmbed = createBaseEmbed({
    color: 0xffd700,
    title: "✨ Item Transfered ✨",
    description: `${receiver} got the item!`,
  }).addFields(
    { name: "Rarity", value: `${selectedItem.rarity.emoji}`, inline: true },
    {
      name: "Item",
      value: `${selectedItem.name} ${selectedItem.emoji}`,
      inline: true,
    },
    { name: "Amount", value: itemAmount.toString(), inline: true },
    { name: "From", value: `${sender}`, inline: true }
  );

  return itemDropEmbed;
};

const createDamageEmbed = (author, monsterName, damageDealt) => {
  return createBaseEmbed({
    color: 0xdc143c, // Crimson red for damage
    title: "💥 Monster Hit! 💥",
    description: `${author.toString()} landed a blow on **${monsterName}**!`,
  }).addFields(
    { name: "Attacker", value: author.username, inline: true },
    { name: "Target", value: monsterName, inline: true },
    { name: "Damage Dealt", value: `**${damageDealt}**`, inline: true }
  );
};

const createLeaderboardValueEmbed = (
  leaderboardEntries,
  currentPage,
  pageSize
) => {
  const formattedLeaderboard = leaderboardEntries
    .map((entry, index) => {
      // Format the value with commas for readability
      return `\`${(currentPage - 1) * pageSize + 1 + index}.\` <@${
        entry.id
      }> - **${entry.value.toLocaleString()}** value`;
    })
    .join("\n");

  return createBaseEmbed({
    color: 0xffd700, // Crimson red for damage
    title: "🏆 Material Value Leaderboard 🏆",
    description: `✨ Here are the top adventurers by total material value! ✨\n\n${formattedLeaderboard}`,
  }).setFooter({ text: "Value based on material rarity." });
};

const createLeaderboardMonsterKillEmbed = (
  leaderboardEntries,
  currentPage,
  pageSize
) => {
  const formattedLeaderboard = leaderboardEntries
    .map((entry, index) => {
      return `\`${(currentPage - 1) * pageSize + 1 + index}.\` <@${
        entry.id
      }> - **${entry.value.toLocaleString()}** kills`;
    })
    .join("\n");

  return createBaseEmbed({
    color: 0x32cd32, // Lime green for monster kills
    title: "⚔️ Monster Kill Leaderboard ⚔️",
    description: `💀 Here are the top monster slayers! 💀\n\n${formattedLeaderboard}`,
  }).setFooter({ text: "Total monsters slain by each user." });
};


module.exports = {
  createRankEmbed,
  createBagEmbed,
  createMonsterStatusEmbed,
  createCardEmbed,
  createLevelUpEmbed,
  createMonsterSpawnEmbed,
  createMonsterDefeatEmbed,
  createItemDropEmbed,
  createDamageEmbed,
  createItemTransferEmbed,
  createBaseEmbed,
  createLeaderboardValueEmbed,
  createLeaderboardMonsterKillEmbed
};
