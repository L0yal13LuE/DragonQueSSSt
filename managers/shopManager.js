// managers/shopManager.js

// --- Required Libraries ---
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ComponentType, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, Collector } = require('discord.js');
const { createBaseEmbed } = require("./embedManager");
const wait = require('node:timers/promises').setTimeout;
const { getUserItem, updateUserItem, insertUserItem } = require("./../providers/materialProvider");


const buildRowComponents = async (message, args, refreshItem) => {

    if (refreshItem) {
        // const userItems = await getUserItem({
        //     userId: message.author.id
        // });

        // // map user item that match sell item
        // args.items = args.items.map((item) => {
        //     const found = (userItems && userItems.length > 0) ? userItems.find(userItem => userItem.material.id === item.material_id) : null;
        //     return {
        //         ...item,
        //         owned: found ? found.amount : 0
        //     }
        // });
    }


    // console.log("Sell Item", args.items);

    const itemsInSelectMenu = [];
    args.items.forEach((item, index) => {
        const amountSuffix = (item.amount > 1) ? `(x${item.amount.toLocaleString()})` : '';
        const itemValue = `${item.materials.id}-${item.amount}-${item.materials.emoji}-${item.materials.name}/${item.material_use_id}-${item.price}-${item.currency}`;
        //const itemDesc = `${item.price.toLocaleString()} ${item.currency} (Owned: ${item.owned.toLocaleString()})`;
        const itemDesc = `${item.price.toLocaleString()} ${item.currency}`;
        itemsInSelectMenu[index] = new StringSelectMenuOptionBuilder()
            .setLabel(`${item.materials.name} ${amountSuffix}`)
            .setDescription(itemDesc)
            .setValue(itemValue)
            .setEmoji(item.materials.emoji);
    });

    // const clearAmouunt = new StringSelectMenuOptionBuilder()
    //     .setLabel(`Clear`)
    //     .setDescription('Select to clear your choice')
    //     .setValue('clear')
    //     .setEmoji('❌');

    const rows = [], maxChunkSize = 24;
    for (let i = 0; i < itemsInSelectMenu.length; i += maxChunkSize) {
        const chunk = itemsInSelectMenu.slice(i, i + maxChunkSize); //.concat([clearAmouunt]);
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
}

const handleShopCommand = async (message, args) => {
    try {

        const userId = message.author.id;

        const autoClose = 2;
        const autoCloseTimer = (autoClose * 60) * 1000;
        const expirationTimestamp = `<t:${Math.floor((Date.now() + autoClose * 60 * 1000) / 1000)}:R>`;

        // --- 1. Create Embed text ---
        const baseEmbed = createBaseEmbed({
            color: '#0099ff',
            title: args.title,
            description: `${args.description}\nYou can retry if purchase failed.\nExpire in ${autoClose} minute. ${expirationTimestamp}\nplease make purchase 30 seconds before closing`,
            thumbnail: args.thumbnail,
            footer: { 'text': args.footer },
        });

        // --- 2. Create Embed with Items ---
        // --- 3. Add items as fields to the embed using the new parameters
        const rows = await buildRowComponents(message, args, true);

        // --- 4. Send the embed with the select menus ---
        let reply = await message.reply({
            embeds: [baseEmbed],
            components: rows,
        });

        // --- 5. Delete the message after 1 minute ---
        let instanceTimeout = setTimeout(async () => {
            try {
                if (instanceTimeout) clearTimeout(instanceTimeout);
                await reply.delete();
                await message.reply('**Shop session closed.** Thanks for shopping! Use `!shop` to open again.');
            } catch (errorDel) {
                console.error('Error deleting message:', errorDel);
            }
        }, autoCloseTimer);
        args.instance[userId] = reply
        args.instanceTimeout[userId] = instanceTimeout;
        return args;
    } catch (error) {
        console.error('Error sending shop embed with buttons:', error);
        message.reply('Could not display the shop at this time.');
    }

}

const handleShopSelectMenuClick = async (interaction, args) => {

    // Validate interaction type
    if (!interaction.isStringSelectMenu() || !interaction.customId.startsWith('shop_base') || !interaction.values.length) {
        console.error('Validate interaction type')
        return;
    }

    try {

        const userId = interaction.user.id;

        if (interaction.deferred || interaction.replied) {
            await interaction.deferUpdate({ flags: MessageFlags.Ephemeral });
        } else {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        }

        // Parse selected item details
        const itemDetails = parseSelectedItem(interaction.values[0]);

        // Process purchase
        await processPurchase(interaction, itemDetails);

        // for testing done
        // await interaction.channel.send('Purchase successful!');

        try {
            if (args.instance && args.instance[userId]) {
                await args.instance[userId].delete();
                args.instance[userId] = null;
            } else {
                console.log('args.instance : not found', args);
            }
            if (args.instanceTimeout && args.instanceTimeout[userId]) {
                clearTimeout(args.instanceTimeout[userId]);
                args.instanceTimeout[userId] = null;
            } else {
                console.log('args.instanceTimeout : not found', args);
            }
        } catch (errorDel) {
            console.error('Error deleting message:', errorDel);
        }
        return true
    } catch (error) {
        console.error('Shop purchase error:', error);
        await handlePurchaseError(interaction, error);
        return false;
    }
};

// Helper Functions

const parseSelectedItem = (selectedValue) => {
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
            currency
        };
    } catch (error) {
        return null;
    }
};

