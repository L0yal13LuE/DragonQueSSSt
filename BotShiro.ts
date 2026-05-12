import dotenv from 'dotenv';

dotenv.config({
  path: {
    blue: '.env.blue',
    development: '.env',
    staging: '.env.staging',
    production: '.env.production',
  }[process.env.NODE_ENV || 'development'],
});

import {
  Client,
  GatewayIntentBits,
  Collection,
  Events,
  Partials,
  type Message,
  type Interaction,
} from 'discord.js';
import supabase from './supabaseClient';
import * as constants from './constants';
import * as gameLogic from './gameLogic';
import * as announcements from './announcements';
import * as commandHandlers from './commandHandlers';
import * as cacheManager from './managers/cacheManager';
import { handleSendCommand } from './slashCommandHandler';
import { handleSpinCommand, handleSpinButton } from './managers/spinManager';
import { handleMaterialCommand } from './managers/materialManager';
import { handleLeaderboardCommand, handleLeaderboardPagination } from './managers/leaderboard/leaderboardManager';
import { handleAssembleButton, handleAssembleCommand } from './managers/game/assembleManager';
import { shopSettings, craftSettings, clanShopChannels, clanShopSetting, craftClanSettings } from './managers/shopWorkshop';
import { handleShopCommand, handleShopSelectMenuClick } from './managers/shopManager';
import { handleCraftCommand, handleCraftButtonClick, clanCraftChannels } from './managers/craftManager';
import { getConfig } from './providers/configProvider';
import { handleBagCommand, handleBagPaginationInteraction } from './managers/bagPaginationManager';
import { handleDonationListCommand, handleDonationListInteraction, handleDonateButtonClick } from './managers/clanDonationManager';
import { handleCraftListCommand, handleCraftListInteraction, handleCraftListButtonClick } from './managers/craftPaginationManager';
import { handlePetCommand } from './managers/petManager';

const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
  console.error('FATAL ERROR: DISCORD_TOKEN not found in .env file!');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.GuildMember,
    Partials.User,
  ],
});

const userCooldowns = new Collection<string, number>();

let currentMonsterStateRef: { current: any } = { current: null };

let shopWorkShopSettings: any = null;
let craftWorkShopSettings: any = null;
const clanShopSettingData = new Map<string, any>();
let clanCraftSettingData: any[] = [];

