import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';
import supabase from '../supabaseClient';
import { createBaseEmbed } from './embedManager';
import { getUserItem, updateUserItem, insertUserItem } from '../providers/materialProvider';

const lettersArray = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];

interface CraftItem {
  id: number;
  name: string;
  emoji: string;
  letter: string;
  amount: number;
  materials: Array<{
    id: number;
    material_id: number;
    amount: number;
    materials: { name: string; emoji: string };
  }>;
}

interface CraftCommandArgs {
  clanNumber?: number;
  title?: string;
  description?: string;
  items: CraftItem[];
}

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

const handleCraftCommand = async (message: any, args: CraftCommandArgs): Promise<void> => {
  try {
    const userId = message.author.id;
    const clanNumber = Number(args.clanNumber) || 0;
    const autoClose = 5;
    const autoCloseTimer = (autoClose * 60) * 1000;
    const expirationTimestamp = `<t:${Math.floor((Date.now() + autoClose * 60 * 1000) / 1000)}:R>`;

    const baseEmbed = createBaseEmbed({
      color: '#0099ff',
      title: args.title,
      description: args.description,
    });

    args.items.forEach((item, index) => {
      if (item.materials.length !== 0) {
        const itemLetter = lettersArray[index];
        const materialRowArray = item.materials.map(row =>
          `${(row.materials.emoji.indexOf('?') > -1) ? '⚪️' : row.materials.emoji} ${row.materials.name} x ${row.amount}`
        );
        const mainrow = {
          name: `:regional_indicator_${itemLetter.toLowerCase()}: — ${item.emoji.indexOf('?') > -1 ? '⚪️' : item.emoji} ${item.name}`,
          value: `Required: ${materialRowArray.join(', ')}`,
          inline: false,
        };
        baseEmbed.addFields(mainrow);
      }
    });

    baseEmbed.addFields({
      name: ' ',
      value: `Expire in ${autoClose} minute ${expirationTimestamp}\n\n`,
      inline: false,
    });

    let rows: ActionRowBuilder<ButtonBuilder>[] = [];
    let currentRow = new ActionRowBuilder<ButtonBuilder>();
    let buttonPrefix = 'craft_';
    if (clanNumber && clanNumber > 0) buttonPrefix = 'craftclan_';

    args.items.forEach((item, index) => {
      if (item.materials.length !== 0) {
        const itemLetter = lettersArray[index];
        const button = new ButtonBuilder()
          .setCustomId(`${buttonPrefix}${itemLetter}@${Math.floor(100000 + Math.random() * 900000)}_${userId}`)
          .setLabel(itemLetter)
          .setStyle(ButtonStyle.Primary);

        currentRow.addComponents(button);

        if (currentRow.components.length === 5 || index === args.items.length - 1) {
          rows.push(currentRow);
          if (index < args.items.length - 1) {
            currentRow = new ActionRowBuilder<ButtonBuilder>();
          }
        }
      }
    });

    const reply = await message.reply({
      embeds: [baseEmbed],
      components: rows,
    });

    const instanceTimeout = setTimeout(async () => {
      clearTimeout(instanceTimeout);
      try {
        await reply.delete();
      } catch (errorDel) {
        console.error('Error deleting message:', errorDel);
      }
    }, autoCloseTimer);
  } catch (error) {
    console.error('Error sending shop embed with buttons:', error);
    message.reply('Could not display the shop at this time.');
  }
};

const handleCraftButtonClick = async (interaction: any, args: CraftCommandArgs): Promise<void> => {
  if (!interaction.isButton()) return;

  const userId = interaction.user.id;
  const username = interaction.user.username;
  let buttonPrefix = 'craft_';
  const clanNumber = Number(args.clanNumber) || 0;
  if (clanNumber && clanNumber > 0) buttonPrefix = 'craftclan_';

  if (interaction.customId.startsWith(buttonPrefix)) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const itemToBuyNameA = interaction.customId.replace(buttonPrefix, '').replace(/_/g, '');
    const itemToBuyName = itemToBuyNameA.split('@')[0];
    const itemToCraft = args.items.find(item => item.letter === itemToBuyName);

    if (!itemToCraft) {
      await interaction.editReply('Error: Could not identify the item you wish to craft.');
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

    await Promise.all(reqMaterialArray.map(async ({ material_id, amount, materials }) => {
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
      await Promise.all(resultPrepareItem.map(async ({ amount_new, userItemMatch }) => {
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
          await interaction.editReply(`Success: You crafted **${itemToCraft.name}**`);
        } else {
          await interaction.editReply(`Fail: You crafted **${itemToCraft.name}** but failed to insert new item. (ER-2)`);
        }
      } else {
        await interaction.editReply(`Fail: You crafted **${itemToCraft.name}** but failed to to deduct material. (ER-1)`);
      }
    } else {
      const invalidMaterials = resultPrepareItem.filter(item => !item.valid);
      const missingMaterials = invalidMaterials.map(item => `> ${item.name} (**${item.amount_owned}**/${item.amount})`).join('\n');
      await interaction.editReply(`You don't have enough material to craft **${itemToCraft.name}**.\nMissing: \n${missingMaterials}\nComeback again when you have the required materials!`);
    }
  }
};

const getChannelIdForClanCraft = async (clanNumber: number): Promise<any> => {
  try {
    if (!supabase) {
      console.error('Supabase client not available in getChannelIdForClanCraft');
      return false;
    }
    const { data: channelsData, error } = await supabase.from('craft_clan')
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

export {
  handleCraftCommand,
  handleCraftButtonClick,
  clanCraftChannels,
};
