import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ComponentType,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  Collector,
} from 'discord.js';
import { createBaseEmbed } from './embedManager';
import { getUserItem, updateUserItem, insertUserItem } from '../providers/materialProvider';

interface ShopItem {
  materials: { id: number; name: string; emoji: string };
  material_use_id: number;
  amount: number;
  price: number;
  currency: string;
}

interface ShopArgs {
  title?: string;
  description?: string;
  thumbnail?: string | null;
  footer?: string;
  items: ShopItem[];
  instance: Map<string, any>;
  instanceTimeout: Map<string, any>;
}

const buildRowComponents = async (message: any, args: ShopArgs, refreshItem?: boolean): Promise<ActionRowBuilder[]> => {
  const itemsInSelectMenu: StringSelectMenuOptionBuilder[] = [];
  args.items.forEach((item: ShopItem, index: number) => {
    const amountSuffix = (item.amount > 1) ? `(x${item.amount.toLocaleString()})` : '';
    const itemValue = `${item.materials.id}-${item.amount}-${(item.materials.emoji.indexOf('?') > -1) ? '⚪️' : item.materials.emoji}-${item.materials.name}/${item.material_use_id}-${item.price}-${item.currency}`;
    const itemDesc = `${item.price.toLocaleString()} ${item.currency}`;
    itemsInSelectMenu[index] = new StringSelectMenuOptionBuilder()
      .setLabel(`${item.materials.name} ${amountSuffix}`)
      .setDescription(itemDesc)
      .setValue(itemValue);
  });

  const rows: ActionRowBuilder[] = [];
  const maxChunkSize = 24;
  for (let i = 0; i < itemsInSelectMenu.length; i += maxChunkSize) {
    const chunk = itemsInSelectMenu.slice(i, i + maxChunkSize);
    const placeholderCount = (itemsInSelectMenu.length <= maxChunkSize) ? '' : `(Items ${i + 1}-${Math.min(i + maxChunkSize, itemsInSelectMenu.length)})`;
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`shop_base_${Math.floor(1000 + Math.random() * 9000)}`)
      .setPlaceholder(`Select an item to buy ${placeholderCount}`)
      .addOptions(chunk)
      .setMinValues(1)
      .setMaxValues(1);
    rows.push(new ActionRowBuilder().addComponents(selectMenu));
  }

  return rows;
};

const handleShopCommand = async (message: any, args: ShopArgs): Promise<ShopArgs | undefined> => {
  try {
    const userId = message.author.id;

    const autoClose = 2;
    const autoCloseTimer = (autoClose * 60) * 1000;
    const expirationTimestamp = `<t:${Math.floor((Date.now() + autoClose * 60 * 1000) / 1000)}:R>`;

    if (!(args.instance instanceof Map)) {
      args.instance = new Map();
    }
    if (!(args.instanceTimeout instanceof Map)) {
      args.instanceTimeout = new Map();
    }

    if (args.instance.has(userId)) {
      const oldMessage = args.instance.get(userId);
      try {
        await oldMessage.delete();
      } catch (e) { /* ignore */ }
      args.instance.delete(userId);
    }
    if (args.instanceTimeout.has(userId)) {
      clearTimeout(args.instanceTimeout.get(userId));
      args.instanceTimeout.delete(userId);
    }

    const embedObj = {
            color: 0x0099ff,
      title: args.title,
      description: `${args.description}\n\nYou can retry if purchase failed.\nExpire in ${autoClose} minute. ${expirationTimestamp}\n*please make purchase 30 seconds before closing*`,
            thumbnail: args.thumbnail || undefined,
            footer: { text: args.footer || '' },
    };
    const baseEmbed = createBaseEmbed(embedObj);

    const rows = await buildRowComponents(message, args, true);

    const reply = await message.reply({
      embeds: [baseEmbed],
      components: rows,
    });

    const instanceTimeout = setTimeout(async () => {
      try {
        if (instanceTimeout) clearTimeout(instanceTimeout);
        await reply.delete();
      } catch (errorDel) {
        console.error('Error deleting message:', errorDel);
      }
    }, autoCloseTimer);

    try {
      args.instance.set(userId, reply);
      args.instanceTimeout.set(userId, instanceTimeout);
    } catch (errorSet) {
      console.error('Error setting instance:', errorSet);
    }

    return args;
  } catch (error) {
    console.error('Error sending shop embed with buttons:', error);
    message.reply('Could not display the shop at this time.');
  }
};

