const { supabase } = require("../supabaseClient");
const {
  getMaterialByChannel,
  getUserItemV2,
  insertUserItem, // Added import for insertUserItem
  updateUserItemV2,
} = require("../providers/materialProvider");
const { createBaseEmbed } = require("../managers/embedManager");

/**
 * Handles the '!spin' command to fetch and display a random card.
 * @param {object} message - The Discord message object.
 */
const handleMaterialCommand = async (message) => {
  try {
    const channelId = message.channelId;
    const materialData = await getMaterialByChannel({
      channelId: channelId,
    });

    if (materialData && materialData.length > 0) {
      const itemList = materialData
        .map(
          (entry) =>
            `${entry.material.emoji} ${entry.material.name} (${(
              entry.material.rarity.drop_rate * 100
            ).toFixed(2)}%)`
        )
        .join("\n");

      const materialEmbed = createBaseEmbed({
        color: 0x8a2be2,
        title: `✨ Possible Materials ✨`,
        description: itemList,
      });

      message.reply({ embeds: [materialEmbed] });
    } else {
      const materialEmbed = createBaseEmbed({
        color: 0x8a2be2,
        title: `✨ No materials found for this channel ✨`,
      });

      message.reply({ embeds: [materialEmbed] });
    }
  } catch (error) {
    console.error(
      `Unexpected error during material command for ${message.author.username}:`,
      error
    );
    message.reply("An unexpected error occurred. Please try again.");
    return null;
  }
};

const deductItemFromUser = async (user, itemId, deductedAmount) => {
  try {
    const userItems = await getUserItemV2({
      userId: user.id,
      itemId: itemId,
    });

    if (
      !userItems ||
      userItems.count === 0 ||
      userItems.data[0].amount < deductedAmount
    ) {
      console.error(
        `[Item Deduction Error] User: ${user.id} | Item ID: ${itemId} | Amount: ${deductedAmount}. Not enough items or item not found.`
      );
      return false;
    }

    const updateSuccess = await updateUserItemV2(
      user,
      userItems.data[0],
      userItems.data[0].amount - deductedAmount
    );
    return updateSuccess;
  } catch (error) {
    console.error(`[Unexpected Error] Deducting item for ${user.id}:`, error);
    return false;
  }
};

const addItemtoUser = async (user, materialObject, addedAmount) => {
  try {
    const userItems = await getUserItemV2({
      userId: user.id,
      itemId: materialObject.id,
    });

    if (!userItems || userItems.count === 0) {
      // User doesn't have this item yet, insert new record
      const insertSuccess = await insertUserItem(
        user,
        materialObject,
        addedAmount
      );
      if (!insertSuccess) {
        console.error(
          `[Item Add Error - Insert] User: ${user.id} | Item ID: ${materialObject.id}`
        );
        return false;
      }
      console.log(
        `[Item Add - Insert] User: ${user.id} | Item: ${materialObject.name} ${materialObject.emoji} | Amount: ${addedAmount}`
      );
      return true;
    } else {
      // User already has this item, update existing record
      const currentItemInstance = userItems.data[0];
      const updateSuccess = await updateUserItemV2(
        user,
        currentItemInstance,
        currentItemInstance.amount + addedAmount
      );
      if (!updateSuccess) {
        return false;
      }
      return true;
    }
  } catch (error) {
    console.error(`[Unexpected Error] Adding item for ${user.id}:`, error);
    return false;
  }
};

// Export the function to be used in other files
module.exports = {
  handleMaterialCommand,
  deductItemFromUser,
  addItemtoUser,
};