const processPurchase = async (interaction, itemDetails) => {
    const userId = interaction.user.id;
    const username = interaction.member.user.username;

    // Check user's currency balance
    const userCurrency = await getUserItem({
        userId: userId,
        itemId: itemDetails.material_use_id
    });

    if (!userCurrency?.length) {
        await interaction.editReply(`You don't have any **${itemDetails.price.toLocaleString()} ${itemDetails.currency}**!`);
        // await interaction.followUp(`You don't have **${itemDetails.price.toLocaleString()} ${itemDetails.currency}**!`);
        return;
    }

    const currentBalance = userCurrency[0].amount;
    if (currentBalance < itemDetails.price) {
        await interaction.editReply(`You don't have enough **${itemDetails.price.toLocaleString()} ${itemDetails.currency}**!, You have **${currentBalance.toLocaleString()} ${itemDetails.currency}**`);
        // await interaction.followUp(`You don't have enough **${itemDetails.price.toLocaleString()} ${itemDetails.currency}**!, You have **${currentBalance.toLocaleString()} ${itemDetails.currency}**`);
        return;
    }

    // Process currency deduction
    const success = await deductCurrency(userId, userCurrency[0], itemDetails);
    if (!success) {
        await interaction.editReply(`Something went wrong while deducting your currency. Please try again later.`);
        // await interaction.followUp(`Something went wrong while deducting your currency. Please try again later.`);
        return;
    }

    // Process item addition
    const updateItemResult = await addItemToInventory(userId, username, itemDetails);
    if (!updateItemResult) {
        await interaction.editReply(`Something went wrong while adding the item to your inventory. Please try again later.`);
        // await interaction.followUp(`Something went wrong while adding the item to your inventory. Please try again later.`);
        return;
    }

    // Send success messages
    const successMessage = `Buying **${itemDetails.emoji} ${itemDetails.name}** x ${itemDetails.material_amount.toLocaleString()} (${itemDetails.price.toLocaleString()} ${itemDetails.currency}), Please wait...`;
    await interaction.editReply(successMessage);
    // await interaction.followUp(successMessage);
    await interaction.channel.send(
        `<@${userId}> bought **${itemDetails.emoji} ${itemDetails.name}** x ${itemDetails.material_amount.toLocaleString()} (${itemDetails.price.toLocaleString()} ${itemDetails.currency})`
    );
    return;
};

const deductCurrency = async (userId, userCurrency, itemDetails) => {
    const newAmount = userCurrency.amount - itemDetails.price;
    return await updateUserItem(
        { id: userId },
        {
            id: userCurrency.id,
            material: userCurrency.material
        },
        userCurrency.amount,
        newAmount
    );
};

const addItemToInventory = async (userId, username, itemDetails) => {
    const existingItem = await getUserItem({
        userId: userId,
        itemId: itemDetails.material_id
    });

    if (existingItem?.length) {
        const success = await updateUserItem(
            { id: userId },
            {
                id: existingItem[0].id,
                material: existingItem[0].material
            },
            existingItem[0].amount,
            existingItem[0].amount + itemDetails.material_amount
        );
        if (!success) return false;
        return true;
    } else {
        const success = await insertUserItem(
            { id: userId, username: username },
            { id: itemDetails.material_id, name: itemDetails.name },
            itemDetails.material_amount
        );
        if (!success) return false;
        return true;
    }
};

const handlePurchaseError = async (interaction, error) => {
    let errorMessage = 'An unexpected error occurred. Please try again later.';
    if (interaction.deferred) {
        await interaction.editReply(errorMessage);
    } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
    }
};

// --- Command Export ---
module.exports = {
    handleShopCommand,
    handleShopSelectMenuClick
};