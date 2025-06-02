const {
  getCachedData,
  saveCachedData,
  deleteCachedData,
} = require("./managers/cacheManager");

const { fetchRarity } = require("./providers/rarityProvider");

const { getMaterial, getUserItemV2 } = require("./providers/materialProvider");

const {
  deductItemFromUser,
  addItemtoUser,
} = require("./managers/materialManager");
const { MessageFlags } = require("discord.js");

const handleSendCommand = async (interaction) => {
  // Check if this interaction is the submission or not
  if (!interaction.isChatInputCommand()) {
    const focusedOption = interaction.options.getFocused(true);
    if (focusedOption.name === "item") {
      await fetchUserItem(interaction); // Fetching item for 25 records searching
    }
  } else {
    await handleSendCommandSubmission(interaction); // Handle send command submit
  }
};

const fetchUserItem = async (interaction) => {
  try {
    const itemNameInput = interaction.options.getString("item"); // User's input for autocomplete
    const userId = interaction.user.id;
    const userBagKey = `bag_${userId}`;

    let allUserItemsData = null;

    if (itemNameInput === "") {
      await deleteCachedData(userBagKey);

      const result = await getUserItemV2({ userId: userId, amount: 1 }, 0, -1);

      if (result.error || !result.data) {
        console.error(
          `[Autocomplete] Error fetching bag for user ${userId} for cache:`,
          result.error || "No data"
        );
        await interaction.respond([]); // Respond with empty if DB fetch fails
        return;
      }
      allUserItemsData = result.data;
      // Save the fetched data to cache
      saveCachedData(userBagKey, allUserItemsData);
    } else {
      // 1. Check cache for the user's entire bag
      const cachedBag = await getCachedData(userBagKey);

      if (cachedBag) {
        allUserItemsData = cachedBag;
      } else {
        // 2. Cache miss: Fetch all items (amount >= 1) for the user from DB
        // Pass page 0 and limit -1 to fetch all items according to our modification in getUserItem
        const result = await getUserItemV2(
          { userId: userId, amount: 1 },
          0,
          -1
        );

        if (result.error || !result.data) {
          console.error(
            `[Autocomplete] Error fetching bag for user ${userId} for cache:`,
            result.error || "No data"
          );
          await interaction.respond([]); // Respond with empty if DB fetch fails
          return;
        }
        allUserItemsData = result.data;
        // Save the fetched data to cache
        saveCachedData(userBagKey, allUserItemsData);
      }
    }

    if (!allUserItemsData || allUserItemsData.length === 0) {
      await interaction.respond([]);
      return;
    }

    // 3. Filter items in memory based on user's autocomplete input
    // The `amount: 1` filter was already applied when fetching for the cache.
    const filteredItems = allUserItemsData.filter(
      (item) =>
        item.material &&
        item.material.name &&
        item.material.name.toLowerCase().includes(itemNameInput.toLowerCase())
    );

    if (filteredItems.length === 0) {
      await interaction.respond([]);
      return;
    }

    // Sort items alphabetically by name
    filteredItems.sort((a, b) => {
      return a.material.name.localeCompare(b.material.name);
    });

    // 4. Respond with up to 25 choices for autocomplete
    await interaction.respond(
      filteredItems.slice(0, 25).map((i) => ({
        name: `${i.material.rarities.emoji} ${i.material.name} ${i.material.emoji} x ${i.amount}`,
        value: i.material.id.toString(), // This is the material_id
      }))
    );
  } catch (error) {
    console.error(
      `[Autocomplete] Error in fetchUserItem for user ${interaction.user.id}:`,
      error
    );
    // Avoid trying to respond if it already has been or if it's no longer valid
    // (though after 3s, it's likely invalid anyway for autocomplete)
    if (!interaction.responded) {
      try {
        await interaction.respond([]);
      } catch (respondError) {
        console.error(
          "[Autocomplete] Failed to send empty error response:",
          respondError
        );
      }
    }
  }
};

