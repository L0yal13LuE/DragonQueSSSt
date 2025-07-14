// managers/clanDonationManager.js 
// Craft Manager
// User typing !donation to see donation item list
// User navigations through the list using buttons
// User make donations using buttons

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
// const { createBaseEmbed } = require("./embedManager"); // Uncomment if you have a specific base embed for bags
const { supabase } = require('../supabaseClient');
const { getUserItem, updateUserItem, insertUserItem } = require("./../providers/materialProvider");

// --- Configuration ---
const BAG_ITEMS_PER_PAGE = 10;
const BAG_AUTO_CLOSE_MINUTES = 2;
const BAG_INTERACTION_COOLDOWN_SECONDS = 4; // Cooldown for button clicks

// --- In-memory storage for active bag instances and user cooldowns ---
// Key: userId, Value: { message: Message, timeoutId: Timeout, userItems: Array, currentPage: number }
const craftListIntances = new Map();
// Key: userId, Value: timestamp of when the cooldown ends
const craftListInteractionCooldowns = new Map();


/**
 * Creates the embed for a specific page of the donation list.
 * @param {string} username The username of the user viewing the list.
 * @param {Array} itemList The array of items to be shown in the list.
 * @param {number} page The current page number.
 * @param {number} totalPages The total number of pages in the list.
 * @param {string} expirationTimestamp A timestamp indicating when the list will expire.
 * @returns {EmbedBuilder} The embed for the current page.
 */
const createBagPageEmbed = (username, itemList, page, totalPages, expirationTimestamp) => {
    const start = page * BAG_ITEMS_PER_PAGE;
    const end = start + BAG_ITEMS_PER_PAGE;
    const itemsToShow = itemList.slice(start, end);

    let itemListText = "";
    itemsToShow.forEach((item, idx) => {
        let reqMats = item.materials.map(mat => `${mat.materials.name} x${mat.amount}`).join(', ');
        let line = `**${item.name}**\n> ${reqMats}`;
        itemListText += `${line}\n\n`;
    })

    return new EmbedBuilder()
        .setColor(0x0099FF) // Blue color
        .setTitle(`Craft List`)
        .setDescription(`${itemListText}Close in ${expirationTimestamp}.`)
        .setFooter({ text: `Page ${page + 1} of ${totalPages}` });
};


/**
 * Creates the ActionRow with pagination buttons for the donation list.
 * @param {string} messageId The ID of the message that the buttons will be attached to.
 * @param {string} userId The ID of the user viewing the list. Not strictly needed but good for consistency.
 * @param {number} currentPage The current page number.
 * @param {number} totalPages The total number of pages in the list.
 * @param {number} clanNumber The number of the clan that the donation list belongs to.
 * @returns {ActionRowBuilder} The ActionRow with pagination buttons.
 */
const createBagPaginationButtons = (messageId, userId /* userId not strictly needed for customId here but good for consistency */, currentPage, totalPages, clanNumber) => {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`craftlist_nav_${messageId}_first`)
                .setLabel('<< First')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage === 0 || totalPages <= 1),
            new ButtonBuilder()
                .setCustomId(`craftlist_nav_${messageId}_prev`)
                .setLabel('< Prev')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage === 0 || totalPages <= 1),
            new ButtonBuilder()
                .setCustomId(`craftlist_nav_${messageId}_next`)
                .setLabel('Next >')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage >= totalPages - 1 || totalPages <= 1),
            new ButtonBuilder()
                .setCustomId(`craftlist_nav_${messageId}_last`)
                .setLabel('Last >>')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage >= totalPages - 1 || totalPages <= 1)
        );
};

/**
 * Creates an array of ActionRows with buttons for each item in the given list.
 * The buttons are used to let users donate the items to the clan.
 * Each row contains up to 5 buttons, and the customId of each button is in the format
 * "crafitem_<itemId>-<clanNumber>@<randomNumber>_<userId>".
 * @param {string} userId The ID of the user viewing the list.
 * @param {Array} itemList The array of items to be shown in the list.
 * @param {number} page The current page number.
 * @param {number} totalPages The total number of pages in the list.
 * @param {number} clanNumber The number of the clan that the donation list belongs to.
 * @returns {Array<ActionRowBuilder>} The array of ActionRows with buttons.
 */
