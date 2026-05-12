import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';
import supabase from '../supabaseClient';
import { getUserItem, updateUserItem, insertUserItem } from '../providers/materialProvider';

const BAG_ITEMS_PER_PAGE = 10;
const BAG_AUTO_CLOSE_MINUTES = 2;
const BAG_INTERACTION_COOLDOWN_SECONDS = 4;

interface CraftListInstance {
  message: any;
  timeoutId: any;
  craftableItems: any[];
  currentPage: number;
}

const craftListInstances: Map<string, CraftListInstance> = new Map();

const craftListInteractionCooldowns: Map<string, number> = new Map();

interface MaterialPrepItem {
  material_id: number;
  name: string;
  amount: number;
  id: number;
  amount_owned: number;
  amount_new: number;
  valid: boolean;
  userItemMatch: any;
}

const createBagPageEmbed = (
  username: string,
  itemList: any[],
  page: number,
  totalPages: number,
  expirationTimestamp: string
): EmbedBuilder => {
  const start = page * BAG_ITEMS_PER_PAGE;
  const end = start + BAG_ITEMS_PER_PAGE;
  const itemsToShow = itemList.slice(start, end);

  let itemListText = '';
  itemsToShow.forEach(item => {
    const reqMats = item.materials.map((mat: any) => `${mat.materials.name} x${mat.amount}`).join(', ');
    let line = `**${item.name}**\n> ${reqMats}`;
    itemListText += `${line}\n\n`;
  });

  return new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle('Craft List')
    .setDescription(`${itemListText}Close in ${expirationTimestamp}.`)
    .setFooter({ text: `Page ${page + 1} of ${totalPages}` });
};

const createBagPaginationButtons = (
  messageId: string,
  userId: string,
  currentPage: number,
  totalPages: number,
  clanNumber: number
): ActionRowBuilder<ButtonBuilder> => {
  return new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`craftlist_nav_${messageId}_first`)
        .setLabel('<< First')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === 0 || totalPages <= 1),
      new ButtonBuilder()
        .setCustomId(`craftlist_nav_${messageId}_prev`)
        .setLabel('< Prev')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === 0 || totalPages <= 1),
      new ButtonBuilder()
        .setCustomId(`craftlist_nav_${messageId}_next`)
        .setLabel('Next >')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage >= totalPages - 1 || totalPages <= 1),
      new ButtonBuilder()
        .setCustomId(`craftlist_nav_${messageId}_last`)
        .setLabel('Last >>')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage >= totalPages - 1 || totalPages <= 1)
    );
};

const createButtonForItem = (
  userId: string,
  itemList: any[],
  page: number,
  totalPages: number,
  clanNumber: number
): ActionRowBuilder<ButtonBuilder>[] => {
  const buttonPrefix = 'crafitem_';

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  let currentRow = new ActionRowBuilder<ButtonBuilder>();

  const start = page * BAG_ITEMS_PER_PAGE;
  const end = start + BAG_ITEMS_PER_PAGE;
  const itemsToShow = itemList.slice(start, end);

  itemsToShow.forEach((item, index) => {
    const button = new ButtonBuilder()
      .setCustomId(`${buttonPrefix}${item.id}-${clanNumber}@${Math.floor(100000 + Math.random() * 900000)}_${userId}`)
      .setLabel(item.name)
      .setStyle(ButtonStyle.Primary);
    currentRow.addComponents(button);
    if (currentRow.components.length === 5 || index === itemsToShow.length - 1) {
      rows.push(currentRow);
      if (index < itemsToShow.length - 1) {
        currentRow = new ActionRowBuilder<ButtonBuilder>();
      }
    }
  });
  return rows;
};