const handleSendCommandSubmission = async (interaction) => {
  try {
    // Defer reply ephemerally
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    } else if (interaction.replied && !interaction.ephemeral) {
      // If it was replied but not ephemerally (should not happen with collector setup)
      // We can't change it to ephemeral here. This is a tricky state.
      // For now, assume deferReply or an ephemeral update.
      await interaction.deferUpdate().catch(console.error); // Acknowledge
    } else if (interaction.deferred && !interaction.ephemeral) {
      // Already deferred but not ephemerally, update to acknowledge
      await interaction.deferUpdate().catch(console.error);
    }

    const itemId = interaction.options.getString("item"); // This is material_id
    const amountStr = interaction.options.getString("amount");
    const receiver = interaction.options.getUser("user");
    const sender = interaction.user;

    // Validate amount
    const amount = parseInt(amountStr, 10);
    if (isNaN(amount) || amount <= 0) {
      // await interaction.reply({
      await interaction.editReply({
        content: "Please provide a valid positive amount.",
        // ephemeral: true,
      });
      return;
    }

    if (sender.id === receiver.id) {
      // await interaction.reply({
      await interaction.editReply({
        content: "You cannot send items to yourself.",
        // ephemeral: true,
      });
      return;
    }

    // Fetch item details for the reply and for insertUserItem
    const materialDetailsArray = await getMaterial({ id: itemId });
    if (!materialDetailsArray || materialDetailsArray.length === 0) {
      // await interaction.reply({
      await interaction.editReply({
        content: "Error: Could not find the item to send.",
        // ephemeral: true,
      });
      return;
    }
    const materialToSend = materialDetailsArray[0]; // { id, name, emoji, ... }

    if (itemId && amount && receiver) {
      // Sender
      const deductionSuccess = await deductItemFromUser(sender, itemId, amount);
      if (!deductionSuccess) {
        // await interaction.reply({
        await interaction.editReply({
          content: `Failed to send ${materialToSend.emoji} ${materialToSend.name}. You might not have enough or an error occurred.`,
          // ephemeral: true,
        });
        return;
      }

      // Receiver
      const additionSuccess = await addItemtoUser(
        receiver,
        materialToSend,
        amount
      );
      if (!additionSuccess) {
        // await interaction.reply({
        await interaction.editReply({
          content: `Successfully deducted ${amount} ${materialToSend.emoji} **${materialToSend.name}** from you, but failed to add it to **${receiver.username}**. Attempting to return items to you...`,
          // ephemeral: true,
        });

        // Attempt to rollback: Add the items back to the sender
        console.log(
          `[Transaction Failure] Adding item to receiver ${receiver.id} failed. Attempting to roll back deduction from sender ${sender.id}.`
        );
        const rollbackSuccess = await addItemtoUser(
          sender,
          materialToSend,
          amount
        );

        if (rollbackSuccess) {
          console.log(
            `[Transaction Rollback] Successfully rolled back item deduction for sender ${sender.id}.`
          );
          // await interaction.followUp({
          await interaction.editReply({
            // Use followUp as we've already replied
            content: `Failed to send ${amount} ${materialToSend.emoji} **${materialToSend.name}** to **${receiver.username}**. The items have been returned to your inventory.`,
            // ephemeral: true,
          });
        } else {
          console.error(
            `[CRITICAL TRANSACTION FAILURE] Failed to add item to receiver ${receiver.id} AND failed to roll back deduction for sender ${sender.id}. Item: ${materialToSend.id}, Amount: ${amount}. MANUAL INTERVENTION REQUIRED.`
          );
          // await interaction.followUp({
          await interaction.editReply({
            // Use followUp
            content: `A critical error occurred. Failed to send items to **${receiver.username}** AND failed to return the items to you. Please contact an admin immediately with details of this transaction (Sender: ${sender.username}, Receiver: ${receiver.username}, Item: ${materialToSend.name}, Amount: ${amount}).`,
            // ephemeral: true,
          });
        }
        return;
      }

      // await interaction.editReply(
      await interaction.channel.send(
        `✅ **${sender.username}** sent **${amount}** ${materialToSend.emoji} **${materialToSend.name}** to **${receiver.username}**!`
      );
      Promise.all([
        deleteCachedData(userBagKey),
        // deleteUserBagCache(receiver.id),
      ])
        .then(() => {
          console.log(
            `[Cache] Cleared bag cache for sender ${sender.id} and receiver ${receiver.id} after successful send.`
          );
        })
        .catch((cacheErr) => {
          console.error("[Cache] Error clearing caches after send:", cacheErr);
        });
    }
  } catch (error) {
    console.error(
      `[Command Submission] Error in handleSendCommandSubmission for user ${interaction.user.id}:`,
      error
    );
    // If we already replied (e.g., deferred), try to edit or followUp
    if (interaction.replied || interaction.deferred) {
      await interaction
        .editReply({
          content:
            "An unexpected error occurred while processing your command. Please try again later.",
          // ephemeral: true, // Keep it ephemeral if the defer was
        })
        .catch((e) =>
          console.error("Failed to editReply with error message:", e)
        );
    }
    // If deferReply failed, there's not much we can do with the interaction.
  }
};

// Export the function to be used in other files
module.exports = {
  handleSendCommand,
};
