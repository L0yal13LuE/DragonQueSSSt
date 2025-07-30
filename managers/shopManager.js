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
        const itemValue = `${item.materials.id}-${item.amount}-${(item.materials.emoji.indexOf('?') > -1) ? '⚪️' : item.materials.emoji}-${item.materials.name}/${item.material_use_id}-${item.price}-${item.currency}`;
        //const itemDesc = `${item.price.toLocaleString()} ${item.currency} (Owned: ${item.owned.toLocaleString()})`;
        const itemDesc = `${item.price.toLocaleString()} ${item.currency}`;
        itemsInSelectMenu[index] = new StringSelectMenuOptionBuilder()
            .setLabel(`${item.materials.name} ${amountSuffix}`)
            .setDescription(itemDesc)
            .setValue(itemValue);
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

        // Ensure args.instance and args.instanceTimeout are Maps
        if (!(args.instance instanceof Map)) {
            args.instance = new Map(); // Stores Message objects, keyed by userId
        }
        if (!(args.instanceTimeout instanceof Map)) {
            args.instanceTimeout = new Map(); // Stores Timeout IDs, keyed by userId
        }

        // Clear any existing shop for this user before creating a new one
        if (args.instance.has(userId)) {
            const oldMessage = args.instance.get(userId);
            try {
                await oldMessage.delete();
            } catch (e) { /* ignore if already deleted */ }
            args.instance.delete(userId);
        }
        if (args.instanceTimeout.has(userId)) {
            clearTimeout(args.instanceTimeout.get(userId));
            args.instanceTimeout.delete(userId);
        }

        // --- 1. Create Embed text ---
        const embedObj = {
            color: '#0099ff',
            title: args.title,
            description: `${args.description}\n\nYou can retry if purchase failed.\nExpire in ${autoClose} minute. ${expirationTimestamp}\n*please make purchase 30 seconds before closing*`,
            thumbnail: args.thumbnail || null,
            footer: { 'text': args.footer },
        };
        const baseEmbed = createBaseEmbed(embedObj);

        // --- 2. Create Embed with Items ---
        // --- 3. Add items as fields to the embed using the new parameters
        const rows = await buildRowComponents(message, args, true);

        // --- 4. Send the embed with the select menus ---
        const reply = await message.reply({
            embeds: [baseEmbed],
            components: rows,
        });


        // --- 5. Delete the message after 1 minute ---
        const instanceTimeout = setTimeout(async () => {
            try {
                if (instanceTimeout) clearTimeout(instanceTimeout);
                await reply.delete();
                // await message.reply('*Shop session closed.*');
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

}

const handleShopSelectMenuClick = async (interaction, args) => {

    // Validate interaction type
    if (!interaction.isStringSelectMenu() || !interaction.customId.startsWith('shop_base') || !interaction.values.length) {
        console.error('Validate interaction type')
        return;
    }

    try {

        const userId = interaction.user.id;

        // Defer reply ephemerally
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        } else if (interaction.replied && !interaction.ephemeral) {
            // If it was replied but not ephemerally (should not happen with collector setup)
            // We can't change it to ephemeral here. This is a tricky state.
            // For now, assume deferReply or an ephemeral update.
            await interaction.deferUpdate().catch(console.error); // Acknowledge
        } else if (interaction.deferred && !interaction.ephemeral) {
            // Already deferred but not ephemerally, update to acknowledge
            await interaction.deferUpdate().catch(console.error);
        }

        // Parse selected item details
        const itemDetails = parseSelectedItem(interaction.values[0]);
        if (itemDetails == null) {
            await handlePurchaseError(interaction, error);
            return false;
        }

        // Process purchase
        await processPurchase(interaction, itemDetails);

        // Delete embedpost after purchase
        const shopMessage = args.instance.get(userId);
        if (shopMessage) {
            try {
                await shopMessage.delete();
            } catch (errorDel) {
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
        itemId: itemDetails.material_use_id,
        amount: 1
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

    // Process currency deduction
    const success = await deductCurrency(userId, username, userCurrency[0], itemDetails);
    if (!success) {
        await interaction.followUp(`Something went wrong while deducting your currency. Please try again later.`);
        return;
    }

    // Process item addition
    const updateItemResult = await addItemToInventory(userId, username, itemDetails, userCurrency[0]);
    if (!updateItemResult) {
        await interaction.followUp(`Something went wrong while adding the item to your inventory. Please try again later.`);
        return;
    }

    // Send success messages
    const successMessage = `Buying **${itemDetails.emoji} ${itemDetails.name}** x ${itemDetails.material_amount.toLocaleString()} (${itemDetails.price.toLocaleString()} ${itemDetails.currency}), Please wait...`;
    await interaction.followUp(successMessage);
    await interaction.channel.send(
        `<@${userId}> bought **${itemDetails.emoji} ${itemDetails.name}** x ${itemDetails.material_amount.toLocaleString()} (${itemDetails.price.toLocaleString()} ${itemDetails.currency})`
    );
    return;
};

const deductCurrency = async (userId, username, userCurrency, itemDetails) => {
    try {
        const newAmount = userCurrency.amount - itemDetails.price;
        return await updateUserItem(
            { id: userId, username: username },
            {
                id: userCurrency.id,
                material: userCurrency.material,
                amount: userCurrency.amount
            },
            newAmount
        );
    } catch (error) {
        console.error('deductCurrency: error', error);
        return false;
    }

};

const addItemToInventory = async (userId, username, itemDetails, userCurrency) => {
    try {
        const userObj = { id: userId, username: username };
        const existingItem = await getUserItem({
            userId: userId,
            itemId: itemDetails.material_id
        });

        if (existingItem?.length) {
            const success = await updateUserItem(
                userObj,
                {
                    id: existingItem[0].id,
                    material: existingItem[0].material,
                    amount: existingItem[0].amount
                },
                existingItem[0].amount + itemDetails.material_amount
            );
            if (!success) return false;
            return true;
        } else {
            const success = await insertUserItem(
                userObj,
                {
                    id: itemDetails.material_id,
                    name: itemDetails.name
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

const handlePurchaseError = async (interaction, error) => {
    try {
        interaction.channel.send('Your purchase failed. Please try again later.');
    } catch (error) {
        console.error('handlePurchaseError: error', error);
    }
};

// --- Command Export ---
module.exports = {
    handleShopCommand,
    handleShopSelectMenuClick
};