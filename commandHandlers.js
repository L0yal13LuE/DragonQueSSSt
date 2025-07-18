const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { supabase } = require("./supabaseClient");
const {
  getUser,
  getMonsterForDate,
  getTotalDamageDealt,
} = require("./dbUtils");
const { calculateNextLevelExp, getTodaysDateString } = require("./gameLogic");
const { getUserItem } = require("./providers/materialProvider");
const {
  createBagEmbed,
  createMonsterStatusEmbed,
} = require("./managers/embedManager");

/**
 * Handles the '!rank' command with a fancier embed and progress bar. Works in any channel.
 * @param {object} message - Discord message object.
 */
const handleRankCommand = async (message) => {
  if (!supabase) {
    message.reply("Database issue! Can't check rank. 😥");
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

      if (nextLevelExp > 0) {
        // Avoid division by zero
        const cappedExp = Math.min(userExp, nextLevelExp);
        percentage = (cappedExp / nextLevelExp) * 100;
        filledBlocks = Math.floor(percentage / (100 / totalBlocks));
      } else {
        filledBlocks = totalBlocks; // Max out bar if next level isn't defined properly
        percentage = 100;
      }

      const emptyBlocks = totalBlocks - filledBlocks;
      const progressBar = "🟩".repeat(filledBlocks) + "⬛".repeat(emptyBlocks);
      // --- End Progress Bar Calculation ---

      const rankEmbed = new EmbedBuilder()
        .setColor(0xffd700) // Gold color for flair
        .setTitle(`🌟 Level 🌟`)
        .setDescription(
          `${message.author.toString()} Let's see how far you've come!`
        )
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
      console.log(
        `[${username}] Replied to !rank in channel ${message.channel.name}.`
      );
    } else {
      message.reply("You don't have a rank yet! Chat to start earning EXP! 💪");
      console.log(`[${username}] User not found for !rank.`);
    }
  } catch (error) {
    console.error("Error during rank command:", error);
    message.reply("Oops! Error checking rank. Try again.");
  }
};

/**
 * Handles the '!chat' command.
 */
const handleChatCommand = async (message, args) => {
  const userMessage = args.join(" ");
  if (!userMessage) {
    message.reply("Forgot to include a message? Tell me what to say! 😉");
    return;
  }
  try {
    await message.channel.send(userMessage);
    console.log(`[${message.author.username}] Repeated chat message.`);
  } catch (error) {
    console.error("Error sending chat reply:", error);
    message.reply("Uh-oh... Couldn't send that message. Sorry! 🙏");
  }
};

