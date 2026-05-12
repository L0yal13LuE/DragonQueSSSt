import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Message,
} from 'discord.js';
import supabase from './supabaseClient';
import { getUser, getMonsterForDate, getTotalDamageDealt } from './dbUtils';
import { calculateNextLevelExp, getTodaysDateString } from './gameLogic';
import { getUserItem } from './providers/materialProvider';
import { createBagEmbed, createMonsterStatusEmbed } from './managers/embedManager';

const handleRankCommand = async (message: Message): Promise<void> => {
  if (!supabase) {
    message.reply("Database issue! Can't check rank. 😥");
    return;
  }

  const userId = message.author.id;
  const username = message.author.username;
  const userAvatar = message.author.displayAvatarURL();

  try {
    const userData = await getUser(userId);
    if (userData) {
      const userLevel = userData.level;
      const userExp = userData.current_exp;
      const nextLevelExp = calculateNextLevelExp(userLevel);

      const totalBlocks = 10;
      let filledBlocks = 0;
      let percentage = 0;

      if (nextLevelExp > 0) {
        const cappedExp = Math.min(userExp, nextLevelExp);
        percentage = (cappedExp / nextLevelExp) * 100;
        filledBlocks = Math.floor(percentage / (100 / totalBlocks));
      } else {
        filledBlocks = totalBlocks;
        percentage = 100;
      }

      const emptyBlocks = totalBlocks - filledBlocks;
      const progressBar = "🟩".repeat(filledBlocks) + "⬛".repeat(emptyBlocks);

      const rankEmbed = new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle(`🌟 Level 🌟`)
        .setDescription(`${message.author.toString()} Let's see how far you've come!`)
        .setThumbnail(userAvatar)
        .addFields(
          { name: "Current Level", value: `**${userLevel}**`, inline: true },
          { name: "EXP", value: `${userExp} / ${nextLevelExp}`, inline: true },
          {
            name: "Progress to Next Level",
            value: `${progressBar} (${percentage.toFixed(1)}%)`,
            inline: false,
          }
        )
        .setFooter({ text: `Keep earning EXP! You can do it! 💪` })
        .setTimestamp();

      message.reply({ embeds: [rankEmbed] });
      console.log(`[${username}] Replied to !rank in channel ${(message.channel as any).name}.`);
    } else {
      message.reply("You don't have a rank yet! Chat to start earning EXP! 💪");
      console.log(`[${username}] User not found for !rank.`);
    }
  } catch (error) {
    console.error("Error during rank command:", error);
    message.reply("Oops! Error checking rank. Try again.");
  }
};

const handleChatCommand = async (message: Message, args: string[]): Promise<void> => {
  const userMessage = args.join(" ");
  if (!userMessage) {
    message.reply("Forgot to include a message? Tell me what to say! 😉");
    return;
  }
  try {
    await (message.channel as any).send(userMessage);
    console.log(`[${message.author.username}] Repeated chat message.`);
  } catch (error) {
    console.error("Error sending chat reply:", error);
    message.reply("Uh-oh... Couldn't send that message. Sorry! 🙏");
  }
};

const handleBagCommand = async (message: Message): Promise<void> => {
  if (!supabase) {
    message.reply("Database issue! Can't open bag. 😥");
    return;
  }

  try {
    const userItems = await getUserItem({ userId: message.author.id, amount: 1 });

    const itemList =
      userItems && userItems.length > 0
        ? userItems
            .map(
              (item: any) =>
                `${item.material?.[0]?.rarities?.[0]?.emoji || ''} ${item.material?.[0]?.name || ''} ${item.material?.[0]?.emoji || ''} x ${(item.amount as number).toLocaleString()}`
            )
            .join("\n")
        : "Your bag is empty... Chat to find some items!";

    const bagEmbed = createBagEmbed(message.author, itemList);
    message.reply({ embeds: [bagEmbed] });
    console.log(`[${message.author.username}] Replied to !bag.`);
  } catch (error) {
    console.error("Error during bag command:", error);
    message.reply("Oops! Error opening bag. Try again.");
  }
};

const handleMonsterCommand = async (interaction: any, currentMonsterState: any): Promise<void> => {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply();
  }
  const today = getTodaysDateString();
  console.log(`[${interaction.user.username}] Requested monster status for ${today}.`);
  try {
    let monsterData =
      currentMonsterState && currentMonsterState.spawn_date === today
        ? currentMonsterState
        : await getMonsterForDate(today);

    if (monsterData) {
      const isAlive = monsterData.is_alive;
      let status = isAlive ? "⚔️" : "☠️";
      let color: any = 0xff0000;
      let remainingHp = 0;

      if (isAlive) {
        const totalDamage = await getTotalDamageDealt(today);
        remainingHp = Math.max(0, monsterData.max_hp - totalDamage);

        const ratio = remainingHp / monsterData.max_hp;

        if (ratio < 0.1) color = 0xffa500;
        else if (ratio < 0.2) color = 0xffff00;
        else color = 0x32cd32;
      }

      let remainingHpText = "0";
      if (remainingHp > 0) {
        const ratio = remainingHp / monsterData.max_hp;
        if (ratio < 0.1) {
          remainingHpText = "Very Low";
        } else if (ratio < 0.2) {
          remainingHpText = "Low";
        } else {
          remainingHpText = remainingHp.toString();
        }
      }

      const latestHpRow = `${remainingHpText} / ${monsterData.max_hp}`;
      const monsterEmbed = createMonsterStatusEmbed(today, monsterData, status, latestHpRow, color);

      await interaction.followUp({ embeds: [monsterEmbed] });
    } else {
      interaction.followUp(`No monster spawned today (${today})! 😴`);
      console.log(`No monster found for ${today} via !monster command.`);
    }
  } catch (error) {
    console.error("Error during monster command:", error);
    interaction.followUp("Oops! Error checking monster status. Try again.");
  }
};

