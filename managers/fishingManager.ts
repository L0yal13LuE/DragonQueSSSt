import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import supabase from '../supabaseClient';
import { createBaseEmbed } from './embedManager';
import { getUserItem, updateUserItem, insertUserItem } from '../providers/materialProvider';

const fishingUserInstance = new Map<string, any>();

const handleFishingCommand = async (message: any): Promise<void> => {
  try {
    const userId = message.author.id;

    const autoClose = 1;
    const autoCloseTimer = (autoClose * 60) * 1000;
    const expirationTimestamp = `<t:${Math.floor((Date.now() + autoClose * 60 * 1000) / 1000)}:R>`;

    const baseEmbed = createBaseEmbed({
      color: 0x32cd32,
      title: '🐟 Fishing 🐟',
      description: 'You are fishing in the ocean, and you catch some items!\nstarting form **Common** to **Super Rare**\nChoice is up to you!\n\n',
    });

    baseEmbed.addFields(
      {
        name: ':regional_indicator_a: — 🎣 Common Fishing Rod (10 Como)',
        value: 'Items: Common, Uncommon',
        inline: false,
      },
      {
        name: ':regional_indicator_b: — 🎣 Rare Fishing Rod (25 Como)',
        value: 'Items: Uncommon, Rare',
        inline: false,
      },
      {
        name: ':regional_indicator_c: — 🎣 Rare Fishing Rod (50 Como)',
        value: 'Items: Uncommon, Rare, Super Rare',
        inline: false,
      }
    );

    baseEmbed.addFields({
      name: ' ',
      value: `Expire in ${autoClose} minute ${expirationTimestamp}\n\n`,
      inline: false,
    });

    const rows: ActionRowBuilder[] = [];
    const currentRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`fishing_a@${Math.floor(100000 + Math.random() * 900000)}_${userId}`)
        .setLabel('A — 10 Como')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`fishing_b@${Math.floor(100000 + Math.random() * 900000)}_${userId}`)
        .setLabel('B — 25 Como')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`fishing_c@${Math.floor(100000 + Math.random() * 900000)}_${userId}`)
        .setLabel('C — 50 Como')
        .setStyle(ButtonStyle.Primary)
    );
    rows.push(currentRow);

    const reply = await message.reply({
      embeds: [baseEmbed],
      components: rows,
    });

    const timer = setTimeout(async () => {
      try {
        if (fishingUserInstance.has(userId)) {
          const { replyInstance, timerInstance } = fishingUserInstance.get(userId);
          if (replyInstance) await replyInstance.delete();
          if (timerInstance) clearTimeout(timerInstance);
          fishingUserInstance.delete(userId);
        }
      } catch (errorDel) {
        console.error('Error deleting message:', errorDel);
      }
      await message.reply('*Fishing closed.*');
    }, autoCloseTimer);
    fishingUserInstance.set(userId, { replyInstance: reply, timerInstance: timer });
  } catch (error) {
    console.error('Error Fishing embed with buttons:', error);
    message.reply('Could not display Fishing at this time.');
  }
};

const handleCraftButtonClick = async (interaction: any, args: any): Promise<void> => {
  if (!interaction.isButton()) return;

  const userId = interaction.user.id;
  const username = interaction.user.username;

  if (interaction.customId.startsWith('craft_')) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const itemToBuyNameA = interaction.customId.replace('craft_', '').replace(/_/g, '');
    const itemToBuyName = itemToBuyNameA.split('@')[0];
    const itemToCraft = args.items.find((item: any) => item.letter === itemToBuyName);

    if (!itemToCraft) {
      await interaction.editReply('Error: Could not identify the item you wish to craft.');
      return;
    }

    const reqMaterialID = itemToCraft.id;
    const reqMaterialName = itemToCraft.name;
    const reqMaterialArray = itemToCraft.materials;

    const resultPrepareItem: any[] = [];

    const createMaterialItem = (materialId: number, materialName: string, materialAmount: number, userItemMatch: any = null): any => {
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

    await Promise.all(reqMaterialArray.map(async ({ material_id, amount, materials }: { material_id: number; amount: number; materials: { name: string; emoji: string } }) => {
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
    const isValid = resultPrepareItem.every((item: any) => item.valid);
    if (isValid) {
      let allUpdated = true;
      const allUpdateResult: boolean[] = [];
      await Promise.all(resultPrepareItem.map(async ({ amount_new, userItemMatch }: { amount_new: number; userItemMatch: any }) => {
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
          craftSuccess = await updateUserItem(
            userUpdObj,
            existingCraftedItem[0] as any,
            existingCraftedItem[0].amount + 1
          );
        } else {
          const userInsObj = { id: reqMaterialID, name: reqMaterialName };
          craftSuccess = await insertUserItem(userUpdObj, userInsObj, 1);
        }

        if (craftSuccess) {
          await interaction.editReply(`Success: You crafted **${itemToCraft.emoji} ${itemToCraft.name}**`);
          interaction.channel.send(`<@${userId.toString()}> crafted: ${itemToCraft.emoji} ${itemToCraft.name}`);
        } else {
          await interaction.editReply(`Fail: You crafted **${itemToCraft.emoji} ${itemToCraft.name}** but failed to insert new item. (ER-2)`);
        }
      } else {
        await interaction.editReply(`Fail: You crafted **${itemToCraft.emoji} ${itemToCraft.name}** but failed to to deduct material. (ER-1)`);
      }
    } else {
      await interaction.editReply(`Fail: You don't have enough material to craft **${itemToCraft.emoji} ${itemToCraft.name}**.`);
    }
  }
};

const clanCraftChannels = async (clanNumber: number): Promise<any> => {
  try {
    const channelData = await getChannelIdForClanCraft(clanNumber);
    if (!channelData) return null;
    return channelData;
  } catch (error) {
    console.error(`Unexpected error fetching crafts for ${clanNumber}:`, error);
    return null;
  }
};

const getChannelIdForClanCraft = async (clanNumber: number): Promise<any> => {
  try {
    const { data: channelsData, error } = await supabase!
      .from('craft_clan')
      .select('*')
      .eq('number', clanNumber)
      .eq('is_active', true);

    if (error) {
      console.error(`Error fetching channel for clan ${clanNumber}:`, error.message);
      return false;
    }

    return channelsData;
  } catch (error) {
    console.error(`Unexpected error fetching channel for ${clanNumber}:`, error);
    return false;
  }
};

export {
  handleFishingCommand,
};
