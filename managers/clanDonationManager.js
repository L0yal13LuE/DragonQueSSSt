// managers/bagManager.js (or whatever you named the file)

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
// const { createBaseEmbed } = require("./embedManager"); // Uncomment if you have a specific base embed for bags
const { supabase } = require('../supabaseClient');
const { getUserItem, updateUserItem } = require("./../providers/materialProvider"); // Adjust path as needed

// --- Configuration ---
const BAG_ITEMS_PER_PAGE = 10;
const BAG_AUTO_CLOSE_MINUTES = 2;
const BAG_INTERACTION_COOLDOWN_SECONDS = 5; // Cooldown for button clicks

// --- In-memory storage for active bag instances and user cooldowns ---
// Key: userId, Value: { message: Message, timeoutId: Timeout, userItems: Array, currentPage: number }
const donationListIntances = new Map();
// Key: userId, Value: timestamp of when the cooldown ends
const donationListInteractionCooldowns = new Map();

// --- Helper Functions ---

/**
 * Creates the embed for a specific page of the user's bag.
 */
const createBagPageEmbed = (username, itemList, page, totalPages, expirationTimestamp) => {
    const start = page * BAG_ITEMS_PER_PAGE;
    const end = start + BAG_ITEMS_PER_PAGE;
    const itemsToShow = itemList.slice(start, end);

    const itemListText = itemsToShow.length > 0
        ? itemsToShow.map(item => `${item.index}.${item.name}`).join('\n')
        : 'List is empty!';

    return new EmbedBuilder()
        .setColor(0x0099FF) // Blue color
        .setTitle(`Clan Donation List`)
        .setDescription(`${itemListText}\n\nClose in ${expirationTimestamp}.`)
        .setFooter({ text: `Page ${page + 1} of ${totalPages}` });
};

/**
 * Creates the ActionRow with pagination buttons for the bag.
 */
const createBagPaginationButtons = (messageId, userId /* userId not strictly needed for customId here but good for consistency */, currentPage, totalPages, clanNumber) => {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`donationlist_nav_${messageId}_first`)
                .setLabel('<< First')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage === 0 || totalPages <= 1),
            new ButtonBuilder()
                .setCustomId(`donationlist_nav_${messageId}_prev`)
                .setLabel('< Prev')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage === 0 || totalPages <= 1),
            new ButtonBuilder()
                .setCustomId(`donationlist_nav_${messageId}_next`)
                .setLabel('Next >')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage >= totalPages - 1 || totalPages <= 1),
            new ButtonBuilder()
                .setCustomId(`donationlist_nav_${messageId}_last`)
                .setLabel('Last >>')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage >= totalPages - 1 || totalPages <= 1)
        );
};

