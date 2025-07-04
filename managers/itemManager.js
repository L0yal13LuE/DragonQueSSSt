const { supabase } = require("../supabaseClient");
const { fetchOrGetMaterialChannel } = require("./materialManager");
const {
  getUserItem,
  insertUserItem,
  updateUserItem,
} = require("../providers/materialProvider");
const { getConfig } = require("../providers/configProvider");
const { announceItemDrop } = require("../announcements");

let baseDropRate = 0.15;
const handleItemDrop = async (message) => {
  // 1. Determine Item List and Area Type
  const materialData = await fetchOrGetMaterialChannel({
    channelId: message.channel.id,
  });

  if (!materialData || materialData.length === 0) return;

  const areaType = materialData[0].channel.areaChannel[0].area.name;

  const itemList = [];
  materialData.forEach((item) => {
    const obj = {
      id: item.material.id,
      name: item.material.name,
      emoji: item.material.emoji,
      rarity: item.material.rarity.name,
      dropRate: item.material.rarity.drop_rate,
      rarityEmoji: item.material.rarity.emoji,
    };

    itemList.push(obj);
  });

  // 2. Calculate Total Drop Probability for the Area
  const totalAreaDropProbability = await calculateTotalDropProbability(
    itemList
  );

  // 3. Check if ANY drop occurs based on total area probability
  const dropRoll = Math.random();

  // 4. If a drop occurs, determine WHICH item drops (Weighted Selection)
  if (dropRoll >= totalAreaDropProbability) {
    console.log(`[Drop Logic] Initial drop roll failed. No drop occurred.`);
    return []; // Return empty array indicating no drop
  }

  const selectedItem = selectWeightedItem(itemList, areaType);

  if (selectedItem) {
    console.log(
      `[Drop Logic] Drop Success! Selected Item: ${selectedItem.emoji} ${selectedItem.name}`
    );

    // 5. Insert item
    const itemAmount = 1;
    let itemInserted = insertDropItems(message, selectedItem);

    // 6. Send reply
    if (itemInserted) {
      announceItemDrop(message, selectedItem, itemAmount);
    } else if (itemInserted) {
      console.warn(
        `[${message.author.username}] Earned item, but announcement channel unavailable for announcement.`
      );
    }

    return [selectedItem]; // Return the single chosen item as an array
  } else {
    console.warn(
      `[Drop Logic] Initial drop successful, but no item was selected in weighted selection for ${areaType} area.`
    );
    console.log(`--- Drop Logic Finished ---\n`);
    return []; // Should not happen if droppableItems.length > 0 and weightedTotal > 0
  }
};

const insertDropItems = async (message, selectedItem, itemAmount = 1) => {
  try {
    const userItem = await getUserItem({
      userId: message.author.id,
      itemId: selectedItem.id,
    });

    let itemInserted = false;
    if (userItem && userItem.length > 0) {
      const newAmount = userItem[0].amount + itemAmount;
      itemInserted = await updateUserItem(
        message.author,
        userItem[0],
        newAmount
      );
    } else {
      itemInserted = await insertUserItem(
        message.author,
        selectedItem,
        itemAmount
      );
    }
    return true;
  } catch (error) {
    return false;
  }
};

const calculateTotalDropProbability = async (itemList) => {
  let totalProbability = 0;
  if (!supabase) {
    console.warn(
      "[calculateTotalDropProbability] Supabase client not available. Using default baseDropRate."
    );
  }

  const configData = await getConfig({
    key: "base_drop_rate",
  });

  if (configData && configData.length > 0) {
    baseDropRate = parseFloat(configData[0].value);
  }

  const uniqueRarityRates = new Map();
  itemList.forEach((item) => {
    if (!uniqueRarityRates.has(item.rarity)) {
      uniqueRarityRates.set(item.rarity, item.dropRate);
    }
  });

  // console.log("[Drop Logic] Calculating total area drop probability...");
  uniqueRarityRates.forEach((dropRate, rarityName) => {
    const rarityProbability = dropRate * baseDropRate;
    totalProbability += rarityProbability;
    // console.log(
    //   `[Drop Logic] - Adding ${rarityName}: ${(rarityProbability * 100).toFixed(
    //     2
    //   )}%`
    // );
  });

  // Clamp the total area probability between 0 and 1
  const clampedProbability = Math.max(0, Math.min(totalProbability, 1));
  // console.log(
  //   `[Drop Logic] Total calculated probability: ${(
  //     totalProbability * 100
  //   ).toFixed(2)}%, Clamped: ${(clampedProbability * 100).toFixed(2)}%`
  // );
  return clampedProbability;
};

const selectWeightedItem = (droppableItems, areaType) => {
  // console.log("[Drop Logic] Performing weighted item selection...");
  const itemProbabilities = {};
  const rarityCounts = droppableItems.reduce((acc, item) => {
    acc[item.rarity] = (acc[item.rarity] || 0) + 1;
    return acc;
  }, {});

  let weightedTotal = 0;
  droppableItems.forEach((item) => {
    // Ensure rarity and drop rate exist before calculating
    if (
      item.rarity &&
      //   DROP_RATE[item.rarity] !== undefined &&
      rarityCounts[item.rarity] > 0
    ) {
      const individualProb =
        (item.dropRate * baseDropRate) / rarityCounts[item.rarity];
      itemProbabilities[item.name] = individualProb;
      weightedTotal += individualProb;
      // console.log(
      //   `[Drop Logic] - Item: ${item.name}, Rarity: ${
      //     item.rarity
      //   }, Individual Weight: ${individualProb.toFixed(5)}`
      // );
    } else {
      console.warn(
        `[Drop Logic] Skipping item '${item.name}' in weighted selection due to missing rarity, drop rate, or zero rarity count.`
      );
    }
  });

  // console.log(
  //   `[Drop Logic] Total weighted sum for selection: ${weightedTotal.toFixed(5)}`
  // );

  if (weightedTotal <= 0) {
    // console.warn(
    //   "[Drop Logic] Weighted total individual probability is zero. No item selected."
    // );
    return null; // Indicate no item was selected
  }

  let selectionRoll = Math.random() * weightedTotal;
  // console.log(
  //   `[Drop Logic] Item selection roll: ${selectionRoll.toFixed(
  //     5
  //   )} (Needed <= cumulative probability)`
  // );

  let cumulativeProbability = 0;

  // Select the item based on the weighted roll
  for (const item of droppableItems) {
    // Only consider items that had a valid probability calculated
    if (itemProbabilities.hasOwnProperty(item.name)) {
      cumulativeProbability += itemProbabilities[item.name];
      // console.log(
      //   `[Drop Logic] Checking item: ${
      //     item.name
      //   }, Cumulative Probability: ${cumulativeProbability.toFixed(5)}`
      // );
      if (selectionRoll <= cumulativeProbability) {
        return item; // Return the selected item
      }
    }
  }

  // Fallback: Should ideally not be reached
  // console.error(
  //   "[Drop Logic] Error in weighted individual item drop selection: Fell through the selection loop."
  // );
  // As a last resort, return a random item if the loop failed unexpectedly
  return droppableItems.length > 0
    ? droppableItems[Math.floor(Math.random() * droppableItems.length)]
    : null;
};

module.exports = {
  handleItemDrop,
};
