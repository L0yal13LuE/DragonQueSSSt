// command/leaderboard.js

// --- Required Libraries ---
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const handleShopCommand = async (message, args) => {

    // Check if the message is in the designated shop channel and is the !shop command
    if (message.channel.id === args.channelId && message.content.toLowerCase() === '!shop') {

        // Create the RPG-style shop embed message
        const shopEmbed = new EmbedBuilder()
            .setColor('#0099ff') // A standard blue color, change to fit your theme (e.g., #8B4513 for brown, #556B2F for dark olive)
            // .setTitle('Adventurer\'s Emporium')
            .setTitle(args.title)
            // .setDescription('Welcome, traveler! See what wares I have for sale:')
            .setDescription(args.description)
            .setThumbnail(args.thumbnail) // Optional: Add a thumbnail for the shop
            .setImage(args.image) // Optional: Add a larger image for the shop
            // .setTimestamp() // Adds a timestamp to the embed
            .setFooter({ text: args.footer }); // Add a footer

        // Add items as fields to the embed using the new parameters
        args.items.forEach(item => {
            shopEmbed.addFields({
                name: `${item.emoji} ${item.name}`, // Combine emoji and item name for the field name
                value: `${item.price} ${item.currency}`, // Display the price in the value
                inline: true // Set to true to display items side-by-side if they fit (up to 3 per row usually)
            });
        });

        // --- Create Buttons for each item ---
        const rows = [];
        let currentRow = new ActionRowBuilder();

        args.items.forEach((item, index) => {
            const uniqueItemId = `${item.name}`;
            const button = new ButtonBuilder()
                // Create a unique custom ID for the button, based on the item name
                .setCustomId(`buy_${uniqueItemId.replace(/\s+/g, '_')}`)
                .setLabel(`Buy ${item.emoji} ${item.name}`) // Button text
                .setStyle(ButtonStyle.Primary); // Use a primary button style
            // .setStyle(ButtonStyle.Secondary); // Use a primary button style

            // Add button to the current row
            currentRow.addComponents(button);

            // If the current row has 5 buttons or it's the last item, push the row and start a new one
            if (currentRow.components.length === 5 || index === args.items.length - 1) {
                rows.push(currentRow);
                if (index < args.items.length - 1) { // Don't create a new row if it's the very last item
                    currentRow = new ActionRowBuilder();
                }
            }
        });

        // Send the embed with the buttons
        try {
            await message.channel.send({
                embeds: [shopEmbed],
                components: rows, // Attach the action rows containing the buttons
            });
        } catch (error) {
            console.error('Error sending shop embed with buttons:', error);
            message.channel.send('Could not display the shop at this time.');
        }
    } else {
        const CORRECT_CHANNEL_ID = args.channelid;
        if (message.channel.id !== CORRECT_CHANNEL_ID) {
            console.log(`[${message.author.username}] Used !shop in wrong channel: ${message.channel.name}.`);
            message.reply(`You can use \`!shop\` in <#${CORRECT_CHANNEL_ID}> only!`);
            return;
        }
    }
}
// Function to handle button interactions for this command
const handlePressBuy = async (interaction, args) => {
    // Only process button interactions
    if (!interaction.isButton()) return;

    // Check if the button custom ID starts with 'buy_', indicating a shop purchase attempt
    if (interaction.customId.startsWith('buy_')) {

        // Defer the reply to prevent interaction timeout, reply is only visible to the user
        await interaction.deferReply({ ephemeral: true });

        // Extract the item name from the custom ID
        const itemToBuyName = interaction.customId.replace('buy_', '').replace(/_/g, ' ');

        // Find the item details in your shopItems array
        const itemToBuy = args.items.find(item => item.name.toLowerCase() === itemToBuyName.toLowerCase());

        // If the item wasn't found (shouldn't happen if custom IDs are generated correctly, but good practice to check)
        if (!itemToBuy) {
            await interaction.editReply('Error: Could not identify the item you wish to purchase.');
            return;
        }

        console.log("itemToBuy: ", itemToBuy);

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
            await interaction.editReply(`Success: **${itemToBuy.emoji} ${itemToBuy.name}** for ${itemToBuy.price} ${itemToBuy.currency}! (Note: Actual purchase logic is not yet implemented)`);
            // In your real code, you would confirm the successful purchase and update user data.
        } else {
            await interaction.editReply(`Fail: You don't have enough gold to purchase the **${itemToBuy.emoji} ${itemToBuy.name}**. You need ${itemToBuy.price} ${itemToBuy.currency}.`);
            // In your real code, this would be triggered if the user's balance is too low.
        }
    }
}
// --- Command Export ---
module.exports = {
    handleShopCommand,
    handlePressBuy
};