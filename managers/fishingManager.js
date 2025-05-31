// managers/craftManager.js

// --- Required Libraries ---
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { supabase } = require('../supabaseClient');
const { createBaseEmbed } = require("./embedManager");
const { getUserItem, updateUserItem, insertUserItem } = require("./../providers/materialProvider");

// handle when user run !craft command
const fishingUserInstance = new Map();
const handleFishingCommand = async (message) => {
    try {

        const userId = message.author.id;

        const autoClose = 1;
        const autoCloseTimer = (autoClose * 60) * 1000;
        const expirationTimestamp = `<t:${Math.floor((Date.now() + autoClose * 60 * 1000) / 1000)}:R>`;

        // --- 1. Create Embed with Items ---
        const baseEmbed = createBaseEmbed({
            color: 0x32cd32,
            title: "🐟 Fishing 🐟",
            description: "You are fishing in the ocean, and you catch some items!\nstarting form **Common** to **Super Rare**\nChoice is up to you!\n\n",
        });

        // ---- 2. Add items as fields to the embed using the new parameters
        baseEmbed.addFields(
            {
                name: `:regional_indicator_a: — 🎣 Common Fishing Rod (10 Como)`,
                value: `Items: Common, Uncommon`,
                inline: false
            },
            {
                name: `:regional_indicator_b: — 🎣 Rare Fishing Rod (25 Como)`,
                value: `Items: Uncommon, Rare`,
                inline: false
            },
            {
                name: `:regional_indicator_c: — 🎣 Rare Fishing Rod (50 Como)`,
                value: `Items: Uncommon, Rare, Super Rare`,
                inline: false
            }
        );

        baseEmbed.addFields({
            name: ' ',
            value: `Expire in ${autoClose} minute ${expirationTimestamp}\n\n`,
            inline: false
        });

        // --- 3. Create Buttons for each item ---
        let rows = [];
        const currentRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`fishing_a@${Math.floor(100000 + Math.random() * 900000)}_${userId}`)
                .setLabel("A — 10 Como")
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`fishing_b@${Math.floor(100000 + Math.random() * 900000)}_${userId}`)
                .setLabel("B — 25 Como")
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`fishing_c@${Math.floor(100000 + Math.random() * 900000)}_${userId}`)
                .setLabel("C — 50 Como")
                .setStyle(ButtonStyle.Primary)
        );
        rows.push(currentRow);

        // --- 4. Send Embed with Buttons ---
        let reply = await message.reply({
            embeds: [baseEmbed],
            components: rows, // Attach the action rows containing the buttons
        });

        // --- 5. Delete the message after 5 minute ---
        let timer = setTimeout(async () => {
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

const clanCraftChannels = async (clanNumber) => {
    try {
        const channelData = await getChannelIdForClanCraft(clanNumber);
        if (!channelData) return null;
        return channelData;
    } catch (error) {
        console.error(`Unexpected error fetching crafts for ${clanNumber}:`, error);
        return null;
    }
}

const getChannelIdForClanCraft = async (clanNumber) => {
    try {
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
}


// --- Command Export ---
module.exports = {
    handleFishingCommand,
    // handleCraftButtonClick,
    // clanCraftChannels
};