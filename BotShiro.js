require("dotenv").config({
  path: {
    blue: ".env.blue",
    development: ".env",
    staging: ".env.staging",
    production: ".env.production",
  }[process.env.NODE_ENV || "development"],
});

const {
  Client,
  GatewayIntentBits,
  Collection,
  Events,
  Partials,
} = require("discord.js");
const { supabase } = require("./supabaseClient"); // Import supabase client

// --- Internal Modules ---
const CONSTANTS = require("./constants");
const gameLogic = require("./gameLogic"); // Assuming core game logic functions are here
const announcements = require("./announcements"); // Assuming announcement functions are here
const commandHandlers = require("./commandHandlers"); // Assuming command handlers are here
const cacheManager = require("./managers/cacheManager");

// --- Command Handlers ---
const {
  handleSpinCommand,
  handleSpinButton,
} = require("./managers/spinManager.js"); // Import the spin command handler
const { handleMaterialCommand } = require("./managers/materialManager.js");
const {
  handleLeaderboardCommand,
  handleLeaderboardPagination,
} = require("./managers/leaderboard/leaderboardManager.js");
const {
  handleAssembleButton,
  handleAssembleCommand
} = require("./managers/game/assembleManager.js");

const {
  shopSettings,
  craftSettings,
  clanShopChannels,
  clanShopSetting,
  craftClanSettings,
} = require("./managers/shopWorkshop.js");
const {
  handleShopCommand,
  handleShopSelectMenuClick,
} = require("./managers/shopManager.js");
const {
  handleCraftCommand,
  handleCraftButtonClick,
  clanCraftChannels,
} = require("./managers/craftManager.js");
const { getConfig } = require("./providers/configProvider.js"); // For loading dynamic configs
const { handleSendCommand } = require("./slashCommandHandler.js");
const {
  handleBagCommand,
  handleBagPaginationInteraction,
} = require("./managers/bagPaginationManager.js");
// const { resetCachedDataOnStartUp, setCachedDataOnStartUp } = require('./managers/cacheManager.js');
const {
  handleDonationListCommand,
  handleDonationListInteraction,
  handleDonateButtonClick,
} = require("./managers/clanDonationManager.js");
const {
  handleCraftListCommand,
  handleCraftListInteraction,
  handleCraftListButtonClick,
} = require("./managers/craftPaginationManager.js");
const fortuneTeller = require('./managers/fortuneTeller'); 
const {
  handlePetCommand
} = require("./managers/petManager.js");

// --- Configuration ---
const TOKEN = process.env.DISCORD_TOKEN;

// --- Configuration Validation ---
if (!TOKEN) {
  console.error("FATAL ERROR: DISCORD_TOKEN not found in .env file!");
  process.exit(1);
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
    Partials.User,
  ],
});

// --- Caches and State ---
const userCooldowns = new Collection();

// Use a reference object for currentMonsterState so modules can update it
let currentMonsterStateRef = { current: null };

// -- Shop instance
let shopWorkShopSettings = null;
let craftWorkShopSettings = null;
const clanShopSettingData = new Map();
let clanCraftSettingData = [];

