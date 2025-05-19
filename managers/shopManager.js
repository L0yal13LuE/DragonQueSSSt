// managers/shopManager.js

// --- Required Libraries ---
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ComponentType, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, Collector } = require('discord.js');
const { createBaseEmbed } = require("./embedManager");
const wait = require('node:timers/promises').setTimeout;
const { getUserItem, updateUserItem, insertUserItem } = require("./../providers/materialProvider");

const handleShopCommand = async (message, args) => {
    try {

        // --- 1. Create Embed text ---
        const baseEmbed = createBaseEmbed({
            color: '#0099ff',
            title: args.title,
            description: args.description,
            thumbnail: args.thumbnail,
            footer: { 'text': args.footer },
        })

        // --- 2. Create Select Menu for each item ---
        const itemsInSelectMenu = [];
        args.items.forEach((item, index) => {
            const amountSuffix = (item.amount > 1) ? `(x${item.amount.toLocaleString()})` : '';
            const itemValue = `${item.materials.id}-${item.amount}-${item.materials.emoji}-${item.materials.name}/${item.material_use_id}-${item.price}-${item.currency}`;
            itemsInSelectMenu[index] = new StringSelectMenuOptionBuilder()
                .setLabel(`${item.materials.name} ${amountSuffix}`)
                .setDescription(`${item.price.toLocaleString()} ${item.currency}`)
                .setValue(itemValue)
                .setEmoji(item.materials.emoji);
        });

        // --- 3. Create multiple select menus for chunks of 25 items
        const rows = [];
        for (let i = 0; i < itemsInSelectMenu.length; i += 25) {
            const chunk = itemsInSelectMenu.slice(i, i + 25);
            const placeholderCount = (itemsInSelectMenu.length <= 25) ? '' : `(Items ${i + 1}-${Math.min(i + 25, itemsInSelectMenu.length)})`;
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`shop_base_${Math.floor(1000 + Math.random() * 9000)}`)
                .setPlaceholder(`Select an item to buy ${placeholderCount}`)
                .addOptions(chunk)
                .setMinValues(1)
                .setMaxValues(1);
            rows.push(new ActionRowBuilder().addComponents(selectMenu));
        }

        // --- 4. Send the embed with the select menus ---
        const reply = await message.reply({
            embeds: [baseEmbed],
            components: rows,
        });
        // --- 5. Set up a collector for the select menus ---
        const collector = reply.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 60000
        });
        // --- 6. Handle select menu interactions ---
        collector.on('collect', async interaction => {
            console.log("interaction.values: ", interaction.values);
            args.message = message;
            await handleShopSelectMenuClick(interaction, args);
        });
    } catch (error) {
        console.error('Error sending shop embed with buttons:', error);
        message.channel.send('Could not display the shop at this time.');
    }

}
// Function to handle button interactions for this command
const handleShopButtonClick = async (interaction, args) => {
    // Only process button interactions
    if (!interaction.isButton()) return;

    // Check if the button custom ID starts with 'buy_', indicating a shop purchase attempt
    if (interaction.customId.startsWith('buy_')) {

        // Defer the reply to prevent interaction timeout, reply is only visible to the user
        // await interaction.deferReply({ ephemeral: true });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // console.log("interaction.customId: ", interaction.customId);
        // console.log("interaction.customId.replace('buy_', ''): ", interaction.customId.replace('buy_', ''));

        // // Extract the item name from the custom ID
        // const itemToBuyName = interaction.customId.replace('buy_', '').replace(/_/g, ' ');
        // // Find the item details in your shopItems array
        // const itemToBuy = args.items.find(item => item.name.toLowerCase() === itemToBuyName.toLowerCase());

        const itemToBuyNameA = interaction.customId.replace('buy_', '').replace(/_/g, '');
        const itemToBuyName = itemToBuyNameA.split('@')[0];
        const itemToBuy = args.items.find(item => item.letter === itemToBuyName);

        // If the item wasn't found (shouldn't happen if custom IDs are generated correctly, but good practice to check)
        if (!itemToBuy) {
            await interaction.editReply('Error: Could not identify the item you wish to purchase.');
            return;
        }

        // console.log("itemToBuy: ", itemToBuy);

        // --- Placeholder for your Purchasing Logic ---
        // This is where you would implement the actual buying process:
        // 1. Get the user's ID: interaction.user.id
        // 2. Access your user data (e.g., from a database) to get their current currency.
        // 3. Compare the user's currency with itemToBuy.price.
        // 4. If the user has enough gold:
        //    - Deduct the gold from their balance.
        //    - Add the item to their inventory.
        //    - Send a success message using interaction.editReply().
        // 5. If the user does not have enough gold:
        //    - Send an insufficient funds message using interaction.editReply().
        // --- End of Placeholder ---

        // Example of a placeholder response (replace with your actual purchase outcome)
        const userHasEnoughGold = true; // Assume user has enough gold for this example

        if (userHasEnoughGold) {
            // await interaction.editReply(`Success: **${itemToBuy.emoji} ${itemToBuy.name}** for ${itemToBuy.price} ${itemToBuy.currency}! (Note: Actual purchase logic is not yet implemented)`);
            await interaction.editReply(`This feature coming soon! (buying ${itemToBuy.emoji} ${itemToBuy.name} for ${itemToBuy.price} ${itemToBuy.currency})\nStay tuned! for upcoming features!🤗`);
            // In your real code, you would confirm the successful purchase and update user data.
        } else {
            await interaction.editReply(`Fail: You don't have enough gold to purchase the **${itemToBuy.emoji} ${itemToBuy.name}**. You need ${itemToBuy.price} ${itemToBuy.currency}.`);
            // In your real code, this would be triggered if the user's balance is too low.
        }
    }
}

