const { getMaterialByChannel } = require("../providers/materialProvider");
const { getConfig } = require("../providers/configProvider");
const { insertUserItem } = require("../dbUtils");
const { createBaseEmbed } = require("./embedManager");

let baseDropRate = 0.15;

const handleItemDropV2 = async (supabase, message, channel) => {
  const channelId = channel.id;

  // 1. Determine Item List and Area Type
  const materialData = await getMaterialByChannel(supabase, {
    channelId: channelId,
  });

  if (!materialData || materialData.length === 0) return;

  const areaType = materialData[0].channel.areaChannel[0].area.name;

  const itemList = []; // Empty array
  materialData.forEach((item) => {
    const obj = {
      emoji: item.material.emoji,
      name: item.material.name,
      rarity: item.material.rarity.name,
      dropRate: item.material.rarity.drop_rate,
    };

    itemList.push(obj); // Add object to array
  });

  // 2. Calculate Total Drop Probability for the Area
  const totalAreaDropProbability = await calculateTotalDropProbability(
    supabase,
    itemList
  );

  // 3. Check if ANY drop occurs based on total area probability
  const dropRoll = Math.random();
  console.log(
    `[Drop Logic] Initial drop roll: ${dropRoll.toFixed(
      5
    )} (Needed < ${totalAreaDropProbability.toFixed(5)} for a drop)`
  );

  // 4. If a drop occurs, determine WHICH item drops (Weighted Selection)
  if (dropRoll >= totalAreaDropProbability) {
    // No drop occurred based on the initial roll
    console.log(`[Drop Logic] Initial drop roll failed. No drop occurred.`);
    console.log(`--- Drop Logic Finished ---\n`);
    return []; // Return empty array indicating no drop
  }

  console.log(
    "[Drop Logic] Initial drop roll successful. Proceeding to item selection."
  );

  const selectedItem = selectWeightedItem(itemList, areaType);

  if (selectedItem) {
    console.log(
      `[Drop Logic] Drop Success! Selected Item: ${selectedItem.emoji} ${selectedItem.name}`
    );
    console.log(`--- Drop Logic Finished ---\n`);

    // 5. Insert item
    const itemAmount = 1;
    const itemInserted = await insertUserItem(
      supabase,
      message.author.id,
      channelId,
      selectedItem,
      itemAmount,
      new Date().toISOString()
    );

    if (itemInserted && channel) {
      console.log(
        `[${message.author.username}] Sending item drop announcement.`
      );

      // 6. Send reply
      const itemDropEmbed = createBaseEmbed({
        color: 0xffd700,
        title: "✨ Found Item! ✨",
        description: `${message.author.toString()} got the item!`,
      }).addFields(
        {
          name: "Item",
          value: `${selectedItem.emoji} ${selectedItem.name}`,
          inline: true,
        },
        { name: "Amount", value: itemAmount.toString(), inline: true },
        { name: "Location", value: `<#${channelId}>`, inline: true }
      );

      channel.send({ embeds: [itemDropEmbed] });
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

const calculateTotalDropProbability = async (supabase, itemList) => {
  let totalProbability = 0;

  const configData = await getConfig(supabase, {
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

  console.log("[Drop Logic] Calculating total area drop probability...");
  uniqueRarityRates.forEach((dropRate, rarityName) => {
    const rarityProbability = dropRate * baseDropRate;
    totalProbability += rarityProbability;
    console.log(
      `[Drop Logic] - Adding ${rarityName}: ${(rarityProbability * 100).toFixed(
        2
      )}%`
    );
  });

  // Clamp the total area probability between 0 and 1
  const clampedProbability = Math.max(0, Math.min(totalProbability, 1));
  console.log(
    `[Drop Logic] Total calculated probability: ${(
      totalProbability * 100
    ).toFixed(2)}%, Clamped: ${(clampedProbability * 100).toFixed(2)}%`
  );
  return clampedProbability;
};

const selectWeightedItem = (droppableItems, areaType) => {
  console.log("[Drop Logic] Performing weighted item selection...");
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
      console.log(
        `[Drop Logic] - Item: ${item.name}, Rarity: ${
          item.rarity
        }, Individual Weight: ${individualProb.toFixed(5)}`
      );
    } else {
      console.warn(
        `[Drop Logic] Skipping item '${item.name}' in weighted selection due to missing rarity, drop rate, or zero rarity count.`
      );
    }
  });

  console.log(
    `[Drop Logic] Total weighted sum for selection: ${weightedTotal.toFixed(5)}`
  );

  if (weightedTotal <= 0) {
    console.warn(
      "[Drop Logic] Weighted total individual probability is zero. No item selected."
    );
    return null; // Indicate no item was selected
  }

  let selectionRoll = Math.random() * weightedTotal;
  console.log(
    `[Drop Logic] Item selection roll: ${selectionRoll.toFixed(
      5
    )} (Needed <= cumulative probability)`
  );

  let cumulativeProbability = 0;

  // Select the item based on the weighted roll
  for (const item of droppableItems) {
    // Only consider items that had a valid probability calculated
    if (itemProbabilities.hasOwnProperty(item.name)) {
      cumulativeProbability += itemProbabilities[item.name];
      console.log(
        `[Drop Logic] Checking item: ${
          item.name
        }, Cumulative Probability: ${cumulativeProbability.toFixed(5)}`
      );
      if (selectionRoll <= cumulativeProbability) {
        return item; // Return the selected item
      }
    }
  }

  // Fallback: Should ideally not be reached
  console.error(
    "[Drop Logic] Error in weighted individual item drop selection: Fell through the selection loop."
  );
  // As a last resort, return a random item if the loop failed unexpectedly
  return droppableItems.length > 0
    ? droppableItems[Math.floor(Math.random() * droppableItems.length)]
    : null;
};

module.exports = {
  handleItemDropV2,
};
