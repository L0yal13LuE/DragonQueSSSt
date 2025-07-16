const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");

const { getCachedData, saveCachedData } = require("../providers/cacheProvider");
const { getSpin } = require("../providers/spinProvider");
const { getUserItem } = require("../providers/materialProvider");
const { announceItemSpinResult } = require("../announcements");
const { deductItemFromUser, addItemtoUser } = require("./materialManager");

const handleSpinButton = async (interaction) => {
  try {
    const userId = interaction.user.id;

    // Step 1: Defer the interaction
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.deferUpdate();
      } else {
        return;
      }
    } catch (deferError) {
      console.error(
        `Error deferring pagination update for ${userId}: ${deferError.message}`
      );
      return;
    }

    // Step 2: Verify custom ID
    const parts = interaction.customId.split("-");
    const selectedIndex = parts[3];

    if (parts.length !== 4) {
      console.warn(
        `Malformed nav customId for ${userId}: ${interaction.customId}`
      );
      return;
    }

    // Step 3: Verify cache if expired already
    const spinValueKey = `SPIN-${parts[1]}`;
    const spinCache = await getCachedData(spinValueKey);
    if (!spinCache) {
      await interaction.followUp({
        content: `This command is out of date. Please use the command again.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Step 4: Verify user
    const commander = spinCache.commander;
    if (commander.id !== userId) {
      await interaction.followUp({
        content: `This command belong to ${commander.username}. Please use the command yourself`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const materialToSend = spinCache.data[selectedIndex];

    const deductionSuccess = await deductItemFromUser(interaction.user, 156, 1);
    if (!deductionSuccess) {
      await interaction.editReply({
        content: `Failed to send ${materialToSend.emoji} ${materialToSend.name}. You might not have enough or an error occurred.`,
      });
      return;
    }

    const amount = 1;
    const additionSuccess = await addItemtoUser(
      interaction.user,
      materialToSend,
      amount
    );

    if (!additionSuccess) {
      await interaction.editReply({
        content: `Successfully deducted ${amount} ${materialToSend.emoji} **${materialToSend.name}** from you, but failed to add it to **${interaction.user.username}**. Attempting to return items to you...`,
      });

      // Attempt to rollback: Add the items back to the sender
      console.log(
        `[Transaction Failure] Adding item to receiver ${interaction.user.id} failed. Attempting to roll back deduction from sender ${interaction.user.id}.`
      );
      const rollbackSuccess = await addItemtoUser(
        interaction.user,
        156,
        amount
      );

      if (rollbackSuccess) {
        console.log(
          `[Transaction Rollback] Successfully rolled back item deduction for sender ${sender.id}.`
        );
        await interaction.editReply({
          content: `Failed to send ${amount} ${materialToSend.emoji} **${materialToSend.name}** to **${interaction.user.username}**. The items have been returned to your inventory.`,
        });
      } else {
        console.error(
          `[CRITICAL TRANSACTION FAILURE] Failed to add item to receiver ${interaction.user.id} AND failed to roll back deduction for sender ${interaction.user.id}. Item: ${materialToSend.id}, Amount: ${amount}. MANUAL INTERVENTION REQUIRED.`
        );
        await interaction.editReply({
          content: `A critical error occurred. Failed to send items to **${interaction.user.username}** AND failed to return the items to you. Please contact an admin immediately with details of this transaction (Sender: ${interaction.user.username}, Receiver: ${interaction.user.username}, Item: ${materialToSend.name}, Amount: ${amount}).`,
        });
      }
      return;
    }

    // Reply
    let wording = ``;
    for (let i = 0; i < spinCache.data.length; i++) {
      wording += spinCache.data[i].emoji + " ";
      if ((i + 1) % 4 === 0) {
        wording += "\n";
      }
    }
    wording += `\n Congratuation!!! ${interaction.user} got x ${amount} ${materialToSend.rarityEmoji} ${materialToSend.name} ${materialToSend.emoji}.`;

    interaction.editReply({
      content: wording,
      components: [],
    });

    announceItemSpinResult(interaction, materialToSend, amount);
  } catch (error) {
    console.error("Events.InteractionCreate : Failed!", error);
  }
};

const handleSpinCommand = async (interaction) => {
  try {
    const userId = interaction.user.id;
    const cardEmoji = "<:W_SpinCard:1379313979645497424>";

    const materialMaster = await getSpin({ id: 1 });
    const spinInfo = materialMaster[0];

    const userItem = await getUserItem({
      userId: userId,
      amount: 1,
      itemId: spinInfo.required_material_id,
    });

    if (!userItem || userItem.length === 0) {
      await interaction.reply({
        content: `No spin ticket available.`,
        ephemeral: true,
      });
      return;
    } else {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
      }
    }

    const resultPool = createCardArray(spinInfo.pool);

    let result = ``;
    for (let i = 0; i < resultPool.length; i++) {
      result += cardEmoji;
      if ((i + 1) % 4 === 0) {
        result += "\n";
      }
    }

    // Send the message to get message ID
    let initialComponent = createSpinButtons(
      "SPIN",
      `temp_${Date.now()}`,
      userId,
      16,
      4
    );

    let replyMessage = await interaction.followUp({
      embeds: [],
      content: result,
      components: initialComponent,
    });

    const leaderboardValueKey = `SPIN-${userId}`;

    // Bind message ID into each navigation buttons
    const finalComponents = createSpinButtons(
      "SPIN",
      replyMessage.id,
      userId,
      16,
      4
    );

    await replyMessage
      .edit({ components: finalComponents })
      .catch((e) =>
        console.warn(
          "Failed to edit spin buttons with final components:",
          e.message
        )
      );

    saveCachedData(leaderboardValueKey, {
      commander: {
        id: userId,
        username: interaction.user.username,
      },
      requiredMaterialId: spinInfo.required_material_id,
      data: resultPool,
    });
  } catch (error) {
    console.error(
      `Unexpected error during spin command for ${interaction.user.username}:`,
      error
    );
    interaction.reply("An unexpected error occurred. Please try again.");
    return null;
  }
};

const createCardArray = (materialPool) => {
  const totalCards = materialPool.length;

  // Clone and shuffle the materialPool
  const shuffledPool = [...materialPool].sort(() => Math.random() - 0.5);

  // Create an empty array for the cards
  const cards = new Array(totalCards);

  // Fill the cards
  let poolIndex = 0;
  for (let i = 0; i < totalCards; i++) {
    // Use material from shuffled pool
    const material = shuffledPool[poolIndex++];
    cards[i] = {
      id: material.material.id,
      emoji: material.material.emoji,
      name: material.material.name,
      rarityEmoji: material.material.rarity.emoji,
    };
  }

  return cards;
};

const createSpinButtons = (
  prefix,
  messageId,
  userId,
  number,
  buttonsPerRow = 5
) => {
  const rows = [];

  for (let i = 0; i < number; i += buttonsPerRow) {
    const row = new ActionRowBuilder();
    for (let j = i; j < i + buttonsPerRow && j < number; j++) {
      const btn = new ButtonBuilder()
        .setCustomId(`${prefix}-${userId}-${messageId}-${j}`)
        .setLabel(`${j + 1}`)
        // .setEmoji('<:W_SpinCard:1379313979645497424>')
        .setStyle(ButtonStyle.Primary);

      row.addComponents(btn);
    }
    rows.push(row);
  }

  return rows;
};

// Export the function to be used in other files
module.exports = { handleSpinCommand, handleSpinButton };
