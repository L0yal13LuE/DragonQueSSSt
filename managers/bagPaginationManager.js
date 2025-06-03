// managers/bagManager.js (or whatever you named the file)

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
// const { createBaseEmbed } = require("./embedManager"); // Uncomment if you have a specific base embed for bags
const { getUserItem } = require("./../providers/materialProvider"); // Adjust path as needed

// --- Configuration ---
const BAG_ITEMS_PER_PAGE = 10;
const BAG_AUTO_CLOSE_MINUTES = 5;
const BAG_INTERACTION_COOLDOWN_SECONDS = 5; // Cooldown for button clicks

// --- In-memory storage for active bag instances and user cooldowns ---
// Key: userId, Value: { message: Message, timeoutId: Timeout, userItems: Array, currentPage: number }
const activeBagInstances = new Map();
// Key: userId, Value: timestamp of when the cooldown ends
const bagInteractionCooldowns = new Map();

// --- Helper Functions ---

/**
 * Creates the embed for a specific page of the user's bag.
 */
const createBagPageEmbed = (username, userItems, page, totalPages, expirationTimestamp) => {
    const start = page * BAG_ITEMS_PER_PAGE;
    const end = start + BAG_ITEMS_PER_PAGE;
    const itemsToShow = userItems.slice(start, end);

    const itemListText = itemsToShow.length > 0
        ? itemsToShow.map(item => `${item.material.rarities.emoji} ${item.material.name} ${item.material.emoji} x ${item.amount.toLocaleString()}`).join('\n')
        : 'Your bag is empty!';

    return new EmbedBuilder()
        .setColor(0x0099FF) // Blue color
        .setTitle(`${username}'s Bag`)
        .setDescription(`${itemListText}\n\nThis bag view will close ${expirationTimestamp}.`)
        .setFooter({ text: `Page ${page + 1} of ${totalPages}` });
};

/**
 * Creates the ActionRow with pagination buttons for the bag.
 */
const createBagPaginationButtons = (messageId, userId /* userId not strictly needed for customId here but good for consistency */, currentPage, totalPages) => {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`bag_nav_${messageId}_first`)
                .setLabel('<< First')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage === 0 || totalPages <= 1),
            new ButtonBuilder()
                .setCustomId(`bag_nav_${messageId}_prev`)
                .setLabel('< Prev')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage === 0 || totalPages <= 1),
            new ButtonBuilder()
                .setCustomId(`bag_nav_${messageId}_next`)
                .setLabel('Next >')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage >= totalPages - 1 || totalPages <= 1),
            new ButtonBuilder()
                .setCustomId(`bag_nav_${messageId}_last`)
                .setLabel('Last >>')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage >= totalPages - 1 || totalPages <= 1)
        );
};

// --- Main Command and Interaction Handlers ---

