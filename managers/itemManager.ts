import supabase from '../supabaseClient';
import { fetchOrGetMaterialChannel } from './materialManager';
import {
  getUserItem,
  insertUserItem,
  updateUserItem,
} from '../providers/materialProvider';
import { getConfig } from '../providers/configProvider';
import { announceItemDrop } from '../announcements';

let baseDropRate = 0.15;

const handleItemDrop = async (message: any): Promise<any[]> => {
  const materialData = await fetchOrGetMaterialChannel({
    channelId: message.channel.id,
  });

  if (!materialData || materialData.length === 0) return [];

  const areaType = materialData[0].channel.areaChannel[0].area.name;

  const itemList: any[] = [];
  materialData.forEach((item: any) => {
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

  const totalAreaDropProbability = await calculateTotalDropProbability(
    itemList
  );

  const dropRoll = Math.random();

  if (dropRoll >= totalAreaDropProbability) {
    console.log(`[Drop Logic] Initial drop roll failed. No drop occurred.`);
    return [];
  }

  const selectedItem = selectWeightedItem(itemList, areaType);

  if (selectedItem) {
    console.log(
      `[Drop Logic] Drop Success! Selected Item: ${selectedItem.emoji} ${selectedItem.name}`
    );

    const itemAmount = 1;
    const itemInserted = await insertDropItems(message, selectedItem);

    if (itemInserted) {
      announceItemDrop(message, selectedItem, itemAmount);
    }

    return [selectedItem];
  } else {
    console.warn(
      `[Drop Logic] Initial drop successful, but no item was selected in weighted selection for ${areaType} area.`
    );
    console.log(`--- Drop Logic Finished ---\n`);
    return [];
  }
};

const insertDropItems = async (
  message: any,
  selectedItem: any,
  itemAmount: number = 1
): Promise<boolean> => {
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
        userItem[0] as any,
        newAmount
      );
    } else {
      itemInserted = await insertUserItem(
        message.author,
        selectedItem,
        itemAmount
      );
    }
    return itemInserted;
  } catch (error) {
    return false;
  }
};

const calculateTotalDropProbability = async (
  itemList: any[]
): Promise<number> => {
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

  const uniqueRarityRates = new Map<string, number>();
  itemList.forEach((item: any) => {
    if (!uniqueRarityRates.has(item.rarity)) {
      uniqueRarityRates.set(item.rarity, item.dropRate);
    }
  });

  uniqueRarityRates.forEach((dropRate: number) => {
    const rarityProbability = dropRate * baseDropRate;
    totalProbability += rarityProbability;
  });

  const clampedProbability = Math.max(0, Math.min(totalProbability, 1));
  return clampedProbability;
};

const selectWeightedItem = (
  droppableItems: any[],
  areaType: string
): any | null => {
  const itemProbabilities: Record<string, number> = {};
  const rarityCounts = droppableItems.reduce((acc: Record<string, number>, item: any) => {
    acc[item.rarity] = (acc[item.rarity] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  let weightedTotal = 0;
  droppableItems.forEach((item: any) => {
    if (
      item.rarity &&
      rarityCounts[item.rarity] > 0
    ) {
      const individualProb =
        (item.dropRate * baseDropRate) / rarityCounts[item.rarity];
      itemProbabilities[item.name] = individualProb;
      weightedTotal += individualProb;
    } else {
      console.warn(
        `[Drop Logic] Skipping item '${item.name}' in weighted selection due to missing rarity, drop rate, or zero rarity count.`
      );
    }
  });

  if (weightedTotal <= 0) {
    return null;
  }

  let selectionRoll = Math.random() * weightedTotal;

  let cumulativeProbability = 0;

  for (const item of droppableItems) {
    if (Object.hasOwn(itemProbabilities, item.name)) {
      cumulativeProbability += itemProbabilities[item.name];
      if (selectionRoll <= cumulativeProbability) {
        return item;
      }
    }
  }

  return droppableItems.length > 0
    ? droppableItems[Math.floor(Math.random() * droppableItems.length)]
    : null;
};

export {
  handleItemDrop,
};