const createButtonForItem = (userId, itemList, page, totalPages, clanNumber) => {
    const buttonPrefix = "crafitem_";

    let rows = [];
    let currentRow = new ActionRowBuilder();

    const start = page * BAG_ITEMS_PER_PAGE;
    const end = start + BAG_ITEMS_PER_PAGE;
    const itemsToShow = itemList.slice(start, end);

    itemsToShow.forEach((item, index) => {
        let button = new ButtonBuilder()
            .setCustomId(`${buttonPrefix}${item.id}-${clanNumber}@${Math.floor(100000 + Math.random() * 900000)}_${userId}`)
            .setLabel(item.name)
            .setStyle(ButtonStyle.Primary);
        currentRow.addComponents(button);
        if (currentRow.components.length === 5 || index === itemsToShow.length - 1) {
            rows.push(currentRow);
            if (index < itemsToShow.length - 1) {
                currentRow = new ActionRowBuilder();
            }
        }
    });
    return rows;
}



// const getCraftableItems = async () => {
//     try {
//         const { data, error } = await supabase.rpc('get_materials_with_crafts');
//         return data.map((row, index) => ({ ...row, index: index + 1 }));
//     } catch (error) {
//         console.error("Error fetching craftable items:", error);
//         return [];
//     }
// };

const handleCraftListCommand = async (message, settings) => {
    const userId = message.author.id;
    const username = message.author.username;
    const autoCloseMs = BAG_AUTO_CLOSE_MINUTES * 60 * 1000;
    const clanNumber = settings.clanNumber || 0;

    // console.log(' settings > ', settings);
    // console.log(settings.items[0].materials)

    try {

        // filter only items with unique name
        const isMoreThanOne = settings.items.length > BAG_ITEMS_PER_PAGE;
        const craftableItems = settings.items.filter((item, index, self) => self.findIndex(i => i.name === item.name) === index);

        if (!craftableItems || craftableItems.length === 0) {
            await message.reply({ content: "No craft item at the moment, please come again later 😭" });
            return;
        }

        // clear old instance
        if (craftListIntances.has(userId)) {
            const oldInstance = craftListIntances.get(userId);
            clearTimeout(oldInstance.timeoutId);
            oldInstance.message.delete();
            craftListIntances.delete(userId);
        }

        const expirationTimestamp = `<t:${Math.floor((Date.now() + autoCloseMs) / 1000)}:R>`;
        let currentPage = 0;
        const totalPages = Math.ceil(craftableItems.length / BAG_ITEMS_PER_PAGE);

        // setup first msg to reply
        const initialEmbed = createBagPageEmbed(username, craftableItems, currentPage, totalPages, expirationTimestamp); // content embed
        const tempMessageIdMarker = `temp_craftd_${Date.now()}`;
        const initialComponents = totalPages > 1 ? [createBagPaginationButtons(tempMessageIdMarker, userId, currentPage, totalPages, clanNumber)] : []; // pagination btn
        const triggerButtonComponents = createButtonForItem(userId, craftableItems, currentPage, totalPages, clanNumber); // item donate btn

        // sent first msg
        const replyMessage = await message.reply({
            embeds: [initialEmbed],
            components: initialComponents.concat(triggerButtonComponents),
            fetchReply: true,
        });

        // update msg if more than 1 page
        if (totalPages > 1) {
            const finalComponents = [createBagPaginationButtons(replyMessage.id, userId, currentPage, totalPages, clanNumber)];
            const finalTriggerButtonComponents = createButtonForItem(userId, craftableItems, currentPage, totalPages, clanNumber);
            await replyMessage.edit({ 
                components: finalComponents.concat(finalTriggerButtonComponents) 
            }).catch(e => console.warn("Failed to edit bag message with final components:", e.message));
        }

        // instance for delete timeout msg
        let timeoutIdCraft = setTimeout(async () => {
            const currentInstance = craftListIntances.get(userId);
            if (currentInstance && currentInstance.message.id === replyMessage.id) {
                try {
                    await replyMessage.edit({ content: 'Craft closed', embeds: [], components: [] });
                } catch (errorDel) {
                    console.warn('Error editing bag message on timeout:', errorDel.message);
                }
                craftListIntances.delete(userId);
                craftListInteractionCooldowns.delete(userId);
            }
        }, autoCloseMs);

        // set refreshed instance
        craftListIntances.set(userId, {
            message: replyMessage,
            timeoutId: timeoutIdCraft,
            craftableItems: craftableItems,
            currentPage: currentPage
        });

    } catch (error) {
        console.error(`Error handling bag command for ${username} (ID: ${userId}):`, error);
        await message.reply({ content: "Server busy please try again later 😭" }).catch(() => { });
    }
};