const createButtonForItem = (userId, itemList, page, totalPages, clanNumber) => {
    const buttonPrefix = "donationitem_";

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

// --- Main Command and Interaction Handlers ---


const getCraftableItems = async () => {
    try {
        const { data, error } = await supabase.rpc('get_materials_with_crafts');
        return data.map((row, index) => ({ ...row, index: index + 1 }));
    } catch (error) {
        console.error("Error fetching craftable items:", error);
        return [];
    }
};

const handleDonationListCommand = async (message, clanNumber) => {
    const userId = message.author.id;
    const username = message.author.username;
    const autoCloseMs = BAG_AUTO_CLOSE_MINUTES * 60 * 1000;

    try {
        const craftableItems = await getCraftableItems();

        if (!craftableItems || craftableItems.length === 0) {
            await message.reply({ content: "No items are donatable at the moment, please come again later 😭" });
            return;
        }

        // clear old instance
        if (donationListIntances.has(userId)) {
            const oldInstance = donationListIntances.get(userId);
            clearTimeout(oldInstance.timeoutId);
            oldInstance.message.delete();
            donationListIntances.delete(userId);
        }

        const expirationTimestamp = `<t:${Math.floor((Date.now() + autoCloseMs) / 1000)}:R>`;
        let currentPage = 0;
        const totalPages = Math.ceil(craftableItems.length / BAG_ITEMS_PER_PAGE);

        const initialEmbed = createBagPageEmbed(username, craftableItems, currentPage, totalPages, expirationTimestamp);
        const tempMessageIdMarker = `temp_cland_${Date.now()}`;
        const initialComponents = totalPages > 1 ? [createBagPaginationButtons(tempMessageIdMarker, userId, currentPage, totalPages, clanNumber)] : [];
        const donateButtonCompontents = createButtonForItem(userId, craftableItems, currentPage, totalPages, clanNumber);

        const replyMessage = await message.reply({
            embeds: [initialEmbed],
            components: initialComponents.concat(donateButtonCompontents),
            fetchReply: true,
        });

        if (totalPages > 1) {
            const finalComponents = [createBagPaginationButtons(replyMessage.id, userId, currentPage, totalPages, clanNumber)];
            const finalDonateButtonCompontents = createButtonForItem(userId, craftableItems, currentPage, totalPages, clanNumber);
            await replyMessage.edit({ components: finalComponents.concat(finalDonateButtonCompontents) }).catch(e => console.warn("Failed to edit bag message with final components:", e.message));
        }

        const timeoutId = setTimeout(async () => {
            const currentInstance = donationListIntances.get(userId);
            if (currentInstance && currentInstance.message.id === replyMessage.id) {
                try {
                    await replyMessage.edit({ content: 'Donate closed', embeds: [], components: [] });
                } catch (errorDel) {
                    console.warn('Error editing bag message on timeout:', errorDel.message);
                }
                donationListIntances.delete(userId);
                donationListInteractionCooldowns.delete(userId);
            }
        }, autoCloseMs);

        donationListIntances.set(userId, {
            message: replyMessage,
            timeoutId: timeoutId,
            craftableItems: craftableItems,
            currentPage: currentPage
        });

    } catch (error) {
        console.error(`Error handling bag command for ${username} (ID: ${userId}):`, error);
        await message.reply({ content: "Server busy please try again later 😭" }).catch(() => { });
    }
};

const handleDonationListInteraction = async (interaction) => {
    if (!interaction.isButton() || !interaction.customId.startsWith('donationlist_nav_')) {
        return;
    }

    const userId = interaction.user.id;

    const now = Date.now();
    const userCooldownEndTimestamp = donationListInteractionCooldowns.get(userId);

    if (userCooldownEndTimestamp && now < userCooldownEndTimestamp) {
        const timeLeft = Math.ceil((userCooldownEndTimestamp - now) / 1000);
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: `You're navigating too quickly! Please wait ${timeLeft} more second(s).`,
                    flags: MessageFlags.Ephemeral
                });
            }
        } catch (e) {
            console.warn(`Cooldown ephemeral reply failed for ${userId}: ${e.message}`);
        }
        return;
    }
    donationListInteractionCooldowns.set(userId, now + (BAG_INTERACTION_COOLDOWN_SECONDS * 1000));

    try {
        if (!interaction.replied && !interaction.deferred) {
            await interaction.deferUpdate();
        } else {
            return;
        }
    } catch (deferError) {
        console.error(`Error deferring donation list pagination update for ${userId}: ${deferError.message}`);
        return;
    }

    const parts = interaction.customId.split('_');
    if (parts.length < 4) {
        console.warn(`Malformed donationlist_nav customId for ${userId}: ${interaction.customId}`);
        return;
    }
    const messageIdFromCustomId = parts[2];
    const action = parts[3];


    const bagInstance = donationListIntances.get(userId);

    if (!bagInstance || bagInstance.message.id !== interaction.message.id || bagInstance.message.id !== messageIdFromCustomId) {
        try {
            if (interaction.deferred) { // Check if it was successfully deferred
                await interaction.followUp({
                    content: "Session expired, please use the command again.",
                    flags: MessageFlags.Ephemeral
                });
            }
            if (interaction.message.id === messageIdFromCustomId) {
                interaction.message.edit({ components: [] }).catch(e => console.warn(`Failed to disable components on old bag message ${messageIdFromCustomId}: ${e.message}`));
            }
        } catch (e) {
            console.warn(`Expired view followUp failed for ${userId}: ${e.message}`);
        }
        return;
    }

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
        const updatedEmbed = createBagPageEmbed(interaction.user.username, craftableItems, currentPage, totalPages, expirationTimestamp);
        const updatedButtons = [createBagPaginationButtons(interaction.message.id, userId, currentPage, totalPages)];
        const updateButtonsDonate = createButtonForItem(userId, craftableItems, currentPage, totalPages);

        await interaction.editReply({
            embeds: [updatedEmbed],
            components: [...updatedButtons, ...updateButtonsDonate],
        });
    } catch (error) {
        console.error(`Error on editReply for bag pagination for ${userId} (page ${currentPage}): ${error.message}`);
    }
};