const handleShopSelectMenuClick = async (interaction: any, args: ShopArgs): Promise<boolean | undefined> => {
  if (!interaction.isStringSelectMenu() || !interaction.customId.startsWith('shop_base') || !interaction.values.length) {
    console.error('Validate interaction type');
    return;
  }

  try {
    const userId = interaction.user.id;

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    } else if (interaction.replied && !interaction.ephemeral) {
      await interaction.deferUpdate().catch(console.error);
    } else if (interaction.deferred && !interaction.ephemeral) {
      await interaction.deferUpdate().catch(console.error);
    }

    const itemDetails = parseSelectedItem(interaction.values[0]);
    if (itemDetails == null) {
      await handlePurchaseError(interaction, new Error('Failed to parse item'));
      return false;
    }

    await processPurchase(interaction, itemDetails);

    const shopMessage = args.instance.get(userId);
    if (shopMessage) {
      try {
        await shopMessage.delete();
      } catch (errorDel: any) {
        if (errorDel.code !== 10008) console.error('Error deleting main shop message after purchase:', errorDel);
      }
      args.instance.delete(userId);
    }
    if (args.instanceTimeout.has(userId)) {
      clearTimeout(args.instanceTimeout.get(userId));
      args.instanceTimeout.delete(userId);
    }
    return true;
  } catch (error) {
    console.error('Shop purchase error:', error);
    await handlePurchaseError(interaction, error);
    return false;
  }
};

const parseSelectedItem = (selectedValue: string): {
  material_id: string;
  material_amount: number;
  emoji: string;
  name: string;
  material_use_id: string;
  price: number;
  currency: string;
} | null => {
  try {
    const [itemName, itemPrice] = selectedValue.split('/');
    const [material_id, material_amount, emoji, name] = itemName.split('-');
    const [material_use_id, price, currency] = itemPrice.split('-');

    return {
      material_id,
      material_amount: parseInt(material_amount),
      emoji,
      name,
      material_use_id,
      price: parseInt(price),
      currency,
    };
  } catch (error) {
    return null;
  }
};

const processPurchase = async (interaction: any, itemDetails: ReturnType<typeof parseSelectedItem>): Promise<void> => {
  if (!itemDetails) return;
  const userId = interaction.user.id;
  const username = interaction.member.user.username;

  const userCurrency = await getUserItem({
    userId: userId,
    itemId: parseInt(itemDetails.material_use_id),
    amount: 1,
  });

  if (!userCurrency?.length) {
    await interaction.followUp(`You don't have any **${itemDetails.price.toLocaleString()} ${itemDetails.currency}**!`);
    return;
  }

  const currentBalance = userCurrency[0].amount;
  if (currentBalance < itemDetails.price) {
    await interaction.followUp(`You don't have enough **${itemDetails.price.toLocaleString()} ${itemDetails.currency}**!, You have **${currentBalance.toLocaleString()} ${itemDetails.currency}**`);
    return;
  }

  const success = await deductCurrency(userId, username, userCurrency[0], itemDetails);
  if (!success) {
    await interaction.followUp(`Something went wrong while deducting your currency. Please try again later.`);
    return;
  }

  const updateItemResult = await addItemToInventory(userId, username, itemDetails, userCurrency[0]);
  if (!updateItemResult) {
    await interaction.followUp(`Something went wrong while adding the item to your inventory. Please try again later.`);
    return;
  }

  const successMessage = `Buying **${itemDetails.emoji} ${itemDetails.name}** x ${itemDetails.material_amount.toLocaleString()} (${itemDetails.price.toLocaleString()} ${itemDetails.currency}), Please wait...`;
  await interaction.followUp(successMessage);
  await interaction.channel.send(
    `<@${userId}> bought **${itemDetails.emoji} ${itemDetails.name}** x ${itemDetails.material_amount.toLocaleString()} (${itemDetails.price.toLocaleString()} ${itemDetails.currency})`
  );
};

const deductCurrency = async (userId: string, username: string, userCurrency: any, itemDetails: NonNullable<ReturnType<typeof parseSelectedItem>>): Promise<boolean> => {
  try {
    const newAmount = userCurrency.amount - itemDetails.price;
    return await updateUserItem(
      { id: userId, username: username },
      {
        id: userCurrency.id,
        material: userCurrency.material as any,
        amount: userCurrency.amount,
      },
      newAmount
    );
  } catch (error) {
    console.error('deductCurrency: error', error);
    return false;
  }
};

const addItemToInventory = async (userId: string, username: string, itemDetails: NonNullable<ReturnType<typeof parseSelectedItem>>, userCurrency: any): Promise<boolean> => {
  try {
    const userObj = { id: userId, username: username };
    const existingItem = await getUserItem({
      userId: userId,
      itemId: parseInt(itemDetails.material_id),
    });

    if (existingItem?.length) {
      const success = await updateUserItem(
        userObj,
        {
          id: existingItem[0].id,
          material: existingItem[0].material as any,
          amount: existingItem[0].amount,
        },
        existingItem[0].amount + itemDetails.material_amount
      );
      if (!success) return false;
      return true;
    } else {
      const success = await insertUserItem(
        userObj,
        {
        id: parseInt(itemDetails.material_id),
        name: itemDetails.name,
        },
        itemDetails.material_amount
      );
      if (!success) return false;
      return true;
    }
  } catch (error) {
    console.error('addItemToInventory: error', error);
    return false;
  }
};

const handlePurchaseError = async (interaction: any, error: any): Promise<void> => {
  try {
    interaction.channel.send('Your purchase failed. Please try again later.');
  } catch (error) {
    console.error('handlePurchaseError: error', error);
  }
};

export {
  handleShopCommand,
  handleShopSelectMenuClick,
};
