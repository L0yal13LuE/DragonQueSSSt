import { EmbedBuilder, type ColorResolvable } from 'discord.js';

interface BaseEmbedOptions {
  color?: ColorResolvable;
  title?: string;
  description?: string;
  thumbnail?: string;
  footer?: { text: string; iconURL?: string };
  field?: { name: string; value: string; inline?: boolean }[];
  timestamp?: Date | number;
}

interface MonsterData {
  name: string;
  is_alive: boolean;
  killed_by_user_id?: string | null;
  killed_at_timestamp?: string | null;
  max_hp: number;
  spawn_date: string;
}

interface SelectedItem {
  rarityEmoji?: string;
  name: string;
  emoji?: string;
  rarity?: { emoji: string };
}

interface LeaderboardEntry {
  id: string;
  value: number;
}

interface PlayerInfo {
  username: string;
}

interface UserLike {
  toString(): string;
  username: string;
  displayAvatarURL(): string;
}

const createBaseEmbed = (options: BaseEmbedOptions = {}): EmbedBuilder => {
  const embed = new EmbedBuilder();

  if (options.color) embed.setColor(options.color);
  if (options.title) embed.setTitle(options.title);
  if (options.description) embed.setDescription(options.description);
  if (options.thumbnail) embed.setThumbnail(options.thumbnail);
  if (options.footer) embed.setFooter(options.footer);
  if (options.field) embed.addFields(options.field);
  if (options.timestamp) embed.setTimestamp(options.timestamp);

  embed.setTimestamp();

  return embed;
};

