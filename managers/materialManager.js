const CONSTANTS = require("../constants");
const { fetchWithCache } = require("./cacheManager");

const {
  getMaterialByChannel,
  getUserItem,
  insertUserItem, // Added import for insertUserItem
  updateUserItem,
} = require("../providers/materialProvider");
const { createBaseEmbed } = require("../managers/embedManager");

const fetchOrGetMaterialChannel = async (filters = {}) => {
  const result = await fetchWithCache({
    cacheKey: CONSTANTS.CACHE_MATERIAL_CHANNEL_PREFIX,
    ttl: CONSTANTS.CACHE_MATERIAL_CHANNEL_TTL_MS,
    providerFn: getMaterialByChannel,
    label: "fetchMaterialChannel",
    filters,
  });

  if (!result) {
    return result; // either false or an object with invalid data
  }

  let filteredData = result;

  if ("channelId" in filters) {
    filteredData = filteredData.filter((item) => item.channel_id === filters.channelId);
  }

  if ("isGainExp" in filters) {
    filteredData = filteredData.filter(
      (item) => item.is_active === filters.isGainExp
    );
  }

  return filteredData;
};

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
    const userItems = await getUserItem({
      userId: user.id,
      itemId: itemId,
    });

    if (
      !userItems ||
      userItems.length === 0 ||
      userItems[0].amount < deductedAmount
    ) {
      console.error(
        `[Item Deduction Error] User: ${user.id} | Item ID: ${itemId} | Amount: ${deductedAmount}. Not enough items or item not found.`
      );
      return false;
    }

    const updateSuccess = await updateUserItem(
      user,
      userItems[0],
      userItems[0].amount - deductedAmount
    );
    return updateSuccess;
  } catch (error) {
    console.error(`[Unexpected Error] Deducting item for ${user.id}:`, error);
    return false;
  }
};

const addItemtoUser = async (user, materialObject, addedAmount) => {
  try {
    const userItems = await getUserItem({
      userId: user.id,
      itemId: materialObject.id,
    });

    if (!userItems || userItems.length === 0) {
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
      const currentItemInstance = userItems[0];
      const updateSuccess = await updateUserItem(
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
  fetchOrGetMaterialChannel,
  handleMaterialCommand,
  deductItemFromUser,
  addItemtoUser,
};