const handleCraftListInteraction = async (interaction, clanShopSettingData, clanCraftSettingData) => {
    if (!interaction.isButton() || !interaction.customId.startsWith('craftlist_nav_')) {
        return;
    }

    // some deferring stuff with discord
    try {
        if (!interaction.replied && !interaction.deferred) {
            await interaction.deferUpdate();
        }
    } catch (deferError) {
        console.error(`Error deferring donation list pagination update: ${deferError.message}`);
        return;
    }

    // get channel id from interaction object and find current clan number from given setting
    const messageChannelId = interaction.message.channelId;
    const channelClanNumber = clanShopSettingData.get(messageChannelId)?.clanNumber;
    const donationChannelClanObj = clanCraftSettingData.find(
        (row) => row.channel_id == messageChannelId
    );
    const donationClanNumber = donationChannelClanObj && donationChannelClanObj.setting ? donationChannelClanObj.setting.clanNumber : 0;
    const clanNumber = Math.max(channelClanNumber || 0, donationClanNumber);

    const userId = interaction.user.id;

    // prevent user spamming button
    const now = Date.now();
    const userCooldownEndTimestamp = craftListInteractionCooldowns.get(userId);
    if (userCooldownEndTimestamp && now < userCooldownEndTimestamp) {
        const timeLeft = Math.ceil((userCooldownEndTimestamp - now) / 1000);
        try {
            return await interaction.reply({
                content: `Please wait ${timeLeft} more second(s).`,
                flags: MessageFlags.Ephemeral
            });
        } catch (e) {
            console.warn(`Cooldown ephemeral reply failed: ${e.message}`);
        }
        return;
    }
    craftListInteractionCooldowns.set(userId, now + (BAG_INTERACTION_COOLDOWN_SECONDS * 1000));

    const parts = interaction.customId.split('_');
    if (parts.length < 4) {
        console.warn(`Malformed craftlist_nav customId: ${interaction.customId}`);
        return;
    }
    const messageIdFromCustomId = parts[2];
    const action = parts[3];

    const bagInstance = craftListIntances.get(userId);

    // wrong user
    // message must matching pre-defined id
    const msgId_A = interaction.message.id.toString();
    const msgId_1 = messageIdFromCustomId?.toString() ?? null;
    const msgId_2 = bagInstance?.message?.id?.toString() ?? null;
    if (msgId_A !== msgId_1 || msgId_A !== msgId_2) {
        try {
            if (interaction.deferred) {
                console.warn(`Warning User ${userId} trying to use other's interaction (1): ${interaction.customId}`);
                return await interaction.followUp({
                    content: "Please use your own command.",
                    flags: MessageFlags.Ephemeral
                });
            }
            return;
        } catch (e) {
            console.warn(`[CraftPaginationManager] Expired view followUp failed (1): ${e.message}`);
        }
        return;
    }
    // session expire or session not found
    if (!bagInstance || bagInstance === null) {
        try {
            if (interaction.deferred) {
                console.warn(`Warning User ${userId} trying to use other's interaction (2): ${interaction.customId}`);
                return await interaction.followUp({
                    content: "Session expired or not your command.",
                    flags: MessageFlags.Ephemeral
                });
            }
            return;
        } catch (e) {
            console.warn(`[CraftPaginationManager] Expired view followUp failed (2): ${e.message}`);
        }
        return;
    }

    // navigation calculations
    const { craftableItems } = bagInstance;
    let currentPage = bagInstance.currentPage;
    const totalPages = Math.ceil(craftableItems.length / BAG_ITEMS_PER_PAGE);
    const autoCloseMs = BAG_AUTO_CLOSE_MINUTES * 60 * 1000;

    // For expiration timestamp, use the original message's creation time + autoclose duration
    const expirationTimestamp = `<t:${Math.floor((bagInstance.message.createdTimestamp + autoCloseMs) / 1000)}:R>`;

    let newPage = currentPage;
    if (action === 'first') newPage = 0;
    else if (action === 'prev') newPage = Math.max(0, currentPage - 1);
    else if (action === 'next') newPage = Math.min(totalPages - 1, currentPage + 1);
    else if (action === 'last') newPage = totalPages - 1;

    if (newPage === currentPage) {
        return; // No actual page change, deferUpdate was enough
    }

    bagInstance.currentPage = newPage;
    currentPage = newPage;

    try {

        // update content base on current page
        const updatedEmbed = createBagPageEmbed(interaction.user.username, craftableItems, currentPage, totalPages, expirationTimestamp); // embed content
        const updatedButtons = [createBagPaginationButtons(interaction.message.id, userId, currentPage, totalPages, clanNumber)]; // navigation button
        const updateButtonsDonate = createButtonForItem(userId, craftableItems, currentPage, totalPages, clanNumber); // donate button

        await interaction.editReply({
            embeds: [updatedEmbed],
            components: [...updatedButtons, ...updateButtonsDonate],
        });
    } catch (error) {
        console.error(`Error on editReply for bag pagination (page ${currentPage}): ${error.message}`);
    }
};