const handleBagPaginationCommand = async (message: Message, isDM = false): Promise<void> => {
  try {
    const autoClose = 5;
    const autoCloseTimer = autoClose * 60 * 1000;
    const expirationTimestamp = `<t:${Math.floor((Date.now() + autoClose * 60 * 1000) / 1000)}:R>`;

    const ITEMS_PER_PAGE = 10;
    const userId = message.author.id;
    const username = message.author.username;

    const userItems = await getUserItem({ userId: userId, amount: 1 });

    if (isDM) {
      const itemList =
        userItems && userItems.length > 0
          ? userItems
              .map(
                (value: any) =>
                  `${value.material?.[0]?.rarities?.[0]?.emoji || ''} ${value.material?.[0]?.name || ''} ${value.material?.[0]?.emoji || ''} x ${value.amount}`
              )
              .join("\n")
          : "Your bag is empty... Chat to find some items!";

      const bagEmbed = createBagEmbed(
        message.author,
        itemList + `\n\nThis is BOT auto generated message\nPlease do not reply to this message.`
      );

      try {
        await message.author.send({ embeds: [bagEmbed] });
        await message.reply(`✅ I've sent your bag contents to your DMs!`);
      } catch (error) {
        await message.reply(`❌ Please check setting to allow direct messages from server members.`);
      }
      return;
    }

    let currentPage = 0;
    const totalPages = userItems ? Math.ceil(userItems.length / ITEMS_PER_PAGE) : 0;

    const createEmbedItems = (page: number) => {
      const start = page * ITEMS_PER_PAGE;
      const end = start + ITEMS_PER_PAGE;
      const itemsToShow = userItems ? userItems.slice(start, end) : [];

      const itemListText =
        itemsToShow.length > 0
          ? itemsToShow
              .map(
                (item: any) =>
                  `${item.material?.[0]?.emoji || ''} ${item.material?.[0]?.name || ''}: ${item.amount}`
              )
              .join("\n")
          : "Your bag is empty!";

      const embed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle(`${username}'s Bag, let's see what's inside!`)
        .setDescription(`${itemListText}\n\nExpire in ${autoClose} minute ${expirationTimestamp}\n\n`)
        .setFooter({ text: `Page ${page + 1} of ${totalPages}` });

      return embed;
    };

    const initialEmbed = createEmbedItems(currentPage);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`bag_first_${userId}`)
        .setLabel("<<")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === 0),
      new ButtonBuilder()
        .setCustomId(`bag_prev_${userId}`)
        .setLabel("<")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === 0),
      new ButtonBuilder()
        .setCustomId(`bag_next_${userId}`)
        .setLabel(">")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage >= totalPages - 1),
      new ButtonBuilder()
        .setCustomId(`bag_last_${userId}`)
        .setLabel(">>")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage >= totalPages - 1)
    );

    const replyMessage = await message.reply({
      embeds: [initialEmbed],
      components: [row],
    } as any);

    const collector = replyMessage.createMessageComponentCollector({
      filter: (i: any) => i.user.id === message.author.id,
      time: autoCloseTimer - 5000,
    });

    collector.on("collect", async (i: any) => {
      if (i.customId === `bag_prev_${userId}`) {
        currentPage--;
      } else if (i.customId === `bag_next_${userId}`) {
        currentPage++;
      } else if (i.customId === `bag_first_${userId}`) {
        currentPage = 0;
      } else if (i.customId === `bag_last_${userId}`) {
        currentPage = totalPages - 1;
      }

      const updatedEmbed = createEmbedItems(currentPage);
      row.components[0].setDisabled(currentPage === 0);
      row.components[1].setDisabled(currentPage === 0);
      row.components[2].setDisabled(currentPage >= totalPages - 1);
      row.components[3].setDisabled(currentPage >= totalPages - 1);

      await i.update({
        embeds: [updatedEmbed],
        components: [row],
      });
    });

    setTimeout(async () => {
      try {
        await replyMessage.delete();
      } catch (errorDel) {
        console.error("Error deleting message:", errorDel);
      }
      await message.reply(
        "**Bag closed.** Use `!bag` to open again.\n*If you want to keep your items private, use `!bag_dm` instead (please allow dm in your settings)*"
      );
    }, autoCloseTimer);
  } catch (error) {
    console.error("Error while handling !bag pagination command:", error);
  }
};

export {
  handleRankCommand,
  handleChatCommand,
  handleBagCommand,
  handleMonsterCommand,
  handleBagPaginationCommand,
};