const handleBagCommand = async (message, isDM = false) => {
    const userId = message.author.id;
    const username = message.author.username;
    const autoCloseMs = BAG_AUTO_CLOSE_MINUTES * 60 * 1000;

    try {
        const userItems = await getUserItem({ userId: userId, amount: 1 });

        if (!userItems || userItems.length === 0) {
            const emptyBagMessage = "Your bag is empty... Go find some items!";
            if (isDM) {
                try {
                    const dmEmbed = new EmbedBuilder().setTitle(`${username}'s Bag`).setDescription(emptyBagMessage).setColor(0x0099FF);
                    await message.author.send({ embeds: [dmEmbed] });
                    if (message.channel.type !== 'DM') {
                        await message.reply({ content: `✅ I've sent your (empty) bag contents to your DMs!` });
                    }
                } catch (error) {
                    if (message.channel.type !== 'DM') {
                        await message.reply({ content: `❌ I couldn't DM you. Please check your settings to allow direct messages from server members.` });
                    } else {
                        console.warn(`Could not send DM to ${userId} for empty bag, already in DMs.`);
                    }
                }
            } else {
                await message.reply({ content: emptyBagMessage });
            }
            return;
        }

        if (isDM) {
            const itemList = userItems
                .map(value => `${value.material.emoji} ${value.material.name}: ${value.amount.toLocaleString()}`)
                .join("\n");
            const dmEmbed = new EmbedBuilder().setTitle(`${username}'s Bag`).setDescription(itemList).setColor(0x0099FF);
            try {
                await message.author.send({ embeds: [dmEmbed] });
                if (message.channel.type !== 'DM') {
                    await message.reply({ content: `✅ I've sent your bag contents to your DMs!` });
                }
            } catch (error) {
                if (message.channel.type !== 'DM') {
                    await message.reply({ content: `❌ I couldn't DM you. Please check your settings to allow direct messages from server members.` });
                } else {
                    console.warn(`Could not send DM to ${userId} for bag with items, already in DMs.`);
                }
            }
            return;
        }

        if (activeBagInstances.has(userId)) {
            const oldInstance = activeBagInstances.get(userId);
            clearTimeout(oldInstance.timeoutId);
            oldInstance.message.delete().catch(e => console.warn("Couldn't delete previous bag message:", e.message));
            activeBagInstances.delete(userId);
        }

        const expirationTimestamp = `<t:${Math.floor((Date.now() + autoCloseMs) / 1000)}:R>`;
        let currentPage = 0;
        const totalPages = Math.ceil(userItems.length / BAG_ITEMS_PER_PAGE);

        const initialEmbed = createBagPageEmbed(username, userItems, currentPage, totalPages, expirationTimestamp);
        const tempMessageIdMarker = `temp_${Date.now()}`; // Placeholder for customId before message exists
        const initialComponents = totalPages > 1 ? [createBagPaginationButtons(tempMessageIdMarker, userId, currentPage, totalPages)] : [];

        const replyMessage = await message.reply({
            embeds: [initialEmbed],
            components: initialComponents,
            fetchReply: true,
        });

        if (totalPages > 1) {
            const finalComponents = [createBagPaginationButtons(replyMessage.id, userId, currentPage, totalPages)];
            await replyMessage.edit({ components: finalComponents }).catch(e => console.warn("Failed to edit bag message with final components:", e.message));
        }

        const timeoutId = setTimeout(async () => {
            const currentInstance = activeBagInstances.get(userId);
            if (currentInstance && currentInstance.message.id === replyMessage.id) {
                try {
                    await replyMessage.edit({ content: '**Bag view closed.** Use `!bagnew` to open again.', embeds: [], components: [] });
                } catch (errorDel) {
                    console.warn('Error editing bag message on timeout:', errorDel.message);
                }
                activeBagInstances.delete(userId);
                bagInteractionCooldowns.delete(userId);
            }
        }, autoCloseMs);

        activeBagInstances.set(userId, {
            message: replyMessage,
            timeoutId: timeoutId,
            userItems: userItems,
            currentPage: currentPage
        });

    } catch (error) {
        console.error(`Error handling bag command for ${username} (ID: ${userId}):`, error);
        await message.reply({ content: "Sorry, I couldn't display your bag right now. Please try again." }).catch(() => { });
    }
};

const handleBagPaginationInteraction = async (interaction) => {
    if (!interaction.isButton() || !interaction.customId.startsWith('bag_nav_')) {
        return;
    }

    const userId = interaction.user.id;

    const now = Date.now();
    const userCooldownEndTimestamp = bagInteractionCooldowns.get(userId);

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
    bagInteractionCooldowns.set(userId, now + (BAG_INTERACTION_COOLDOWN_SECONDS * 1000));

    try {
        if (!interaction.replied && !interaction.deferred) {
            await interaction.deferUpdate();
        } else {
            return; // Already acknowledged (e.g. by cooldown reply)
        }
    } catch (deferError) {
        console.error(`Error deferring bag pagination update for ${userId}: ${deferError.message}`);
        return;
    }

    const parts = interaction.customId.split('_');
    if (parts.length < 4) {
        console.warn(`Malformed bag_nav customId for ${userId}: ${interaction.customId}`);
        return;
    }
    const messageIdFromCustomId = parts[2];
    const action = parts[3];

    const bagInstance = activeBagInstances.get(userId);

    if (!bagInstance || bagInstance.message.id !== interaction.message.id || bagInstance.message.id !== messageIdFromCustomId) {
        try {
            if (interaction.deferred) { // Check if it was successfully deferred
                await interaction.followUp({
                    content: "This bag view has expired or is no longer active. Please use the command again.",
                    flags: MessageFlags.Ephemeral
                });
            }
            if (interaction.message.id === messageIdFromCustomId) {
                interaction.message.edit({ components: [] }).catch(e => console.warn(`Failed to disable components on old bag message ${messageIdFromCustomId}: ${e.message}`));
            }
        } catch (e) {
            console.warn(`Expired bag view followUp failed for ${userId}: ${e.message}`);
        }
        return;
    }

    const { userItems } = bagInstance;
    let currentPage = bagInstance.currentPage;
    const totalPages = Math.ceil(userItems.length / BAG_ITEMS_PER_PAGE);
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
        const updatedEmbed = createBagPageEmbed(interaction.user.username, userItems, currentPage, totalPages, expirationTimestamp);
        const updatedButtons = createBagPaginationButtons(interaction.message.id, userId, currentPage, totalPages);

        await interaction.editReply({
            embeds: [updatedEmbed],
            components: [updatedButtons],
        });
    } catch (error) {
        console.error(`Error on editReply for bag pagination for ${userId} (page ${currentPage}): ${error.message}`);
    }
};

// --- Module Export ---
module.exports = {
    handleBagCommand,
    handleBagPaginationInteraction,
};