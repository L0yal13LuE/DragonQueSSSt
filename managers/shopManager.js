// managers/shopManager.js

// --- Required Libraries ---
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { createBaseEmbed } = require("./embedManager");

const handleShopCommand = async (message, args) => {
    try {
        // --- Create Embed with Items ---
        // Create a base embed with title, description, thumbnail, and footer
        const baseEmbed = createBaseEmbed({
            color: '#0099ff',
            title: args.title,
            description: args.description,
            thumbnail: args.thumbnail,
            footer: { 'text': args.footer },
        })

        // Add items as fields to the embed using the new parameters
        const lettesArray = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
        args.items.forEach((item, index) => {
            // Add the item as a field to the embed
            let itemLetter = lettesArray[index];
            baseEmbed.addFields({
                name: `:regional_indicator_${itemLetter.toLowerCase()}: — ${item.emoji} ${item.name}`, // Combine emoji and item name for the field name
                value: `${item.price} ${item.currency}`, // Display the price in the value
                inline: false // Set to true to display items side-by-side if they fit (up to 3 per row usually)
            });
        });

        // --- Create Buttons for each item ---
        const rows = [];
        let currentRow = new ActionRowBuilder();

        args.items.forEach((item, index) => {
            const uniqueItemId = `${item.name}`;
            let itemLetter = lettesArray[index];
            const button = new ButtonBuilder()
                // Create a unique custom ID for the button, based on the item name
                // .setCustomId(`buy_${uniqueItemId.replace(/\s+/g, '_')}`)
                // .setLabel(`Buy ${item.emoji} ${item.name}`) // Button text
                .setCustomId(`buy_${itemLetter}@${Math.floor(100000 + Math.random() * 900000)}`)
                .setLabel(itemLetter) // Button text
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

        await message.reply({
            embeds: [baseEmbed],
            components: rows, // Attach the action rows containing the buttons
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
// --- Command Export ---
module.exports = {
    handleShopCommand,
    handleShopButtonClick
};