// --- Bot Ready Event ---
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  // Initialize Bot Channels
  await announcements.initializeBotChannels(client);

  // Set up cache
  cacheManager.resetCachedDataOnStartUp();
  cacheManager.setCachedDataOnStartUp();

  // Spawn shop npc, spawn at certain channel but available on every channel
  async function refreshShopSettings() {
    shopWorkShopSettings = await shopSettings("1367030652834283590", client);
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
  craftWorkShopSettings = await craftSettings("!craft", client);
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
      if (
        expCooldownConfig &&
        expCooldownConfig.length > 0 &&
        expCooldownConfig[0].value
      ) {
        const newCooldown = parseInt(expCooldownConfig[0].value);
        if (!isNaN(newCooldown)) {
          CONSTANTS.COOLDOWN_MILLISECONDS = newCooldown;
          console.log(
            `[Config] EXP Cooldown successfully updated to: ${CONSTANTS.COOLDOWN_MILLISECONDS}ms`
          );
        } else {
          console.warn(
            `[Config] Invalid value for exp_cooldown from DB: "${expCooldownConfig[0].value}". Using default: ${CONSTANTS.COOLDOWN_MILLISECONDS}ms`
          );
        }
      } else {
        console.log(
          `[Config] exp_cooldown not found or empty in DB. Using default: ${CONSTANTS.COOLDOWN_MILLISECONDS}ms`
        );
      }

      const expBaseConfig = await getConfig({ key: "exp_base" });
      if (expBaseConfig && expBaseConfig.length > 0 && expBaseConfig[0].value) {
        const newExpBase = parseFloat(expBaseConfig[0].value);
        if (!isNaN(newExpBase)) {
          CONSTANTS.EXP_PER_CHARACTER = newExpBase;
          console.log(
            `[Config] EXP per character successfully updated to: ${CONSTANTS.EXP_PER_CHARACTER}`
          );
        } else {
          console.warn(
            `[Config] Invalid value for exp_base from DB: "${expBaseConfig[0].value}". Using default: ${CONSTANTS.EXP_PER_CHARACTER}`
          );
        }
      } else {
        console.log(
          `[Config] exp_base not found or empty in DB. Using default: ${CONSTANTS.EXP_PER_CHARACTER}`
        );
      }

      const expLevelingFactorConfig = await getConfig({
        key: "exp_leveling_factor",
      }); // Use a dedicated key
      if (
        expLevelingFactorConfig &&
        expLevelingFactorConfig.length > 0 &&
        expLevelingFactorConfig[0].value
      ) {
        const newLevelingFactor = parseInt(expLevelingFactorConfig[0].value); // Parse as integer
        if (!isNaN(newLevelingFactor)) {
          CONSTANTS.LEVELING_FACTOR = newLevelingFactor;
          console.log(
            `[Config] Leveling Factor successfully updated to: ${CONSTANTS.LEVELING_FACTOR}`
          );
        } else {
          console.warn(
            `[Config] Invalid value for exp_leveling_factor from DB: "${expLevelingFactorConfig[0].value}". Using default: ${CONSTANTS.LEVELING_FACTOR}`
          );
        }
      } else {
        console.log(
          `[Config] exp_leveling_factor not found or empty in DB. Using default: ${CONSTANTS.LEVELING_FACTOR}`
        );
      }
    } catch (error) {
      console.error(
        "[Config] Error loading dynamic configurations from database:",
        error
      );
      console.log(
        `[Config] Critical load failure. Using default values for EXP Cooldown (${CONSTANTS.COOLDOWN_MILLISECONDS}ms), EXP per character (${CONSTANTS.EXP_PER_CHARACTER}), and Leveling Factor (${CONSTANTS.LEVELING_FACTOR}).`
      );
    }
  } else {
    console.warn(
      "[Config] Supabase not available at startup. Using default values for dynamic configurations."
    );
  }

  // Setup Hourly Monster Check
  if (supabase) {
    try {
      console.log("Setting up hourly monster check...");
      await gameLogic.hourlyMonsterCheck(client, currentMonsterStateRef); // Initial check on startup
      setInterval(
        () => gameLogic.hourlyMonsterCheck(client, currentMonsterStateRef),
        CONSTANTS.HOURLY_CHECK_INTERVAL
      );
      console.log(
        `Hourly monster check scheduled every ${
          CONSTANTS.HOURLY_CHECK_INTERVAL / (60 * 1000)
        } minutes.`
      );
    } catch (error) {
      console.error("Error setting up hourly monster check:", error);
    }
  } else {
    console.warn(
      "Hourly monster check cannot be started: Supabase or Announcement Channel unavailable."
    );
  }

  // Spawn clan shop from s1-s24
  const clanNumbers = [
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
      22, 23, 24,
    ],
    clanNumbersInitial = [];
  await Promise.all(
    clanNumbers.map(async (clanNumber) => {
      // fetch craft channel for each clan
      const channelsCraft = await clanCraftChannels(clanNumber);
      if (channelsCraft && channelsCraft.length > 0) {
        const craftSettingPromises = channelsCraft.map(async (row) => {
          const craftSetting = await craftClanSettings(row, clanNumber);
          return { ...row, setting: craftSetting };
        });
        const allMappedCraftData = await Promise.all(craftSettingPromises);
        clanCraftSettingData.push(...allMappedCraftData);
      }

      // fetch channel for each clan
      const channels = await clanShopChannels(clanNumber);
      if (channels && channels.length > 0) {
        // fetch shop data for each channel in clan
        await Promise.all(
          channels.map(async (channelID) => {
            const shopSetting = await clanShopSetting(channelID, clanNumber);
            if (shopSetting) {
              clanShopSettingData.set(channelID, shopSetting);
            } else clanShopSettingData.delete(channelID);
          })
        );

        // save staged data (for counting)
        clanNumbersInitial.push({ clanNumber, channels });
      }
    })
  );
  //console.log(`[Clan Craft] : Loaded ${clanCraftSettingData.length} items.`);
  //console.log(`[Clan Shop] : Loaded ${clanNumbersInitial.length} items.`);
});

