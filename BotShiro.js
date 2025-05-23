require('dotenv').config({
    path: {
        blue: '.env.blue',
        development: '.env',
        staging: '.env.staging',
        production: '.env.production'
    }[process.env.NODE_ENV || 'development']
});

const { Client, GatewayIntentBits, Collection, Events, Partials } = require('discord.js');
const { supabase } = require('./supabaseClient'); // Import supabase client

// --- Internal Modules ---
const CONSTANTS = require('./constants');
const dbUtils = require('./dbUtils'); // Assuming all DB functions are exported from here
const gameLogic = require('./gameLogic'); // Assuming core game logic functions are here
const announcements = require('./announcements'); // Assuming announcement functions are here
const commandHandlers = require('./commandHandlers'); // Assuming command handlers are here

// --- Command Handlers ---
const { handleSpinCommand } = require('./managers/spinManager.js'); // Import the spin command handler
const { handleMaterialCommand } = require('./managers/materialManager.js');

// -- Addition Command Handlers ---
const { handleLeaderboardCommand } = require('./managers/leaderBoardManager.js');
const { shopSettings, craftSettings } = require('./managers/shopWorkshop.js');
const { handleShopCommand, handleShopSelectMenuClick } = require('./managers/shopManager.js');
const { handleCraftCommand, handleCraftButtonClick } = require('./managers/craftManager.js');
const { getConfig } = require('./providers/configProvider.js'); // For loading dynamic configs
const { handleSendCommand } = require('./slashCommandHandler.js');

// --- Configuration ---
const TOKEN = process.env.DISCORD_TOKEN;
const ANNOUNCEMENT_CHANNEL_ID = process.env.ANNOUNCEMENT_CHANNEL_ID; // For level-ups ONLY
const ITEM_DROP_CHANNEL_ID = process.env.ITEM_DROP_CHANNEL_ID; // For item-drop- ONLY
const DAMAGE_LOG = process.env.DAMAGE_LOG; // For item-drop- ONLY

const CHANNEL_ID_1 = ANNOUNCEMENT_CHANNEL_ID;

// --- Configuration Validation ---
if (!TOKEN) {
    console.error('FATAL ERROR: DISCORD_TOKEN not found in .env file!');
    process.exit(1);
}

if (!ANNOUNCEMENT_CHANNEL_ID) {
    console.error('WARNING: ANNOUNCEMENT_CHANNEL_ID not found in .env file!');
    console.warn('Level-up announcements will not be sent to a dedicated channel.');
}

// --- Initialize Discord Client ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages, // Optional
    ],
    partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction,
        Partials.GuildMember, // Important for fetching members and their roles
        Partials.User
    ]
});

// --- Caches and State ---
const userCooldowns = new Collection();
let announcementChannel = null;
let itemDropChannel = null;
let damageLogChannel = null;

// Use a reference object for currentMonsterState so modules can update it
let currentMonsterStateRef = { current: null };

// -- Shop instance
let shopWorkShopSettings = null;
let craftWorkShopSettings = null;

