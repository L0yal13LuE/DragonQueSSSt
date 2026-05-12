import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';
import supabase from '../supabaseClient';
import { getUserItem, updateUserItem } from '../providers/materialProvider';

const BAG_ITEMS_PER_PAGE = 10;
const BAG_AUTO_CLOSE_MINUTES = 2;
const BAG_INTERACTION_COOLDOWN_SECONDS = 4;

interface DonationListInstance {
  message: any;
  timeoutId: any;
  craftableItems: any[];
  currentPage: number;
}

const donationListInstances: Map<string, DonationListInstance> = new Map();

const donationListInteractionCooldowns: Map<string, number> = new Map();

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

  const itemListText = itemsToShow.length > 0
    ? itemsToShow.map(item => `${item.index}.${item.name}`).join('\n')
    : 'List is empty!';

  return new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle('Clan Donation List')
    .setDescription(`${itemListText}\n\nClose in ${expirationTimestamp}.`)
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
        .setCustomId(`donationlist_nav_${messageId}_first`)
        .setLabel('<< First')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === 0 || totalPages <= 1),
      new ButtonBuilder()
        .setCustomId(`donationlist_nav_${messageId}_prev`)
        .setLabel('< Prev')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === 0 || totalPages <= 1),
      new ButtonBuilder()
        .setCustomId(`donationlist_nav_${messageId}_next`)
        .setLabel('Next >')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage >= totalPages - 1 || totalPages <= 1),
      new ButtonBuilder()
        .setCustomId(`donationlist_nav_${messageId}_last`)
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
  const buttonPrefix = 'donationitem_';

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

const getCraftableItems = async (): Promise<any[]> => {
  try {
    if (!supabase) {
      console.error('Supabase client not available in getCraftableItems');
      return [];
    }
    const { data, error } = await supabase.rpc('get_materials_with_crafts');
    if (error) {
      console.error('Error fetching craftable items:', error);
      return [];
    }
    return data.map((row: any, index: number) => ({ ...row, index: index + 1 }));
  } catch (error) {
    console.error('Error fetching craftable items:', error);
    return [];
  }
};

const handleDonationListCommand = async (message: any, clanNumber: number): Promise<void> => {
  const userId = message.author.id;
  const username = message.author.username;
  const autoCloseMs = BAG_AUTO_CLOSE_MINUTES * 60 * 1000;

  try {
    const craftableItemsRaw = await getCraftableItems();

    const craftableItems = craftableItemsRaw.filter(
      (item: any, index: number, self: any[]) => self.findIndex((i: any) => i.name === item.name) === index
    );

    if (!craftableItems || craftableItems.length === 0) {
      await message.reply({ content: 'No items are donatable at the moment, please come again later 😭' });
      return;
    }

    if (donationListInstances.has(userId)) {
      const oldInstance = donationListInstances.get(userId)!;
      clearTimeout(oldInstance.timeoutId);
      oldInstance.message.delete();
      donationListInstances.delete(userId);
    }

    const expirationTimestamp = `<t:${Math.floor((Date.now() + autoCloseMs) / 1000)}:R>`;
    let currentPage = 0;
    const totalPages = Math.ceil(craftableItems.length / BAG_ITEMS_PER_PAGE);

    const initialEmbed = createBagPageEmbed(username, craftableItems, currentPage, totalPages, expirationTimestamp);
    const tempMessageIdMarker = `temp_cland_${Date.now()}`;
    const initialComponents = totalPages > 1
      ? [createBagPaginationButtons(tempMessageIdMarker, userId, currentPage, totalPages, clanNumber)]
      : [];
    const donateButtonComponents = createButtonForItem(userId, craftableItems, currentPage, totalPages, clanNumber);

    const replyMessage = await message.reply({
      embeds: [initialEmbed],
      components: initialComponents.concat(donateButtonComponents),
      fetchReply: true,
    });

    if (totalPages > 1) {
      const finalComponents = [createBagPaginationButtons(replyMessage.id, userId, currentPage, totalPages, clanNumber)];
      const finalDonateButtonComponents = createButtonForItem(userId, craftableItems, currentPage, totalPages, clanNumber);
      await replyMessage.edit({ components: finalComponents.concat(finalDonateButtonComponents) }).catch((e: any) => console.warn('Failed to edit bag message with final components:', e.message));
    }

    const timeoutId = setTimeout(async () => {
      const currentInstance = donationListInstances.get(userId);
      if (currentInstance && currentInstance.message.id === replyMessage.id) {
        try {
          await replyMessage.edit({ content: 'Donate closed', embeds: [], components: [] });
        } catch (errorDel) {
          console.warn('Error editing bag message on timeout:', (errorDel as Error).message);
        }
        donationListInstances.delete(userId);
        donationListInteractionCooldowns.delete(userId);
      }
    }, autoCloseMs);

    donationListInstances.set(userId, {
      message: replyMessage,
      timeoutId: timeoutId,
      craftableItems: craftableItems,
      currentPage: currentPage,
    });
  } catch (error) {
    console.error(`Error handling bag command for ${username} (ID: ${userId}):`, error);
    await message.reply({ content: 'Server busy please try again later 😭' }).catch(() => {});
  }
};