// --- Message Create Event ---
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // Command Handling
  if (message.content.toLowerCase().startsWith(CONSTANTS.COMMAND_PREFIX)) {
    const args = message.content
      .slice(CONSTANTS.COMMAND_PREFIX.length)
      .trim()
      .split(/ +/);
    const command = args.shift().toLowerCase();

    switch (command) {
      case "rank":
      case "level":
        commandHandlers.handleRankCommand(message);
        break;
      case "shop":
        // check if message channel id matching clan shop settiings channel ids
        if (clanShopSettingData.has(message.channel.id)) {
          const shopClanInitData = clanShopSettingData.get(message.channel.id);
          if (shopClanInitData && shopClanInitData.items.length > 0) {
            await handleShopCommand(message, shopClanInitData);
            return;
          }
        }
        // somehow shop clan command is not valid -> try normal shop command
        if (shopWorkShopSettings) {
          await handleShopCommand(message, shopWorkShopSettings);
          return;
        }
        break;
      case "bag":
        await commandHandlers.handleBagCommand(message);
        break;
      case "newbag":
      case "bagnew":
        await handleBagCommand(message, false);
        break;
      case "bagdm":
      case "bag_dm":
        await commandHandlers.handleBagPaginationCommand(message, true);
        break;
      case "donate":
      case "donation":
        const channelClanNumber = clanShopSettingData.get(
          message.channel.id
        )?.clanNumber;
        const donationChannelClanObj = clanCraftSettingData.find(
          (row) => row.channel_id == message.channel.id
        );
        const donationClanNumber =
          donationChannelClanObj && donationChannelClanObj.setting
            ? donationChannelClanObj.setting.clanNumber
            : 0;
        const clanNumber = Math.max(channelClanNumber || 0, donationClanNumber);
        if (clanNumber > 0) {
          console.log(`[Clan] Opened Clan Donation in S${clanNumber} Channel`);
          await handleDonationListCommand(message, clanNumber);
        } else {
          message.reply("You must be in clan channel to use this command.");
        }
        break;
      case "craft": // new craft with pagination
        const craftInClanB = clanCraftSettingData.find(
          (row) => row.channel_id == message.channel.id
        );
        if (
          craftInClanB &&
          craftInClanB.setting &&
          craftInClanB.setting.items.length > 0
        ) {
          // in clan
          await handleCraftListCommand(message, craftInClanB.setting);
          return;
        } else {
          // in normal
          if (craftWorkShopSettings)
            await handleCraftListCommand(message, craftWorkShopSettings);
          else message.reply(`Craft command is not available right now.`);
        }
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
      // const randomIndex = Math.floor(
      //   Math.random() * CONSTANTS.catReplies.length
      // );
      // const replyText = CONSTANTS.catReplies[randomIndex];
      // try {
      //   await message.reply(replyText);
      //   console.log(
      //     `[${message.author.username}] Mentioned the bot. Replied with: ${replyText}`
      //   );
      // } catch (error) {
      //   console.error("Error sending cat reply:", error);
      // }
      // return;

      // New AI calling perk
      // Enqueue the request using the exported function
      const currentQueueSize = fortuneTeller.enqueueRequest(message);
      console.log(`[Fortune] Added request from ${message.author.tag} to the queue. Queue length: ${currentQueueSize}`);
      if (currentQueueSize > 1 && !fortuneTeller.getIsProcessingQueue()) {
          await message.reply("⏳ I'm currently consulting the celestial spheres for another's destiny. Please wait a moment, I'll get to your fortune as soon as possible!");
      } else if (!fortuneTeller.getIsProcessingQueue()) {
          await message.channel.sendTyping(); 
      }
      fortuneTeller.processQueue();
    }
    // --- END BOT MENTION CHECK ---

    // Pass necessary dependencies and the state reference object
    await gameLogic.handleExpGain(
      message,
      userCooldowns,
      currentMonsterStateRef
    );
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
      message.reply(
        "I'm a RPG bot live in **Dragon QueSSSt** discord. Please join the server to play with me!"
      );
      return;
    }
  } catch (error) {
    console.error(`Could not fetch member ${message.author.id}:`, error);
  }
});