const handleShopSelectMenuClick = async (interaction, args) => {
    try {
        // Validate user permissions
        if (!validateUserPermissions(interaction)) return;

        // Validate interaction type
        if (!interaction.isStringSelectMenu()) return;
        if (!interaction.customId.startsWith('shop_base') || !interaction.values.length) return;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Parse selected item details
        const itemDetails = parseSelectedItem(interaction.values[0]);

        // Process purchase
        await processPurchase(interaction, itemDetails);
    } catch (error) {
        console.error('Shop purchase error:', error);
        await handlePurchaseError(interaction, error);
    }
};

// Helper Functions

const validateUserPermissions = (interaction) => {

    // Check if interaction is from command author
    if (interaction.user.id !== interaction.member.user.id) {
        interaction.reply({
            content: '⚠️ You can\'t use someone else\'s shop, start your shop by typing `!shop`',
            ephemeral: true
        });
        return false;
    }

    // Check if interaction is within 5 minute time window
    const interactionTime = Date.now();
    const commandTime = interaction.message.createdTimestamp;
    const timeDiff = interactionTime - commandTime;

    // if (timeDiff > 300000) { // 5 minutes in milliseconds
    if (timeDiff > 60000) { // 1 minutes in milliseconds
        interaction.reply({
            content: '⚠️ Shop expired, Please run the command again.',
            ephemeral: true
        });
        return false;
    }

    return true;
};

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
        return;
    }

    const currentBalance = userCurrency[0].amount;
    if (currentBalance < itemDetails.price) {
        await interaction.editReply(`You don't have enough **${itemDetails.price.toLocaleString()} ${itemDetails.currency}**!, You have **${currentBalance.toLocaleString()} ${itemDetails.currency}**`);
        return;
    }

    // Process currency deduction
    const success = await deductCurrency(userId, userCurrency[0], itemDetails);
    if (!success) {
        await interaction.editReply(`Something went wrong while deducting your currency. Please try again later.`);
        return;
    }

    // Process item addition
    const updateItemResult = await addItemToInventory(userId, username, itemDetails);
    if (!updateItemResult) {
        await interaction.editReply(`Something went wrong while adding the item to your inventory. Please try again later.`);
        return;
    }

    // Send success messages
    const successMessage = `You have successfully bought **${itemDetails.emoji} ${itemDetails.name}** x ${itemDetails.material_amount.toLocaleString()} (${itemDetails.price.toLocaleString()} ${itemDetails.currency})`;
    await interaction.editReply(successMessage);
    await interaction.channel.send(
        `<@${userId}> Buy **${itemDetails.emoji} ${itemDetails.name}** x ${itemDetails.material_amount.toLocaleString()} (${itemDetails.price.toLocaleString()} ${itemDetails.currency})`
    );
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
    handleShopButtonClick,
    handleShopSelectMenuClick
};