// --- Bot Ready Event ---
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    // Fetch Channel Objects
    if (ANNOUNCEMENT_CHANNEL_ID) {
        try {
            announcementChannel = await client.channels.fetch(ANNOUNCEMENT_CHANNEL_ID);
            if (announcementChannel) console.log(`Announcement channel found: ${announcementChannel.name}`);
            else console.error(`Could not find announcement channel: ${ANNOUNCEMENT_CHANNEL_ID}`);
        } catch (error) { console.error(`Error fetching announcement channel:`, error); announcementChannel = null; }
    }

    // Fetch Channel Objects
    if (ITEM_DROP_CHANNEL_ID) {
        try {
            itemDropChannel = await client.channels.fetch(ITEM_DROP_CHANNEL_ID);
            if (itemDropChannel) console.log(`Item drop channel found: ${itemDropChannel.name}`);
            else console.error(`Could not find item drop channel: ${ITEM_DROP_CHANNEL_ID}`);
        } catch (error) { console.error(`Error fetching item drop channel:`, error); itemDropChannel = null; }
    }

    // Fetch Channel Objects
    if (DAMAGE_LOG) {
        try {
            damageLogChannel = await client.channels.fetch(DAMAGE_LOG);
            if (damageLogChannel) console.log(`Item damage log channel found: ${damageLogChannel.name}`);
            else console.error(`Could not find damage log channel: ${DAMAGE_LOG}`);
        } catch (error) { console.error(`Error fetching damage log channel:`, error); damageLogChannel = null; }
    }

    // Fetch Channel Objects
    if (ITEM_DROP_CHANNEL_ID) {
        try {
            itemDropChannel = await client.channels.fetch(ITEM_DROP_CHANNEL_ID);
            if (itemDropChannel) console.log(`Item drop channel found: ${itemDropChannel.name}`);
            else console.error(`Could not find item drop channel: ${ITEM_DROP_CHANNEL_ID}`);
        } catch (error) { console.error(`Error fetching item drop channel:`, error); itemDropChannel = null; }
    }

    // Send Online Announcement
    if (announcementChannel) {
        await announcements.sendOnlineAnnouncement(announcementChannel);
    } else {
        console.warn("Announcement channel unavailable, cannot send online announcement.");
    }

    // Spawn shop npc, spawn at certain channel but available on every channel
    async function refreshShopSettings() {
        shopWorkShopSettings = await shopSettings('1367030652834283590', client);
        if (shopWorkShopSettings) {
            console.log(`[Shop] found/refreshed: ${shopWorkShopSettings.title}`);
        } else {
            console.log(`[Shop] not found: ${shopWorkShopSettings}`);
            shopWorkShopSettings = null;
        }
    }
    refreshShopSettings(); // Initial spawn
    setInterval(refreshShopSettings, 60 * 60 * 1000); // Refresh every hour

    // Spawn craft npc
    craftWorkShopSettings = await craftSettings('!craft', client);
    if (craftWorkShopSettings) {
        console.log(`[Craft] found: ${craftWorkShopSettings.title}`);
    } else {
        console.log(`[Craft] not found: ${craftWorkShopSettings}`);
    }

    // Load dynamic configurations like EXP_PER_CHARACTER and COOLDOWN_MILLISECONDS
    if (supabase) {
        console.log("[Config] Loading dynamic configurations from database...");
        try {
            const expCooldownConfig = await getConfig({ key: "exp_cooldown" });
            if (expCooldownConfig && expCooldownConfig.length > 0 && expCooldownConfig[0].value) {
                const newCooldown = parseInt(expCooldownConfig[0].value);
                if (!isNaN(newCooldown)) {
                    CONSTANTS.COOLDOWN_MILLISECONDS = newCooldown;
                    console.log(`[Config] EXP Cooldown successfully updated to: ${CONSTANTS.COOLDOWN_MILLISECONDS}ms`);
                } else {
                    console.warn(`[Config] Invalid value for exp_cooldown from DB: "${expCooldownConfig[0].value}". Using default: ${CONSTANTS.COOLDOWN_MILLISECONDS}ms`);
                }
            } else {
                console.log(`[Config] exp_cooldown not found or empty in DB. Using default: ${CONSTANTS.COOLDOWN_MILLISECONDS}ms`);
            }

            const expBaseConfig = await getConfig({ key: "exp_base" });
            if (expBaseConfig && expBaseConfig.length > 0 && expBaseConfig[0].value) {
                const newExpBase = parseFloat(expBaseConfig[0].value);
                if (!isNaN(newExpBase)) {
                    CONSTANTS.EXP_PER_CHARACTER = newExpBase;
                    console.log(`[Config] EXP per character successfully updated to: ${CONSTANTS.EXP_PER_CHARACTER}`);
                } else {
                    console.warn(`[Config] Invalid value for exp_base from DB: "${expBaseConfig[0].value}". Using default: ${CONSTANTS.EXP_PER_CHARACTER}`);
                }
            } else {
                console.log(`[Config] exp_base not found or empty in DB. Using default: ${CONSTANTS.EXP_PER_CHARACTER}`);
            }

            const expLevelingFactorConfig = await getConfig({ key: "exp_leveling_factor" }); // Use a dedicated key
            if (expLevelingFactorConfig && expLevelingFactorConfig.length > 0 && expLevelingFactorConfig[0].value) {
                const newLevelingFactor = parseInt(expLevelingFactorConfig[0].value); // Parse as integer
                if (!isNaN(newLevelingFactor)) {
                    CONSTANTS.LEVELING_FACTOR = newLevelingFactor;
                    console.log(`[Config] Leveling Factor successfully updated to: ${CONSTANTS.LEVELING_FACTOR}`);
                } else {
                    console.warn(`[Config] Invalid value for exp_leveling_factor from DB: "${expLevelingFactorConfig[0].value}". Using default: ${CONSTANTS.LEVELING_FACTOR}`);
                }
            } else {
                console.log(`[Config] exp_leveling_factor not found or empty in DB. Using default: ${CONSTANTS.LEVELING_FACTOR}`);
            }
        } catch (error) {
            console.error("[Config] Error loading dynamic configurations from database:", error);
            console.log(`[Config] Critical load failure. Using default values for EXP Cooldown (${CONSTANTS.COOLDOWN_MILLISECONDS}ms), EXP per character (${CONSTANTS.EXP_PER_CHARACTER}), and Leveling Factor (${CONSTANTS.LEVELING_FACTOR}).`);
        }
    } else {
        console.warn("[Config] Supabase not available at startup. Using default values for dynamic configurations.");
    }

    // Setup Hourly Monster Check
    if (supabase && announcementChannel) {
        console.log("Setting up hourly monster check...");
        await gameLogic.hourlyMonsterCheck(client, announcementChannel, currentMonsterStateRef); // Initial check on startup
        setInterval(() => gameLogic.hourlyMonsterCheck(client, announcementChannel, currentMonsterStateRef), CONSTANTS.HOURLY_CHECK_INTERVAL);
        console.log(`Hourly monster check scheduled every ${CONSTANTS.HOURLY_CHECK_INTERVAL / (60 * 1000)} minutes.`);
    } else {
        console.warn("Hourly monster check cannot be started: Supabase or Announcement Channel unavailable.");
    }
});