const handleDonationListInteraction = async (
  interaction: any,
  clanShopSettingData: Map<string, any>,
  clanCraftSettingData: any[]
): Promise<void> => {
  if (!interaction.isButton() || !interaction.customId.startsWith('donationlist_nav_')) {
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
  const donationClanNumber =
    donationChannelClanObj && donationChannelClanObj.setting
      ? donationChannelClanObj.setting.clanNumber
      : 0;
  const clanNumber = Math.max(channelClanNumber || 0, donationClanNumber);

  const userId = interaction.user.id;

  const now = Date.now();
  const userCooldownEndTimestamp = donationListInteractionCooldowns.get(userId);
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
  donationListInteractionCooldowns.set(userId, now + (BAG_INTERACTION_COOLDOWN_SECONDS * 1000));

  const parts = interaction.customId.split('_');
  if (parts.length < 4) {
    console.warn(`Malformed donationlist_nav customId: ${interaction.customId}`);
    return;
  }
  const messageIdFromCustomId = parts[2];
  const action = parts[3];

  const bagInstance = donationListInstances.get(userId);

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
      console.warn(`[ClanDonationManager] Expired view followUp failed (1): ${(e as Error).message}`);
    }
    return;
  }

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
      console.warn(`[ClanDonationManager] Expired view followUp failed (2): ${(e as Error).message}`);
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

const handleDonateButtonClick = async (
  interaction: any,
  clanShopSettingData: Map<string, any>,
  clanCraftSettingData: any[]
): Promise<void> => {
  if (!interaction.isButton()) return;

  const userId = interaction.user.id;
  const username = interaction.user.username;
  const buttonPrefix = 'donationitem_';

  if (interaction.customId.startsWith(buttonPrefix)) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    } catch (e) {
      console.warn(`interaction.deferReply failed: ${(e as Error).message}`);
    }

    const itemToDonateA = interaction.customId.replace(buttonPrefix, '').replace(/_/g, '');
    const itemToDonatePrefix = itemToDonateA.split('@')[0] || false;
    if (!itemToDonatePrefix) {
      await interaction.followUp('Error: Could not identify the item you wish to donate.(1)\nPlease report this issue with screenshots to moderators or post it on the report channel.');
      return;
    }

    const itemtoDonateID = itemToDonatePrefix.split('-')[0] || false;
    const clanNumber = itemToDonatePrefix.split('-')[1] || false;
    if (!itemtoDonateID || !clanNumber) {
      await interaction.followUp('Error: Could not identify the item you wish to donate.(2)\nPlease report this issue with screenshots to moderators or post it on the report channel.');
      return;
    }

    const userItem = await getUserItem({ userId, itemId: Number(itemtoDonateID) });
    const userItemMatch = userItem?.[0];
    if (!userItemMatch) {
      await interaction.followUp(`You don't have that item to donate.`);
      return;
    }

    const { amount: amountOwned, material: materialOwned } = userItemMatch as any;
    const amountNew = amountOwned - 1;
    if (amountNew < 0) {
      await interaction.followUp(`You don't have **${materialOwned?.name}** to donate.`);
      return;
    }

    const userUpdObj = { id: userId, username: username };
    const resultUpdate = await updateUserItem(userUpdObj, userItemMatch as any, amountNew);
    if (!resultUpdate) {
      await interaction.followUp('Error: Could not update your item amount.(3)\nPlease report this issue with screenshots to moderators or post it on the report channel.');
      return;
    }

    const donationItem = await makeDonation(Number(clanNumber), userId, Number(itemtoDonateID));
    if (donationItem) {
      await interaction.followUp(`Successfully donated **${(materialOwned as any)?.name}** x1 to clan No.${clanNumber}.`);
    } else {
      await interaction.followUp('Error: Could not donate the item.(4)\nPlease report this issue with screenshots to moderators or post it on the report channel.');
    }
  }
};

const makeDonation = async (
  clanNumber: number,
  userId: string,
  itemId: number
): Promise<boolean> => {
  const currentSeason = 'A';
  try {
    if (!supabase) {
      console.error('Supabase client not available in makeDonation');
      return false;
    }
    const { data } = await supabase
      .from('clan_donation')
      .select('*')
      .eq('clan_number', clanNumber)
      .eq('season', currentSeason)
      .eq('material_id', itemId);

    if (data && data.length > 0) {
      const { id: currentID, amount: currentAmount } = data[0];
      const newAmount = currentAmount + 1;
      const { error } = await supabase
        .from('clan_donation')
        .update({ amount: newAmount })
        .eq('id', currentID);
      if (error) {
        console.error(`Error updating item:`, error.message);
        return false;
      }
    } else {
      const { error: insertErrorA } = await supabase.from('clan_donation').insert([
        {
          clan_number: clanNumber,
          season: currentSeason,
          material_id: itemId,
          amount: 1,
        },
      ]);
      if (insertErrorA) {
        console.error(`Error inserting new item:`, insertErrorA.message);
        return false;
      }
    }

    const { error: insertErrorB } = await supabase.from('clan_donation_history').insert([
      {
        clan_number: clanNumber,
        season: currentSeason,
        user_id: userId,
        material_id: itemId,
        amount: 1,
      },
    ]);
    if (insertErrorB) {
      console.error(`Error inserting new item:`, insertErrorB.message);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`Unexpected error in makeDonation:`, error);
    return false;
  }
};

export {
  handleDonationListCommand,
  handleDonationListInteraction,
  handleDonateButtonClick,
};