const handleDonateButtonClick = async (interaction) => {
    if (!interaction.isButton()) return;
    const userId = interaction.user.id;
    const username = interaction.user.username;
    const buttonPrefix = "donationitem_";
    if (interaction.customId.startsWith(buttonPrefix)) {

        // tell discord to wait
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // extract data from button
        const itemToDonateA = interaction.customId.replace(buttonPrefix, '').replace(/_/g, '');
        const itemToDonatePrefix = itemToDonateA.split('@')[0] || false;
        if (!itemToDonatePrefix) {
            await interaction.editReply('Error: Could not identify the item you wish to donate.');
            return;
        }

        const itemtoDonateID = itemToDonatePrefix.split('-')[0] || false;
        const clanNumber = itemToDonatePrefix.split('-')[1] || false;
        if (!itemtoDonateID || !clanNumber) {
            await interaction.editReply('Error: Could not identify the item you wish to donate.');
            return;
        }

        const userItem = await getUserItem({ userId, itemId: itemtoDonateID });
        const userItemMatch = userItem?.[0];

        if (!userItemMatch) {
            await interaction.editReply(`You don't have that item to donate.`);
            return;
        }

        const { amount: amountOwned } = userItemMatch;
        const amountNew = amountOwned - 1;
        if (amountNew < 0) {
            await interaction.editReply(`You don't have that item to donate.`);
            return;
        }

        // decrease user item amount
        const userUpdObj = { id: userId, username: username };
        const resultUpdate = await updateUserItem(userUpdObj, userItemMatch, amountNew);
        if (!resultUpdate) {
            await interaction.editReply('Error: Could not update your item amount.');
            return;
        }

        // make donation
        // 1. decrease user item amount
        // 2. increase donation amount
        const donationItem = await makeDonation(clanNumber, userId, itemtoDonateID);
        if (donationItem) {
            await interaction.editReply('Successfully donated the item.');
        } else {
            await interaction.editReply('Error: Could not donate the item.');
        }
    }
};

const makeDonation = async (clanNumber, userId, itemId) => {
    const currentSeason = "A";
    try {
        // get exist donate item
        const { data } = await supabase
            .from("clan_donation")
            .select("*")
            .eq("clan_number", clanNumber)
            .eq("season", currentSeason)
            .eq("material_id", itemId);

        if (data && data.length > 0) {
            // update exist donation item
            const { id: currentID, amount: currentAmount } = data[0];
            const newAmount = currentAmount + 1;
            const { error } = await supabase
                .from("clan_donation")
                .update({ amount: newAmount })
                .eq("id", currentID)
            if (error) {
                console.error(`Error updating item for ${userId}:`, error.message);
                return false;
            }
        } else {
            // insert donation item
            const { error: insertErrorA } = await supabase.from("clan_donation").insert([
                {
                    clan_number: clanNumber,
                    season: currentSeason,
                    material_id: itemId,
                    amount: 1
                },
            ]);
            if (insertErrorA) {
                console.error(`Error inserting new item for ${userId}:`, insertErrorA.message);
                return false;
            }
        }

        // insert donation history
        const { error: insertErrorB } = await supabase.from("clan_donation_history").insert([
            {
                clan_number: clanNumber,
                season: currentSeason,
                user_id: userId,
                material_id: itemId,
                amount: 1
            },
        ]);
        if (insertErrorB) {
            console.error(`Error inserting new item for ${userId}:`, insertErrorB.message);
            return false;
        }

        return true;
    } catch (error) {
        console.error(`Unexpected error in makeDonation for ${userId}:`, error);
        return false;
    }
}

// --- Module Export ---
module.exports = {
    handleDonationListCommand,
    handleDonationListInteraction,
    handleDonateButtonClick
};