// --- Message Create Event ---
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // Command Handling
    if (message.content.toLowerCase().startsWith(CONSTANTS.COMMAND_PREFIX)) {
        const args = message.content.slice(CONSTANTS.COMMAND_PREFIX.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        switch (command) {
            case 'rank':
            case 'level':
                commandHandlers.handleRankCommand(message);
                break;
            // case 'leaderboard': // TODO: still need to be implemented more
            //     handleLeaderboardCommand(message, client);
            //     break;
            case 'shop':
                if (shopWorkShopSettings) {
                    shopWorkShopSettings = await handleShopCommand(message, shopWorkShopSettings);
                }
                break;
            case 'craft':
                if (craftWorkShopSettings) {
                    handleCraftCommand(message, craftWorkShopSettings);
                }
                break;
            // case 'chat': // useless ?
            //     commandHandlers.handleChatCommand(message, args);
            //     break;
            case 'bag':
                commandHandlers.handleBagCommand(message);
                // commandHandlers.handleBagPaginationCommand(message, false);
                break;
            case 'bag_dm':
                commandHandlers.handleBagPaginationCommand(message, true);
                break;
            case 'monster':
                commandHandlers.handleMonsterCommand(message, currentMonsterStateRef.current); // Pass current state
                break;
            case 'material':
                handleMaterialCommand(message); // Keep using the imported manager
                break;
            // Add other commands here with their respective 'case' and 'break;'
            // default:
            //     // Optionally handle unknown commands
            //     // message.reply(`Unknown command: ${command}`);
        }
    }
    // Non-Command Message Processing
    else {
        // --- ADD BOT MENTION CHECK HERE ---
        // Check if the bot user was specifically mentioned (not @everyone or a role)
        if (message.mentions.has(client.user) && !message.mentions.everyone) {
            // Select a random cat reply
            const randomIndex = Math.floor(Math.random() * CONSTANTS.catReplies.length);
            const replyText = CONSTANTS.catReplies[randomIndex];
            try {
                await message.reply(replyText);
                console.log(`[${message.author.username}] Mentioned the bot. Replied with: ${replyText}`);
            } catch (error) {
                console.error("Error sending cat reply:", error);
            }
            return;
        }
        // --- END BOT MENTION CHECK ---

        // Pass necessary dependencies and the state reference object
        gameLogic.handleExpGain(message, userCooldowns, announcementChannel, itemDropChannel, damageLogChannel, currentMonsterStateRef);
    }

    // Role Logging
    try {
        if (message?.guild?.members) {
            // Attempt to fetch the member if it's not already cached
            // const member = await message.guild.members.fetch(message.author.id);
            // Log the member's roles
            // member.roles.cache.forEach((role) => { console.log(`Role Name: ${role.name}, Role ID: ${role.id}`); });
        } else {
            // Handle when someone DMs the bot outside guild discord.
            message.reply("I'm a RPG bot live in **Dragon QueSSSt** discord. Please join the server to play with me!");
            return;
        }
    } catch (error) {
        console.error(`Could not fetch member ${message.author.id}:`, error);
    }
});

// set discord `client` event listener
client.on(Events.InteractionCreate, async (interaction) => {
    try {
        console.error("Events.InteractionCreate : start!", interaction.customId);
        if (
            interaction.isStringSelectMenu() &&
            interaction.customId.startsWith("shop_base") &&
            shopWorkShopSettings
        ) {
            console.log("[Shop] Click Button : ", interaction.customId);
            await handleShopSelectMenuClick(interaction, shopWorkShopSettings);
            return;
        }
        if (
            interaction.isButton() &&
            interaction.customId.startsWith("craft_") &&
            craftWorkShopSettings
        ) {
            console.log("[Craft] Click Button : ", interaction.customId);
            await handleCraftButtonClick(interaction, craftWorkShopSettings);
            return;
        }
        if (interaction.commandName === "send") {
            await handleSendCommand(interaction);
            return;
        }
    } catch (error) {
        console.error("Events.InteractionCreate : Failed!", error);
    }
});

// --- Login to Discord ---
if (TOKEN) {
    client.login(TOKEN);
} else {
    console.error("FATAL: Bot cannot login without DISCORD_TOKEN!");
}

// --- Handle Process Exit ---
process.on('exit', () => console.log('Bot shutting down.'));
process.on('SIGINT', () => { console.log('SIGINT received. Shutting down.'); process.exit(); });