const handleBagCommand = async (message) => {
  if (!supabase) {
    message.reply("Database issue! Can't open bag. 😥");
    return;
  }

  try {
    const userItems = await getUserItem({
      userId: message.author.id,
      amount: 1,
    });

    const itemList =
      userItems && userItems.length > 0
        ? userItems
            .map(
              (item) =>
                `${item.material.rarities.emoji} ${item.material.name} ${
                  item.material.emoji
                } x ${item.amount.toLocaleString()}`
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

const handleMonsterCommand = async (interaction, currentMonsterState) => {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply();
  }
  const today = getTodaysDateString();
  console.log(
    `[${interaction.user.username}] Requested monster status for ${today}.`
  );
  try {
    // Use cached state if available and for today, otherwise fetch
    let monsterData =
      currentMonsterState && currentMonsterState.spawn_date === today
        ? currentMonsterState
        : await getMonsterForDate(today);

    if (monsterData) {
      const isAlive = monsterData.is_alive;
      let status = isAlive ? "⚔️" : "☠️";
      let color = 0xff0000; // Default red
      let remainingHp = 0;

      if (isAlive) {
        const totalDamage = await getTotalDamageDealt(today);
        remainingHp = Math.max(0, monsterData.max_hp - totalDamage);

        const ratio = remainingHp / monsterData.max_hp;

        // Set status and color based on HP ratio
        if (ratio < 0.1) color = 0xffa500; // Orange
        else if (ratio < 0.2) color = 0xffff00; // Yellow
        else color = 0x32cd32; // Green
      }

      // Set readable text
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
      const monsterEmbed = createMonsterStatusEmbed(
        today,
        monsterData,
        status,
        latestHpRow,
        color
      );

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

const handleBagPaginationCommand = async (message, isDM = false) => {
  try {
    const autoClose = 5;
    const autoCloseTimer = autoClose * 60 * 1000;
    const expirationTimestamp = `<t:${Math.floor(
      (Date.now() + autoClose * 60 * 1000) / 1000
    )}:R>`;

    const ITEMS_PER_PAGE = 10;
    const userId = message.author.id;
    const username = message.author.username;

    const userItems = await getUserItem({
      userId: userId,
      amount: 1,
    });

    if (isDM) {
      const itemList =
        userItems && userItems.length > 0
          ? Object.values(userItems)
              .map(
                (value) =>
                  `${value.material.rarities.emoji} ${value.material.name} ${value.material.emoji} x ${value.amount}`
              )
              .join("\n")
          : "Your bag is empty... Chat to find some items!";

      const bagEmbed = createBagEmbed(
        message.author,
        itemList +
          `\n\nThis is BOT auto generated message\nPlease do not reply to this message.`
      );

      try {
        await message.author.send({ embeds: [bagEmbed] });
        await message.reply(`✅ I've sent your bag contents to your DMs!`);
      } catch (error) {
        await message.reply(
          `❌ Please check setting to allow direct messages from server members.`
        );
      }
      return;
    }

    // Initialize current page to 0 (first page)
    let currentPage = 0;
    const totalPages = Math.ceil(userItems.length / ITEMS_PER_PAGE);

    // Function to create an embed for a specific page
    const createEmbedItems = (page) => {
      const start = page * ITEMS_PER_PAGE;
      const end = start + ITEMS_PER_PAGE;
      const itemsToShow = userItems.slice(start, end);

      const itemListText =
        itemsToShow.length > 0
          ? itemsToShow
              .map(
                (item, index) =>
                  `${item.material.emoji} ${item.material.name}: ${item.amount}`
              )
              .join("\n")
          : "Your bag is empty!";

      const embed = new EmbedBuilder()
        .setColor(0x0099ff) // Blue color for the embed
        .setTitle(`${username}'s Bag, let's see what's inside!`)
        .setDescription(
          `${itemListText}\n\nExpire in ${autoClose} minute ${expirationTimestamp}\n\n`
        )
        .setFooter({ text: `Page ${page + 1} of ${totalPages}` });

      return embed;
    };

    // Create the initial embed and buttons
    const initialEmbed = createEmbedItems(currentPage);

    // Create action row for pagination buttons
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`bag_first_${userId}`)
        .setLabel("<<")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === 0), // Disable if on the first page
      new ButtonBuilder()
        .setCustomId(`bag_prev_${userId}`)
        .setLabel("<")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === 0), // Disable if on the first page
      new ButtonBuilder()
        .setCustomId(`bag_next_${userId}`)
        .setLabel(">")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage >= totalPages - 1), // Disable if on the last page
      new ButtonBuilder()
        .setCustomId(`bag_last_${userId}`)
        .setLabel(">>")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage >= totalPages - 1) // Disable if on the last page
    );
    // Send the initial message with the embed and buttons
    const replyMessage = await message.reply({
      embeds: [initialEmbed],
      components: [row],
      fetchReply: true, // Needed to fetch the message object for the collector
    });

    // Create a collector to listen for button interactions on this specific message
    const collector = replyMessage.createMessageComponentCollector({
      filter: (i) => i.user.id === message.author.id, // Only allow the command invoker to interact
      time: autoCloseTimer - 5000, // Collector will expire after 60*5=300 seconds (300000 milliseconds)
    });

    // Handle button interactions
    collector.on("collect", async (i) => {
      if (i.customId === `bag_prev_${userId}`) {
        currentPage--;
      } else if (i.customId === `bag_next_${userId}`) {
        currentPage++;
      } else if (i.customId === `bag_first_${userId}`) {
        currentPage = 0;
      } else if (i.customId === `bag_last_${userId}`) {
        currentPage = totalPages - 1;
      }

      // Update the embed and button states
      const updatedEmbed = createEmbedItems(currentPage);
      row.components[0].setDisabled(currentPage === 0); // First button
      row.components[1].setDisabled(currentPage === 0); // Previous button
      row.components[2].setDisabled(currentPage >= totalPages - 1); // Next button
      row.components[3].setDisabled(currentPage >= totalPages - 1); // Last button

      // Update the original message with the new embed and button states
      await i.update({
        embeds: [updatedEmbed],
        components: [row],
      });
    });

    // auto delete after 5 minute
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

module.exports = {
  handleRankCommand,
  handleChatCommand,
  handleBagCommand,
  handleMonsterCommand,
  handleBagPaginationCommand,
};