const handleCraftListCommand = async (message: any, settings: any): Promise<void> => {
  const userId = message.author.id;
  const username = message.author.username;
  const autoCloseMs = BAG_AUTO_CLOSE_MINUTES * 60 * 1000;
  const clanNumber = settings.clanNumber || 0;

  try {
    const craftableItems = settings.items.filter(
      (item: any, index: number, self: any[]) => self.findIndex((i: any) => i.name === item.name) === index
    );

    if (!craftableItems || craftableItems.length === 0) {
      await message.reply({ content: 'No craft item at the moment, please come again later 😭' });
      return;
    }

    if (craftListInstances.has(userId)) {
      const oldInstance = craftListInstances.get(userId)!;
      clearTimeout(oldInstance.timeoutId);
      oldInstance.message.delete();
      craftListInstances.delete(userId);
    }

    const expirationTimestamp = `<t:${Math.floor((Date.now() + autoCloseMs) / 1000)}:R>`;
    let currentPage = 0;
    const totalPages = Math.ceil(craftableItems.length / BAG_ITEMS_PER_PAGE);

    const initialEmbed = createBagPageEmbed(username, craftableItems, currentPage, totalPages, expirationTimestamp);
    const tempMessageIdMarker = `temp_craftd_${Date.now()}`;
    const initialComponents = totalPages > 1
      ? [createBagPaginationButtons(tempMessageIdMarker, userId, currentPage, totalPages, clanNumber)]
      : [];
    const triggerButtonComponents = createButtonForItem(userId, craftableItems, currentPage, totalPages, clanNumber);

    const replyMessage = await message.reply({
      embeds: [initialEmbed],
      components: initialComponents.concat(triggerButtonComponents),
      fetchReply: true,
    });

    if (totalPages > 1) {
      const finalComponents = [createBagPaginationButtons(replyMessage.id, userId, currentPage, totalPages, clanNumber)];
      const finalTriggerButtonComponents = createButtonForItem(userId, craftableItems, currentPage, totalPages, clanNumber);
      await replyMessage.edit({
        components: finalComponents.concat(finalTriggerButtonComponents),
      }).catch((e: any) => console.warn('Failed to edit bag message with final components:', e.message));
    }

    const timeoutIdCraft = setTimeout(async () => {
      const currentInstance = craftListInstances.get(userId);
      if (currentInstance && currentInstance.message.id === replyMessage.id) {
        try {
          await replyMessage.edit({ content: 'Craft closed', embeds: [], components: [] });
        } catch (errorDel) {
          console.warn('Error editing bag message on timeout:', (errorDel as Error).message);
        }
        craftListInstances.delete(userId);
        craftListInteractionCooldowns.delete(userId);
      }
    }, autoCloseMs);

    craftListInstances.set(userId, {
      message: replyMessage,
      timeoutId: timeoutIdCraft,
      craftableItems: craftableItems,
      currentPage: currentPage,
    });
  } catch (error) {
    console.error(`Error handling bag command for ${username} (ID: ${userId}):`, error);
    await message.reply({ content: 'Server busy please try again later 😭' }).catch(() => {});
  }
};