client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user!.tag}!`);

  await announcements.initializeBotChannels(client);

  cacheManager.resetCachedDataOnStartUp();
  cacheManager.setCachedDataOnStartUp();

  async function refreshShopSettings() {
    shopWorkShopSettings = await shopSettings('1367030652834283590', client);
    if (shopWorkShopSettings) {
      console.log(`[Shop] found/refreshed: ${shopWorkShopSettings.title}`);
    } else {
      console.log(`[Shop] not found: ${shopWorkShopSettings}`);
      shopWorkShopSettings = null;
    }
  }
  refreshShopSettings();
  setInterval(refreshShopSettings, 60 * 60 * 1000);

  craftWorkShopSettings = await craftSettings('!craft', client);
  if (craftWorkShopSettings) {
    console.log(`[Craft] found: ${craftWorkShopSettings.title}`);
  } else {
    console.log(`[Craft] not found: ${craftWorkShopSettings}`);
  }

  if (supabase) {
    console.log('[Config] Loading dynamic configurations from database...');
    try {
      const expCooldownConfig = await getConfig({ key: 'exp_cooldown' });
      if (expCooldownConfig && expCooldownConfig.length > 0 && expCooldownConfig[0].value) {
        const newCooldown = parseInt(expCooldownConfig[0].value);
        if (!isNaN(newCooldown)) {
          (constants as any).COOLDOWN_MILLISECONDS = newCooldown;
          console.log(`[Config] EXP Cooldown successfully updated to: ${constants.COOLDOWN_MILLISECONDS}ms`);
        } else {
          console.warn(`[Config] Invalid value for exp_cooldown from DB: "${expCooldownConfig[0].value}". Using default: ${constants.COOLDOWN_MILLISECONDS}ms`);
        }
      } else {
        console.log(`[Config] exp_cooldown not found or empty in DB. Using default: ${constants.COOLDOWN_MILLISECONDS}ms`);
      }

      const expBaseConfig = await getConfig({ key: 'exp_base' });
      if (expBaseConfig && expBaseConfig.length > 0 && expBaseConfig[0].value) {
        const newExpBase = parseFloat(expBaseConfig[0].value);
        if (!isNaN(newExpBase)) {
          (constants as any).EXP_PER_CHARACTER = newExpBase;
          console.log(`[Config] EXP per character successfully updated to: ${constants.EXP_PER_CHARACTER}`);
        } else {
          console.warn(`[Config] Invalid value for exp_base from DB: "${expBaseConfig[0].value}". Using default: ${constants.EXP_PER_CHARACTER}`);
        }
      } else {
        console.log(`[Config] exp_base not found or empty in DB. Using default: ${constants.EXP_PER_CHARACTER}`);
      }

      const expLevelingFactorConfig = await getConfig({ key: 'exp_leveling_factor' });
      if (expLevelingFactorConfig && expLevelingFactorConfig.length > 0 && expLevelingFactorConfig[0].value) {
        const newLevelingFactor = parseInt(expLevelingFactorConfig[0].value);
        if (!isNaN(newLevelingFactor)) {
          (constants as any).LEVELING_FACTOR = newLevelingFactor;
          console.log(`[Config] Leveling Factor successfully updated to: ${constants.LEVELING_FACTOR}`);
        } else {
          console.warn(`[Config] Invalid value for exp_leveling_factor from DB: "${expLevelingFactorConfig[0].value}". Using default: ${constants.LEVELING_FACTOR}`);
        }
      } else {
        console.log(`[Config] exp_leveling_factor not found or empty in DB. Using default: ${constants.LEVELING_FACTOR}`);
      }
    } catch (error) {
      console.error('[Config] Error loading dynamic configurations from database:', error);
      console.log(`[Config] Critical load failure. Using default values for EXP Cooldown (${constants.COOLDOWN_MILLISECONDS}ms), EXP per character (${constants.EXP_PER_CHARACTER}), and Leveling Factor (${constants.LEVELING_FACTOR}).`);
    }
  } else {
    console.warn('[Config] Supabase not available at startup. Using default values for dynamic configurations.');
  }

  if (supabase) {
    try {
      console.log('Setting up hourly monster check...');
      await gameLogic.hourlyMonsterCheck(client, currentMonsterStateRef);
      setInterval(
        () => gameLogic.hourlyMonsterCheck(client, currentMonsterStateRef),
        constants.HOURLY_CHECK_INTERVAL
      );
      console.log(`Hourly monster check scheduled every ${constants.HOURLY_CHECK_INTERVAL / (60 * 1000)} minutes.`);
    } catch (error) {
      console.error('Error setting up hourly monster check:', error);
    }
  } else {
    console.warn('Hourly monster check cannot be started: Supabase or Announcement Channel unavailable.');
  }

  const clanNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
  const clanNumbersInitial: { clanNumber: number; channels: any[] }[] = [];
  await Promise.all(
    clanNumbers.map(async (clanNumber) => {
      const channelsCraft = await clanCraftChannels(clanNumber);
      if (channelsCraft && channelsCraft.length > 0) {
        const craftSettingPromises = channelsCraft.map(async (row: any) => {
          const craftSetting = await craftClanSettings(row, clanNumber);
          return { ...row, setting: craftSetting };
        });
        const allMappedCraftData = await Promise.all(craftSettingPromises);
        clanCraftSettingData.push(...allMappedCraftData);
      }

      const channels = await clanShopChannels(clanNumber);
      if (channels && channels.length > 0) {
        await Promise.all(
          channels.map(async (channelID: string) => {
            const shopSetting = await clanShopSetting(channelID, clanNumber);
            if (shopSetting) {
              clanShopSettingData.set(channelID, shopSetting);
            } else {
              clanShopSettingData.delete(channelID);
            }
          })
        );

        clanNumbersInitial.push({ clanNumber, channels });
      }
    })
  );
});

client.on('messageCreate', async (message: Message) => {
  if (message.author.bot) return;
  if (!message.channel) return;

  if (message.content.toLowerCase().startsWith(constants.COMMAND_PREFIX)) {
    const args = message.content
      .slice(constants.COMMAND_PREFIX.length)
      .trim()
      .split(/ +/);
    const command = args.shift()!.toLowerCase();

    switch (command) {
      case 'rank':
      case 'level':
        commandHandlers.handleRankCommand(message);
        break;
      case 'shop':
        if (clanShopSettingData.has(message.channel.id)) {
          const shopClanInitData = clanShopSettingData.get(message.channel.id);
          if (shopClanInitData && shopClanInitData.items.length > 0) {
            await handleShopCommand(message, shopClanInitData);
            return;
          }
        }
        if (shopWorkShopSettings) {
          await handleShopCommand(message, shopWorkShopSettings);
          return;
        }
        break;
      case 'bag':
        await commandHandlers.handleBagCommand(message);
        break;
      case 'newbag':
      case 'bagnew':
        await handleBagCommand(message, false);
        break;
      case 'bagdm':
      case 'bag_dm':
        await commandHandlers.handleBagPaginationCommand(message, true);
        break;
      case 'donate':
      case 'donation':
        const channelClanNumber = clanShopSettingData.get(message.channel.id)?.clanNumber;
        const donationChannelClanObj = clanCraftSettingData.find(
          (row: any) => row.channel_id == message.channel.id
        );
        const donationClanNumber = donationChannelClanObj && donationChannelClanObj.setting
          ? donationChannelClanObj.setting.clanNumber
          : 0;
        const clanNumber = Math.max(channelClanNumber || 0, donationClanNumber);
        if (clanNumber > 0) {
          console.log(`[Clan] Opened Clan Donation in S${clanNumber} Channel`);
          await handleDonationListCommand(message, clanNumber);
        } else {
          message.reply('You must be in clan channel to use this command.');
        }
        break;
      case 'craft':
        const craftInClanB = clanCraftSettingData.find(
          (row: any) => row.channel_id == message.channel.id
        );
        if (craftInClanB && craftInClanB.setting && craftInClanB.setting.items.length > 0) {
          await handleCraftListCommand(message, craftInClanB.setting);
          return;
        } else {
          if (craftWorkShopSettings) {
            await handleCraftListCommand(message, craftWorkShopSettings);
          } else {
            message.reply('Craft command is not available right now.');
          }
        }
        break;
    }
  } else {
    if (message.mentions.has(client.user!) && !message.mentions.everyone) {
      const randomIndex = Math.floor(Math.random() * constants.catReplies.length);
      const replyText = constants.catReplies[randomIndex];
      try {
        await message.reply(replyText);
      } catch (error) {
        console.error('Error sending cat reply:', error);
      }
      return;
    }

    await gameLogic.handleExpGain(message, userCooldowns, currentMonsterStateRef);
  }

  try {
    if (message?.guild?.members) {
      // no-op kept for structure
    } else {
      message.reply('I\'m a RPG bot live in **Dragon QueSSSt** discord. Please join the server to play with me!');
      return;
    }
  } catch (error) {
    console.error(`Could not fetch member ${message.author.id}:`, error);
  }
});

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  try {
    if ((interaction.isButton() || interaction.isStringSelectMenu()) && interaction.customId) {
      console.error('Events.InteractionCreate : start!', interaction.customId);
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('shop_base') && shopWorkShopSettings) {
      if (clanShopSettingData && clanShopSettingData.has(interaction.channelId)) {
        const shopClanInitData = clanShopSettingData.get(interaction.channelId);
        if (shopClanInitData && shopClanInitData.items.length > 0) {
          await handleShopSelectMenuClick(interaction, shopClanInitData);
          return;
        }
      }
      await handleShopSelectMenuClick(interaction, shopWorkShopSettings);
      return;
    }

    const buttonHandlers = [
      {
        prefix: constants.CACHE_LEADERBOARD_POINT_PREFIX,
        handler: (i: any) => handleLeaderboardPagination(i, constants.CACHE_LEADERBOARD_POINT_PREFIX),
      },
      {
        prefix: constants.CACHE_LEADERBOARD_MONSTER_KILL_PREFIX,
        handler: (i: any) => handleLeaderboardPagination(i, constants.CACHE_LEADERBOARD_MONSTER_KILL_PREFIX),
      },
      {
        prefix: 'donationlist_nav_',
        handler: (i: any) => handleDonationListInteraction(i, clanShopSettingData, clanCraftSettingData),
      },
      {
        prefix: 'donationitem_',
        handler: (i: any) => {
          console.log('[Donate] Click Button:', i.customId);
          return handleDonateButtonClick(i, clanShopSettingData, clanCraftSettingData);
        },
      },
      {
        prefix: 'craft_',
        handler: (i: any) => {
          if (craftWorkShopSettings) {
            console.log('[Craft] Click Button:', i.customId);
            return handleCraftButtonClick(i, craftWorkShopSettings);
          }
        },
      },
      {
        prefix: 'craftclan_',
        handler: (i: any) => {
          if (!craftWorkShopSettings) return;
          const craftInClan = clanCraftSettingData.find(
            (row: any) => row.channel_id === i.channelId
          );
          if (craftInClan?.setting?.items?.length > 0) {
            console.log('[CraftClan] Click Button:', i.customId);
            return handleCraftButtonClick(i, craftInClan.setting);
          }
        },
      },
      {
        prefix: 'craftlist_nav_',
        handler: (i: any) => handleCraftListInteraction(i, clanShopSettingData, clanCraftSettingData),
      },
      {
        prefix: 'crafitem_',
        handler: (i: any) => handleCraftListButtonClick(i, clanShopSettingData, clanCraftSettingData),
      },
      {
        prefix: 'bag_nav_',
        handler: (i: any) => handleBagPaginationInteraction(i),
      },
      {
        prefix: 'SPIN',
        handler: (i: any) => handleSpinButton(i),
      },
      {
        prefix: 'ASSEMBLE',
        handler: (i: any) => handleAssembleButton(i),
      },
    ];

    if (interaction.isButton()) {
      const matched = buttonHandlers.find((h) => interaction.customId.startsWith(h.prefix));
      if (matched) {
        await matched.handler(interaction);
      }
      return;
    }

    if (interaction.isChatInputCommand()) {
      switch (interaction.commandName) {
        case 'droprate':
          await handleMaterialCommand(interaction);
          break;
        case 'send':
          await handleSendCommand(interaction);
          break;
        case 'leaderboard':
          await handleLeaderboardCommand(interaction);
          break;
        case 'monster-status':
          await commandHandlers.handleMonsterCommand(interaction, currentMonsterStateRef.current);
          break;
        case 'game-spin':
          await handleSpinCommand(interaction);
          break;
        case 'game-assemble-xx':
          await handleAssembleCommand(interaction);
          break;
        case 'pet':
          await handlePetCommand(interaction);
          break;
      }
    }
  } catch (error) {
    console.error('Events.InteractionCreate : Failed!', error);
  }
});

if (TOKEN) {
  client.login(TOKEN);
} else {
  console.error('FATAL: Bot cannot login without DISCORD_TOKEN!');
}

process.on('exit', () => console.log('Bot shutting down.'));
process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down.');
  process.exit();
});