// set discord `client` event listener
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.customId)
      console.error("Events.InteractionCreate : start!", interaction.customId);
    if (
      interaction.isStringSelectMenu() &&
      interaction.customId.startsWith("shop_base") &&
      shopWorkShopSettings
    ) {
      // check if button is in clan shop
      if (
        clanShopSettingData &&
        clanShopSettingData.has(interaction.channelId)
      ) {
        const shopClanInitData = clanShopSettingData.get(interaction.channelId);
        if (shopClanInitData && shopClanInitData.items.length > 0) {
          await handleShopSelectMenuClick(interaction, shopClanInitData);
          return;
        }
      }
      // button is not in clan shop
      await handleShopSelectMenuClick(interaction, shopWorkShopSettings);
      return;
    }

    // Button Case
    const buttonHandlers = [
      {
        prefix: CONSTANTS.CACHE_LEADERBOARD_POINT_PREFIX,
        handler: (i) =>
          handleLeaderboardPagination(
            i,
            CONSTANTS.CACHE_LEADERBOARD_POINT_PREFIX
          ),
      },
      {
        prefix: CONSTANTS.CACHE_LEADERBOARD_MONSTER_KILL_PREFIX,
        handler: (i) =>
          handleLeaderboardPagination(
            i,
            CONSTANTS.CACHE_LEADERBOARD_MONSTER_KILL_PREFIX
          ),
      },
      {
        prefix: "donationlist_nav_",
        handler: (i) =>
          handleDonationListInteraction(
            i,
            clanShopSettingData,
            clanCraftSettingData
          ),
      },
      {
        prefix: "donationitem_",
        handler: (i) => {
          console.log("[Donate] Click Button:", i.customId);
          return handleDonateButtonClick(
            i,
            clanShopSettingData,
            clanCraftSettingData
          );
        },
      },
      {
        prefix: "craft_",
        handler: (i) => {
          if (craftWorkShopSettings) {
            console.log("[Craft] Click Button:", i.customId);
            return handleCraftButtonClick(i, craftWorkShopSettings);
          }
        },
      },
      {
        prefix: "craftclan_",
        handler: (i) => {
          if (!craftWorkShopSettings) return;
          const craftInClan = clanCraftSettingData.find(
            (row) => row.channel_id === i.channelId
          );
          if (craftInClan?.setting?.items?.length > 0) {
            console.log("[CraftClan] Click Button:", i.customId);
            return handleCraftButtonClick(i, craftInClan.setting);
          }
        },
      },
      {
        prefix: "craftlist_nav_",
        handler: (i) =>
          handleCraftListInteraction(
            i,
            clanShopSettingData,
            clanCraftSettingData
          ),
      },
      {
        prefix: "crafitem_",
        handler: (i) =>
          handleCraftListButtonClick(
            i,
            clanShopSettingData,
            clanCraftSettingData
          ),
      },
      {
        prefix: "bag_nav_",
        handler: (i) => handleBagPaginationInteraction(i),
      },
      {
        prefix: "SPIN",
        handler: (i) => handleSpinButton(i),
      },
      {
        prefix: "ASSEMBLE",
        handler: (i) => handleAssembleButton(i),
      },
    ];

    // Usage
    if (interaction.isButton()) {
      const matched = buttonHandlers.find((h) =>
        interaction.customId.startsWith(h.prefix)
      );
      if (matched) {
        await matched.handler(interaction);
      }
      return;
    }

    // Submit case
    switch (interaction.commandName) {
      case "droprate":
        await handleMaterialCommand(interaction);
        break;
      case "send":
        await handleSendCommand(interaction); // Keep using the imported manager
        break;
      case "leaderboard":
        await handleLeaderboardCommand(interaction); // Keep using the imported manager
        break;
      case "monster-status":
        await commandHandlers.handleMonsterCommand(
          interaction,
          currentMonsterStateRef.current
        ); // Keep using the imported manager
        break;
      case "game-spin":
        await handleSpinCommand(interaction); // Keep using the imported manager
        break;
      case "game-assemble-xx":
        await handleAssembleCommand(interaction); // Keep using the imported manager
        break;
      case "pet":
        await handlePetCommand(interaction); // Handle pet command
        break;
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
process.on("exit", () => console.log("Bot shutting down."));
process.on("SIGINT", () => {
  console.log("SIGINT received. Shutting down.");
  process.exit();
});
