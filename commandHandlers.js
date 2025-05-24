const { EmbedBuilder } = require("discord.js");
const { supabase } = require("./supabaseClient");
const {
  getUser,
  getMonsterForDate,
  getTotalDamageDealt,
} = require("./dbUtils");
const { calculateNextLevelExp, getTodaysDateString } = require("./gameLogic");
const { getUserItem } = require("./providers/materialProvider");
const { createBagEmbed } = require("./managers/embedManager");

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
      amount: 1
    });

    const itemList =
      Object.values(userItems).length > 0
        ? Object.values(userItems)
            .map(
              (value) =>
                `${value.material.emoji} ${value.material.name}: ${value.amount}`
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

/**
 * Handles the '!monster' command to show today's monster status.
 */
const handleMonsterCommand = async (message, currentMonsterState) => {
  if (!supabase) {
    message.reply("Database issue! Can't check monster status. 😥");
    return;
  }
  const today = getTodaysDateString();
  console.log(
    `[${message.author.username}] Requested monster status for ${today}.`
  );
  try {
    // Use cached state if available and for today, otherwise fetch
    let monsterData =
      currentMonsterState && currentMonsterState.spawn_date === today
        ? currentMonsterState
        : await getMonsterForDate(today);

    if (monsterData) {
      let status = monsterData.is_alive ? "⚔️" : "☠️";
      let remainingHpText = "0";
      let color = monsterData.is_alive ? 0xff4500 : 0x32cd32; // Orange if alive, Green if dead

      if (monsterData.is_alive) {
        const totalDamage = await getTotalDamageDealt(today);
        const remainingHp = Math.max(0, monsterData.max_hp - totalDamage);
        remainingHpText = remainingHp.toString();
        if (remainingHp <= 0) {
          status = "☠️ (Update Pending)"; // Indicate defeat is imminent or pending update
          color = 0x32cd32; // Show green if HP is 0 or less
        }
      }

      const monsterEmbed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`👽 Today's Monster Status (${today}) 🦑`)
        .addFields(
          { name: "Name", value: monsterData.name, inline: true },
          { name: "Status", value: `**${status}**`, inline: true },
          {
            name: "HP",
            value: `${remainingHpText} / ${monsterData.max_hp}`,
            inline: true,
          }
        )
        .setTimestamp();

      if (!monsterData.is_alive && monsterData.killed_by_user_id) {
        monsterEmbed.addFields({
          name: "Defeated By",
          value: `<@${monsterData.killed_by_user_id}>`,
          inline: true,
        });
      }
      if (!monsterData.is_alive && monsterData.killed_at_timestamp) {
        monsterEmbed.addFields({
          name: "Defeated At",
          value: `<t:${Math.floor(
            new Date(monsterData.killed_at_timestamp).getTime() / 1000
          )}:R>`,
          inline: true,
        });
      }
      message.reply({ embeds: [monsterEmbed] });
    } else {
      message.reply(`No monster spawned today (${today})! 😴`);
      console.log(`No monster found for ${today} via !monster command.`);
    }
  } catch (error) {
    console.error("Error during monster command:", error);
    message.reply("Oops! Error checking monster status. Try again.");
  }
};

module.exports = {
  handleRankCommand,
  handleChatCommand,
  handleBagCommand,
  handleMonsterCommand,
};