const handleCraftListButtonClick = async (interaction, clanShopSettingData, clanCraftSettingData) => {
    if (!interaction.isButton()) return;

    // extract data
    const userId = interaction.user.id;
    const username = interaction.user.username;

    const buttonPrefix = "crafitem_";
    if (interaction.customId.startsWith(buttonPrefix)) {

        // tell discord to wait
        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        } catch (e) {
            console.warn(`interaction.deferReply failed: ${e.message}`);
        }
        
        // extract data from button
        const itemToTriggerA = interaction.customId.replace(buttonPrefix, '').replace(/_/g, '');
        const itemToTriggerPrefix = itemToTriggerA.split('@')[0] || false;
        if (!itemToTriggerPrefix) {
            await interaction.followUp('Error: Could not identify the item you wish to donate.(1)\nPlease report this issue with screenshots to moderators or post it on the report channel.');
            return;
        }

        const itemToTriggerID = itemToTriggerPrefix.split('-')[0] || false;
        const clanNumber = itemToTriggerPrefix.split('-')[1] || false;
        if (!itemToTriggerID || !clanNumber) {
            await interaction.followUp('Error: Could not identify the item you wish to donate.(2)\nPlease report this issue with screenshots to moderators or post it on the report channel.');
            return;
        }

        // session expire
        const bagInstance = craftListIntances.get(userId);
        if (!bagInstance || bagInstance === null) {
            try {
                if (interaction.deferred) { // Check if it was successfully deferred
                    await interaction.followUp({
                        content: "Session expired or not your command.",
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                } 
                return;
            } catch (e) {
                console.warn(`Expired view followUp failed: ${e.message}`);
            }
            return;
        }

        const { craftableItems } = bagInstance;
        const itemToCraft = craftableItems.find(item => parseInt(item.id) === parseInt(itemToTriggerID)) || null;

        if (!itemToCraft||!itemToCraft.id||itemToCraft==null) {
            await interaction.followUp('Error: Could not identify the item you wish to craft.(3)\nPlease report this issue with screenshots to moderators or post it on the report channel.');
            return;
        }

        // craft process start
        // craft process start
        // craft process start

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

            // update item
            let allUpdated = true, allUpdateResult = [];
            await Promise.all(resultPrepareItem.map(async ({ amount_owned, amount_new, userItemMatch }) => {
                const userUpdObj = { id: userId, username: username };
                const resultUpdate = await updateUserItem(userUpdObj, userItemMatch, amount_new);
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
                        currentAmount + 1
                    );
                } else {
                    // Insert new crafted item
                    const userInsObj = { id: reqMaterialID, name: reqMaterialName };
                    craftSuccess = await insertUserItem(userUpdObj, userInsObj, 1);
                }

                if (craftSuccess) {
                    // announce message to user/channel
                    await interaction.followUp(`Success: You crafted **${itemToCraft.name}**`);
                    // interaction.channel.send(`<@${userId.toString()}> crafted: ${itemToCraft.emoji} ${itemToCraft.name}`);
                } else {
                    // insert failed
                    await interaction.followUp(`Fail: You crafted **${itemToCraft.name}** but failed to insert new item. (4)\nPlease report this issue with screenshots to moderators or post it on the report channel.`);
                }
            } else {
                // deduct item fail
                await interaction.followUp(`Fail: You crafted **${itemToCraft.name}** but failed to to deduct material. (5)\nPlease report this issue with screenshots to moderators or post it on the report channel.`);
            }
        } else {
            // not enough material
            // show what they don't have
            const invalidMaterials = resultPrepareItem.filter(item => !item.valid);
            const missingMaterials = invalidMaterials.map(item => `> ${item.name} (**${item.amount_owned}**/${item.amount})`).join('\n');
            await interaction.followUp(`You don't have enough material to craft **${itemToCraft.name}**.\nMissing: \n${missingMaterials}\nComeback again when you have the required materials!`);
        }

        // await interaction.followUp('Craft done.');
    }
};

// --- Module Export ---
module.exports = {
    handleCraftListCommand,
    handleCraftListInteraction,
    handleCraftListButtonClick
};