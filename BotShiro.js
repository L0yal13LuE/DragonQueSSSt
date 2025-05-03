const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({
    path: {
      development: '.env',
      staging: '.env.staging',
      production: '.env.production'
    }[process.env.NODE_ENV || 'development']
  });

// --- Internal Modules ---
const CONSTANTS = require('./constants');
const dbUtils = require('./dbUtils'); // Assuming all DB functions are exported from here
const gameLogic = require('./gameLogic'); // Assuming core game logic functions are here
const announcements = require('./announcements'); // Assuming announcement functions are here
const commandHandlers = require('./commandHandlers'); // Assuming command handlers are here

// --- Command Handlers ---
const { handleSpinCommand } = require('./managers/spinManager.js'); // Import the spin command handler

// --- Configuration ---
const TOKEN = process.env.DISCORD_TOKEN;
const ANNOUNCEMENT_CHANNEL_ID = process.env.ANNOUNCEMENT_CHANNEL_ID; // For level-ups ONLY

const CHANNEL_ID_1 = ANNOUNCEMENT_CHANNEL_ID; 

// Supabase Configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// --- Configuration Validation ---
if (!TOKEN) {
    console.error('FATAL ERROR: DISCORD_TOKEN not found in .env file!');
    process.exit(1);
}

if (!ANNOUNCEMENT_CHANNEL_ID) {
    console.error('WARNING: ANNOUNCEMENT_CHANNEL_ID not found in .env file!');
    console.warn('Level-up announcements will not be sent to a dedicated channel.');
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('WARNING: Supabase URL or Anon Key not found in .env file!');
    console.error('Database functionality will be limited or unavailable.');
}

// --- Initialize Discord Client ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages, // Optional
    ],
});

// --- Initialize Supabase Client ---
const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY) ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// --- Caches and State ---
const userCooldowns = new Collection();
let announcementChannel = null;

// Use a reference object for currentMonsterState so modules can update it
let currentMonsterStateRef = { current: null };

// --- Bot Ready Event ---
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    console.log(`Supabase client initialized: ${!!supabase}`);

    // Fetch Channel Objects
    if (ANNOUNCEMENT_CHANNEL_ID) {
        try {
            announcementChannel = await client.channels.fetch(ANNOUNCEMENT_CHANNEL_ID);
            if (announcementChannel) console.log(`Announcement channel found: ${announcementChannel.name}`);
            else console.error(`Could not find announcement channel: ${ANNOUNCEMENT_CHANNEL_ID}`);
        } catch (error) { console.error(`Error fetching announcement channel:`, error); announcementChannel = null; }
    }

    // Send Online Announcement
    if (announcementChannel) {
        await announcements.sendOnlineAnnouncement(announcementChannel);
    } else {
        console.warn("Announcement channel unavailable, cannot send online announcement.");
    }

    // Setup Hourly Monster Check
    if (supabase && announcementChannel) {
        console.log("Setting up hourly monster check...");
        await gameLogic.hourlyMonsterCheck(supabase, client, announcementChannel, currentMonsterStateRef); // Initial check on startup
        setInterval(() => gameLogic.hourlyMonsterCheck(supabase, client, announcementChannel, currentMonsterStateRef), CONSTANTS.HOURLY_CHECK_INTERVAL);
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

        if (command === 'rank' || command === 'level') commandHandlers.handleRankCommand(message, supabase);
        else if (command === 'chat') commandHandlers.handleChatCommand(message, args);
        else if (command === 'bag') commandHandlers.handleBagCommand(message, supabase);
        else if (command === 'monster') commandHandlers.handleMonsterCommand(message, supabase, currentMonsterStateRef.current); // Pass current state
        else if (command === 'spin') handleSpinCommand(message, supabase); // Keep using the imported manager
        // Add other commands here
    }
    // Non-Command Message Processing
    else {
        // --- ADD BOT MENTION CHECK HERE ---
        // Check if the bot user was specifically mentioned (not @everyone or a role)
        if (message.mentions.has(client.user)) {
            // Select a random cat reply
            const randomIndex = Math.floor(Math.random() * CONSTANTS.catReplies.length);
            const replyText = CONSTANTS.catReplies[randomIndex];

            try {
                // Reply to the user's message
                await message.reply(replyText);
                console.log(`[${message.author.username}] Mentioned the bot. Replied with: ${replyText}`);
            } catch (error) {
                console.error("Error sending cat reply:", error);
            }
            // Stop further processing (like EXP gain) for this message after replying
            return;
        }
        // --- END BOT MENTION CHECK ---

        // If not mentioned, proceed with normal EXP gain logic
        // Add Supabase check back here specifically for EXP gain
        if (!supabase) {
            // console.log("Supabase not available, skipping EXP gain."); // Can be noisy
            return;
        }
        // Pass necessary dependencies and the state reference object
        gameLogic.handleExpGain(message, supabase, userCooldowns, announcementChannel, currentMonsterStateRef);
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