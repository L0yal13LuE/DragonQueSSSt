// managers/craftManager.js

// --- Required Libraries ---
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { createBaseEmbed } = require("./embedManager");
const { getUserItem, updateUserItem, insertUserItem } = require("./../providers/materialProvider");

// handle when user run !craft command
const handleCraftCommand = async (message, args) => {
    try {

        const autoClose = 5;
        const autoCloseTimer = (autoClose * 60) * 1000;

        // --- 1. Create Embed with Items ---
        const baseEmbed = createBaseEmbed({
            color: '#0099ff',
            title: args.title,
            description: args.description,
        });

        // ---- 2. Add items as fields to the embed using the new parameters
        const lettesArray = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
        args.items.forEach((item, index) => {
            // Add the item as a field to the embed
            let itemLetter = lettesArray[index];
            const materialRowArray = item.materials.map(row => `${row.materials.emoji} ${row.materials.name} x ${row.amount}`);
            // main row
            const mainrow = {
                name: `:regional_indicator_${itemLetter.toLowerCase()}: — ${item.emoji} ${item.name}`, // Combine emoji and item name for the field name
                value: `Required: ${materialRowArray.join(", ")}`, // Display the price in the value
                inline: false // Set to true to display items side-by-side if they fit (up to 3 per row usually)
            };
            baseEmbed.addFields(mainrow);
        });

        // --- 3. Create Buttons for each item ---
        const rows = [];
        let currentRow = new ActionRowBuilder();
        args.items.forEach((item, index) => {
            const uniqueItemId = `${item.name}`;
            let itemLetter = lettesArray[index];
            const button = new ButtonBuilder()
                .setCustomId(`craft_${itemLetter}@${Math.floor(100000 + Math.random() * 900000)}`)
                .setLabel(itemLetter) // Button text
                .setStyle(ButtonStyle.Primary); // Use a primary button style

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

        // --- 4. Send Embed with Buttons ---
        let reply = await message.reply({
            embeds: [baseEmbed],
            components: rows, // Attach the action rows containing the buttons
        });

        // --- 5. Delete the message after 5 minute ---
        let openCrafTimer = setTimeout(async () => {
            clearTimeout(openCrafTimer);
            await reply.delete();
            await message.reply('**Crafting session closed.** Use `!craft` to start again!');
        }, autoCloseTimer);
    } catch (error) {
        console.error('Error sending shop embed with buttons:', error);
        message.reply('Could not display the shop at this time.');
    }
}

// handle button interactions when user click on button from using !craft command
const handleCraftButtonClick = async (interaction, args) => {
    // Only process button interactions
    if (!interaction.isButton()) return;

    const userId = interaction.user.id;
    const username = interaction.user.username;

    // Check if the button custom ID starts with 'craft_', indicating a shop purchase attempt
    if (interaction.customId.startsWith('craft_')) {

        // Defer the reply to prevent interaction timeout, reply is only visible to the user
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Extract the item 
        const itemToBuyNameA = interaction.customId.replace('craft_', '').replace(/_/g, '');
        const itemToBuyName = itemToBuyNameA.split('@')[0];
        const itemToCraft = args.items.find(item => item.letter === itemToBuyName);

        // If the item wasn't found (shouldn't happen if custom IDs are generated correctly, but good practice to check)
        if (!itemToCraft) {
            await interaction.editReply('Error: Could not identify the item you wish to craft.');
            return;
        }

        const reqMaterialID = itemToCraft.id;
        const reqMaterialName = itemToCraft.name;
        const reqMaterialAmount = itemToCraft.amount;
        const reqMaterialArray = itemToCraft.materials; // { id, material_id, amount, materials{name,emoji} }

        let resultPrepareItem = [];

        // Helper function to create material item object
        // Valid or Invalid material item object
        const createMaterialItem = (materialId, materialName, materialAmount, userItemMatch = null) => {
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

        // Process all required materials in parallel
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

            // console.log("resultPrepareItem: ", resultPrepareItem);

            // update item
            let allUpdated = true, allUpdateResult = [];
            await Promise.all(resultPrepareItem.map(async ({ amount_owned, amount_new, userItemMatch }) => {
                const userUpdObj = { id: userId };
                const resultUpdate = await updateUserItem(userUpdObj, userItemMatch, amount_owned, amount_new);
                allUpdateResult.push(resultUpdate);
                if (!resultUpdate) allUpdated = false;
            }));

            // insert new item
            if (allUpdated) {
                const userUpdObj = { id: userId, username: username };
                const existingCraftedItem = await getUserItem({ userId, itemId: reqMaterialID });
                let craftSuccess = false;
                if (existingCraftedItem?.[0]) {
                    // Update existing crafted item
                    const currentAmount = existingCraftedItem[0].amount;
                    craftSuccess = await updateUserItem(
                        userUpdObj,
                        existingCraftedItem[0],
                        currentAmount,
                        currentAmount + 1
                    );
                } else {
                    // Insert new crafted item
                    const userInsObj = { id: reqMaterialID, name: reqMaterialName };
                    craftSuccess = await insertUserItem(userUpdObj, userInsObj, 1);
                }
                
                if (craftSuccess) {
                    // announce message to user/channel
                    await interaction.editReply(`Success: You crafted **${itemToCraft.emoji} ${itemToCraft.name}**`);
                    interaction.channel.send(`<@${userId.toString()}> crafted: ${itemToCraft.emoji} ${itemToCraft.name}`);
                } else {
                    // insert failed
                    await interaction.editReply(`Fail: You crafted **${itemToCraft.emoji} ${itemToCraft.name}** but failed to insert new item. (ER-2)`);
                }
            } else {
                // deduct item fail
                await interaction.editReply(`Fail: You crafted **${itemToCraft.emoji} ${itemToCraft.name}** but failed to to deduct material. (ER-1)`);
            }
            //await interaction.editReply(`This feature coming soon! (crafting ${itemToCraft.emoji} ${itemToCraft.name})\nStay tuned! for upcoming features!🤗`);
        } else {
            await interaction.editReply(`Fail: You don't have enough material to craft **${itemToCraft.emoji} ${itemToCraft.name}**.`);
        }
    }
}
// --- Command Export ---
module.exports = {
    handleCraftCommand,
    handleCraftButtonClick
};