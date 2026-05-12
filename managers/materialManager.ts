import * as constants from '../constants';
import { fetchWithCache } from './cacheManager';
import {
  getMaterialByChannel,
  getUserItem,
  insertUserItem,
  updateUserItem,
} from '../providers/materialProvider';
import { createBaseEmbed } from './embedManager';

const fetchOrGetMaterialChannel = async (filters: Record<string, any> = {}): Promise<any> => {
  const result = await fetchWithCache({
    cacheKey: constants.CACHE_MATERIAL_CHANNEL_PREFIX,
    ttl: constants.CACHE_MATERIAL_CHANNEL_TTL_MS,
    providerFn: getMaterialByChannel,
    label: "fetchMaterialChannel",
    filters,
  });

  if (!result) {
    return result;
  }

  let filteredData = result;

  if ("channelId" in filters) {
    filteredData = filteredData.filter(
      (item: any) => item.channel_id === filters.channelId
    );
  }

  if ("isGainExp" in filters) {
    filteredData = filteredData.filter(
      (item: any) => item.is_active === filters.isGainExp
    );
  }

  return filteredData;
};

const handleMaterialCommand = async (interaction: any): Promise<any> => {
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    }

    const channelId = interaction.channelId;
    const materialData = await getMaterialByChannel({
      channelId: channelId,
    });

    if (materialData && materialData.length > 0) {
      const itemList = materialData
        .map(
          (entry: any) =>
            `${entry.material.emoji} ${entry.material.name} (${(
              entry.material.rarity.drop_rate * 100
            ).toFixed(2)}%)`
        )
        .join("\n");

      const materialEmbed = createBaseEmbed({
        color: 0x8a2be2,
        title: `マテリアル一覧 ✨`,
        description: itemList,
      });

      await interaction.followUp({ embeds: [materialEmbed], ephemeral: true });
    } else {
      const materialEmbed = createBaseEmbed({
        color: 0x8a2be2,
        title: `このチャンネルにはマテリアルがありません ✨`,
      });

      await interaction.followUp({ embeds: [materialEmbed], ephemeral: true });
    }
  } catch (error) {
    console.error(
      `Unexpected error during material command for ${interaction.user.username}:`,
      error
    );
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: "予期しないエラーが発生しました。もう一度お試しください。",
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: "予期しないエラーが発生しました。もう一度お試しください。",
        ephemeral: true,
      });
    }
    return null;
  }
};

const deductItemFromUser = async (
  user: { id: string },
  itemId: number,
  deductedAmount: number
): Promise<boolean> => {
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
      userItems[0] as any,
      userItems[0].amount - deductedAmount
    );
    return updateSuccess;
  } catch (error) {
    console.error(`[Unexpected Error] Deducting item for ${user.id}:`, error);
    return false;
  }
};

const addItemtoUser = async (
  user: { id: string },
  materialObject: { id: number; name?: string; emoji?: string },
  addedAmount: number
): Promise<boolean> => {
  try {
    const userItems = await getUserItem({
      userId: user.id,
      itemId: materialObject.id,
    });

    if (!userItems || userItems.length === 0) {
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
      const currentItemInstance = userItems[0];
      const updateSuccess = await updateUserItem(
        user,
        currentItemInstance as any,
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

export {
  fetchOrGetMaterialChannel,
  handleMaterialCommand,
  deductItemFromUser,
  addItemtoUser,
};