const createRankEmbed = (
  author: UserLike,
  userAvatar: string,
  userLevel: number,
  userExp: number,
  nextLevelExp: number,
  progressBar: string,
  percentage: number
): EmbedBuilder => {
  return createBaseEmbed({
    color: 0xffd700,
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

const createBagEmbed = (author: UserLike, itemList: string): EmbedBuilder => {
  return createBaseEmbed({
    color: 0x8a2be2,
    title: `🎒 My Bag 🎒`,
    footer: { text: `Collect items for rewards! 😉` },
    description: `${author.toString()} Let's see what's inside!\n\n${itemList}`,
  });
};

const createMonsterStatusEmbed = (
  today: string,
  monsterData: MonsterData,
  status: string,
  remainingHpText: string,
  color: ColorResolvable
): EmbedBuilder => {
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

const createCardEmbed = (author: UserLike, randomCard: { code: string; title: string }): EmbedBuilder => {
  return createBaseEmbed({
    color: 0x8a2be2,
    title: `✨ Card Found ✨`,
    footer: { text: `Congratz!` },
    description: `${author.toString()} found a card! \n**[${randomCard.code}] ${randomCard.title}**`,
  });
};

const createLevelUpEmbed = (author: UserLike, newLevel: number, currentExp: number, nextLevelExp: number): EmbedBuilder => {
  return createBaseEmbed({ color: 0x00ff00, title: "🎉 Level Up! 🎉" })
    .setDescription(`${author.toString()} Leveled up! Great job! 👍`)
    .addFields(
      { name: "New Level", value: newLevel.toString(), inline: true },
      { name: "Current EXP", value: currentExp.toString(), inline: true },
      { name: "Next Level EXP", value: nextLevelExp.toString(), inline: true }
    )
    .setThumbnail(author.displayAvatarURL());
};

const createMonsterSpawnEmbed = (monsterData: MonsterData): EmbedBuilder => {
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

const createMonsterDefeatEmbed = (monsterData: MonsterData): EmbedBuilder => {
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

const createItemDropEmbed = (
  message: { author: { toString(): string }; channelId: string },
  selectedItem: SelectedItem,
  itemAmount: number
): EmbedBuilder => {
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
  receiver: string,
  selectedItem: SelectedItem,
  itemAmount: number,
  sender: string
): EmbedBuilder => {
  const itemDropEmbed = createBaseEmbed({
    color: 0x9b59b6,
    title: "✨ Item Transfered ✨",
    description: `${receiver} got the item!`,
  }).addFields(
    { name: "Rarity", value: `${selectedItem.rarity?.emoji}`, inline: true },
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

const createSpinResultEmbed = (
  user: { toString(): string },
  selectedItem: SelectedItem,
  itemAmount: number
): EmbedBuilder => {
  const itemDropEmbed = createBaseEmbed({
    color: 0xffa500,
    title: "🎰 Spin Result!",
    description: `${user.toString()} just spun and won an item!`,
  }).addFields(
    { name: "Rarity", value: `${selectedItem.rarityEmoji}`, inline: true },
    {
      name: "Item",
      value: `${selectedItem.name} ${selectedItem.emoji}`,
      inline: true,
    },
    { name: "Amount", value: itemAmount.toString(), inline: true }
  );

  return itemDropEmbed;
};

const createDamageEmbed = (
  author: UserLike,
  monsterName: string,
  damageDealt: number
): EmbedBuilder => {
  return createBaseEmbed({
    color: 0xdc143c,
    title: "💥 Monster Hit! 💥",
    description: `${author.toString()} landed a blow on **${monsterName}**!`,
  }).addFields(
    { name: "Attacker", value: author.username, inline: true },
    { name: "Target", value: monsterName, inline: true },
    { name: "Damage Dealt", value: `**${damageDealt}**`, inline: true }
  );
};

const createLeaderboardPointEmbed = (
  leaderboardEntries: LeaderboardEntry[],
  currentPage: number,
  pageSize: number
): EmbedBuilder => {
  const formattedLeaderboard = leaderboardEntries
    .map((entry, index) => {
      return `\`${(currentPage - 1) * pageSize + 1 + index}.\` <@${entry.id}> - **${entry.value.toLocaleString()}** points`;
    })
    .join("\n");

  return createBaseEmbed({
    color: 0xffd700,
    title: "🏆 Material Points Leaderboard 🏆",
    description: `✨ Here are the top adventurers by total material points! ✨\n\n${formattedLeaderboard}`,
  }).setFooter({ text: "Points based on material rarity." });
};

const createLeaderboardMonsterKillEmbed = (
  leaderboardEntries: LeaderboardEntry[],
  currentPage: number,
  pageSize: number
): EmbedBuilder => {
  const formattedLeaderboard = leaderboardEntries
    .map((entry, index) => {
      return `\`${(currentPage - 1) * pageSize + 1 + index}.\` <@${entry.id}> - **${entry.value.toLocaleString()}** kills`;
    })
    .join("\n");

  return createBaseEmbed({
    color: 0xdc143c,
    title: "⚔️ Monster Kill Leaderboard ⚔️",
    description: `💀 Here are the top monster slayers! 💀\n\n${formattedLeaderboard}`,
  }).setFooter({ text: "Total monsters slain by each user." });
};

const createGameInvatationEmbed = (
  commander: { username: string },
  gameName: string,
  messageLink: string
): EmbedBuilder => {
  return createBaseEmbed({
    color: 0xff0000,
    title: "⚔️ You've Been Challenged!",
    description: `${commander.username} has challenged you to ${gameName}.\nHere's your link: ${messageLink}`,
  });
};

const createAssembleEmbed = (
  player1: PlayerInfo,
  player2: PlayerInfo,
  player1FormattedResult: string,
  player2FormattedResult: string,
  currentPlayer: string,
  footer: string = "Guess you destinated number!"
): EmbedBuilder => {
  if (!footer || footer.trim() === "") {
    footer = "Guess you destinated number!";
  }

  return createBaseEmbed({
    color: 0xdc143c,
    title: "Assemble XX",
    description: ` \n${currentPlayer}'s Turn\n`,
  })
    .addFields(
      { name: `${player1.username}`, value: `${player1FormattedResult}` },
      { name: `${player2.username}`, value: `${player2FormattedResult}` }
    )
    .setFooter({ text: `${footer}` })
    .setTimestamp(null);
};

const createAssembleFinalEmbed = (
  player1: PlayerInfo,
  player2: PlayerInfo,
  player1FormattedResult: string,
  player2FormattedResult: string,
  answer: string,
  winner: string
): EmbedBuilder => {
  return createBaseEmbed({
    color: 0xdc143c,
    title: "Assemble XX",
    description: ` \nGame Over\n`,
  })
    .addFields(
      {
        name: `${player1.username}`,
        value: `${player1FormattedResult}`,
      },
      {
        name: `${player2.username}`,
        value: `${player2FormattedResult}`,
      },
      {
        name: `Winner`,
        value: `${winner}`,
      }
    )
    .setFooter({ text: ` \nThe Answer is **${answer}**\n` })
    .setTimestamp(null);
};

export {
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
  createSpinResultEmbed,
  createBaseEmbed,
  createLeaderboardPointEmbed,
  createLeaderboardMonsterKillEmbed,
  createAssembleEmbed,
  createAssembleFinalEmbed,
  createGameInvatationEmbed,
};