const handleCraftListInteraction = async (
  interaction: any,
  clanShopSettingData: Map<string, any>,
  clanCraftSettingData: any[]
): Promise<void> => {
  if (!interaction.isButton() || !interaction.customId.startsWith('craftlist_nav_')) {
    return;
  }

  try {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.deferUpdate();
    }
  } catch (deferError) {
    console.error(`Error deferring donation list pagination update: ${(deferError as Error).message}`);
    return;
  }

  const messageChannelId = interaction.message.channelId;
  const channelClanNumber = clanShopSettingData.get(messageChannelId)?.clanNumber;
  const donationChannelClanObj = clanCraftSettingData.find(
    (row: any) => row.channel_id == messageChannelId
  );
  const donationClanNumber = donationChannelClanObj && donationChannelClanObj.setting
    ? donationChannelClanObj.setting.clanNumber
    : 0;
  const clanNumber = Math.max(channelClanNumber || 0, donationClanNumber);

  const userId = interaction.user.id;

  const now = Date.now();
  const userCooldownEndTimestamp = craftListInteractionCooldowns.get(userId);
  if (userCooldownEndTimestamp && now < userCooldownEndTimestamp) {
    const timeLeft = Math.ceil((userCooldownEndTimestamp - now) / 1000);
    try {
      return await interaction.reply({
        content: `Please wait ${timeLeft} more second(s).`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (e) {
      console.warn(`Cooldown ephemeral reply failed: ${(e as Error).message}`);
        }
        return;
      }
      craftListInteractionCooldowns.set(userId, now + (BAG_INTERACTION_COOLDOWN_SECONDS * 1000));

      const parts = interaction.customId.split('_');
  if (parts.length < 4) {
    console.warn(`Malformed craftlist_nav customId: ${interaction.customId}`);
    return;
  }
  const messageIdFromCustomId = parts[2];
  const action = parts[3];

  const bagInstance = craftListInstances.get(userId);

  const msgId_A = interaction.message.id.toString();
  const msgId_1 = messageIdFromCustomId?.toString() ?? null;
  const msgId_2 = bagInstance?.message?.id?.toString() ?? null;
  if (msgId_A !== msgId_1 || msgId_A !== msgId_2) {
    try {
      if (interaction.deferred) {
        console.warn(`Warning User ${userId} trying to use other's interaction (1): ${interaction.customId}`);
        return await interaction.followUp({
          content: 'Please use your own command.',
          flags: MessageFlags.Ephemeral,
        });
      }
      return;
    } catch (e) {
        console.warn(`[CraftPaginationManager] Expired view followUp failed (1): ${(e as Error).message}`);
        }
        return;
      }
      // session expire or session not found
      if (!bagInstance || bagInstance === null) {
    try {
      if (interaction.deferred) {
        console.warn(`Warning User ${userId} trying to use other's interaction (2): ${interaction.customId}`);
        return await interaction.followUp({
          content: 'Session expired or not your command.',
          flags: MessageFlags.Ephemeral,
        });
      }
      return;
    } catch (e) {
      console.warn(`[CraftPaginationManager] Expired view followUp failed (2): ${(e as Error).message}`);
    }
    return;
  }

  const { craftableItems } = bagInstance;
  let currentPage = bagInstance.currentPage;
  const totalPages = Math.ceil(craftableItems.length / BAG_ITEMS_PER_PAGE);
  const autoCloseMs = BAG_AUTO_CLOSE_MINUTES * 60 * 1000;
  const expirationTimestamp = `<t:${Math.floor((bagInstance.message.createdTimestamp + autoCloseMs) / 1000)}:R>`;

  let newPage = currentPage;
  if (action === 'first') newPage = 0;
  else if (action === 'prev') newPage = Math.max(0, currentPage - 1);
  else if (action === 'next') newPage = Math.min(totalPages - 1, currentPage + 1);
  else if (action === 'last') newPage = totalPages - 1;

  if (newPage === currentPage) {
    return;
  }

  bagInstance.currentPage = newPage;
  currentPage = newPage;

  try {
    const updatedEmbed = createBagPageEmbed(interaction.user.username, craftableItems, currentPage, totalPages, expirationTimestamp);
    const updatedButtons = [createBagPaginationButtons(interaction.message.id, userId, currentPage, totalPages, clanNumber)];
    const updateButtonsDonate = createButtonForItem(userId, craftableItems, currentPage, totalPages, clanNumber);

    await interaction.editReply({
      embeds: [updatedEmbed],
      components: [...updatedButtons, ...updateButtonsDonate],
    });
  } catch (error) {
    console.error(`Error on editReply for bag pagination (page ${currentPage}): ${(error as Error).message}`);
  }
};

const handleCraftListButtonClick = async (
  interaction: any,
  clanShopSettingData: Map<string, any>,
  clanCraftSettingData: any[]
): Promise<void> => {
  if (!interaction.isButton()) return;

  const userId = interaction.user.id;
  const username = interaction.user.username;
  const buttonPrefix = 'crafitem_';

  if (interaction.customId.startsWith(buttonPrefix)) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    } catch (e) {
      console.warn(`interaction.deferReply failed: ${(e as Error).message}`);
    }

    const itemToTriggerA = interaction.customId.replace(buttonPrefix, '').replace(/_/g, '');
    const itemToTriggerPrefix = itemToTriggerA.split('@')[0] || false;
    if (!itemToTriggerPrefix) {
      await interaction.followUp('Error: Could not identify the item you wish to donate.(1)\nPlease report this issue with screenshots to moderators or post it on the report channel.');
      return;
    }

    const itemToTriggerID = itemToTriggerPrefix.split('-')[0] || false;
    const clanNumber = itemToTriggerPrefix.split('-')[1] || false;
    if (!itemToTriggerID || !clanNumber) {
      await interaction.followUp('Error: Could not identify the item you wish to donate.(2)\nPlease report this issue with screenshots to moderators or post it on the report channel.');
      return;
    }

    const bagInstance = craftListInstances.get(userId);
    if (!bagInstance || bagInstance === null) {
      try {
        if (interaction.deferred) {
          await interaction.followUp({
            content: 'Session expired or not your command.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        return;
      } catch (e) {
        console.warn(`Expired view followUp failed: ${(e as Error).message}`);
      }
      return;
    }

    const { craftableItems } = bagInstance;
    const itemToCraft = craftableItems.find((item: any) => parseInt(item.id) === parseInt(itemToTriggerID)) || null;

    if (!itemToCraft || !itemToCraft.id || itemToCraft == null) {
      await interaction.followUp('Error: Could not identify the item you wish to craft.(3)\nPlease report this issue with screenshots to moderators or post it on the report channel.');
      return;
    }

    const reqMaterialID = itemToCraft.id;
    const reqMaterialName = itemToCraft.name;
    const reqMaterialArray = itemToCraft.materials;

    const resultPrepareItem: MaterialPrepItem[] = [];

    const createMaterialItem = (
      materialId: number,
      materialName: string,
      materialAmount: number,
      userItemMatch: any = null
    ): MaterialPrepItem => {
      const baseItem = {
        material_id: materialId,
        name: materialName,
        amount: materialAmount,
      };

      if (userItemMatch) {
        return {
          ...baseItem,
          id: userItemMatch.id,
          amount_owned: userItemMatch.amount,
          amount_new: userItemMatch.amount - materialAmount,
          valid: userItemMatch.amount >= materialAmount,
          userItemMatch: userItemMatch,
        };
      }

      return {
        ...baseItem,
        id: 0,
        amount_owned: 0,
        amount_new: 0,
        valid: false,
        userItemMatch: null,
      };
    };

    await Promise.all(reqMaterialArray.map(async ({ material_id, amount, materials }: any) => {
      const userItem = await getUserItem({ userId, itemId: material_id });
      const userItemMatch = userItem?.[0];
      const materialItem = createMaterialItem(
        material_id,
        materials.name,
        amount,
        userItemMatch
      );
      resultPrepareItem.push(materialItem);
    }));

    const isValid = resultPrepareItem.every(item => item.valid);
    if (isValid) {
      let allUpdated = true;
      const allUpdateResult: boolean[] = [];
      await Promise.all(resultPrepareItem.map(async ({ amount_new, userItemMatch }: any) => {
        const userUpdObj = { id: userId, username: username };
        const resultUpdate = await updateUserItem(userUpdObj, userItemMatch, amount_new);
        allUpdateResult.push(resultUpdate);
        if (!resultUpdate) allUpdated = false;
      }));

      if (allUpdated) {
        const userUpdObj = { id: userId, username: username };
        const existingCraftedItem = await getUserItem({ userId, itemId: reqMaterialID });
        let craftSuccess = false;
        if (existingCraftedItem?.[0]) {
          const currentAmount = existingCraftedItem[0].amount;
          craftSuccess = await updateUserItem(
            userUpdObj,
            existingCraftedItem[0] as any,
            currentAmount + 1
          );
        } else {
          const userInsObj = { id: reqMaterialID, name: reqMaterialName };
          craftSuccess = await insertUserItem(userUpdObj, userInsObj, 1);
        }

        if (craftSuccess) {
          await interaction.followUp(`Success: You crafted **${itemToCraft.name}**`);
        } else {
          await interaction.followUp(`Fail: You crafted **${itemToCraft.name}** but failed to insert new item. (4)\nPlease report this issue with screenshots to moderators or post it on the report channel.`);
        }
      } else {
        await interaction.followUp(`Fail: You crafted **${itemToCraft.name}** but failed to to deduct material. (5)\nPlease report this issue with screenshots to moderators or post it on the report channel.`);
      }
    } else {
      const invalidMaterials = resultPrepareItem.filter(item => !item.valid);
      const missingMaterials = invalidMaterials.map(item => `> ${item.name} (**${item.amount_owned}**/${item.amount})`).join('\n');
      await interaction.followUp(`You don't have enough material to craft **${itemToCraft.name}**.\nMissing: \n${missingMaterials}\nComeback again when you have the required materials!`);
    }
  }
};

export {
  handleCraftListCommand,
  handleCraftListInteraction,
  handleCraftListButtonClick,
};
