// --- Constants ---
const COMMAND_PREFIX = "!";
const HOURLY_CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour in milliseconds

const CACHE_RARITIES_PREFIX = "RARITIES";
const CACHE_RARITIES_TTL = 60 * 60 * 1000; // 1 hour

const CACHE_CHANNEL_PREFIX = "CHANNEL";
const CACHE_CHANNEL_TTL = 60 * 60 * 1000; // 1 hour

const CACHE_MATERIAL_CHANNEL_PREFIX = "MATERIAL_CHANNEL";
const CACHE_MATERIAL_CHANNEL_TTL_MS = 60 * 60 * 1000; // 1 hour

const CACHE_USER_BAG_PREFIX = "USER_BAG";
const CACHE_USER_BAG_TTL_MS = 60 * 60 * 1000; // 1 hour

const CACHE_LEADERBOARD_POINT_PREFIX = "LEADERBOARD_POINT";
const CACHE_LEADERBOARD_VALUE_TTL_MS = 60 * 60 * 1000; // 1 hour

const CACHE_LEADERBOARD_MONSTER_KILL_PREFIX = "LEADERBOARD_MONSTER_KILL";
const CACHE_LEADERBOARD_MONSTER_KILL_TTL_MS = 60 * 60 * 1000; // 1 hour

const CACHE_ASSEMBLE_PREFIX = "ASSEMBLE";
const CACHE_ASSEMBLE_TTL_MS = 60 * 60 * 1000; // 1 hour

let COOLDOWN_MILLISECONDS = 5 * 1000;
let EXP_PER_CHARACTER = 1;
let LEVELING_FACTOR = 10;
let ANNOUNCEMENT_CHANNEL_ID = 1366780291380678737;

const GET_CHANCE = function (chancePercentage) {
  if (typeof chancePercentage !== 'number' || chancePercentage < 0 || chancePercentage > 100) {
    console.error("Invalid input: Please provide a number between 0 and 100.");
    return false;
  }
  const probability = chancePercentage / 100;
  return Math.random() < probability;
}

// --- Cat Language Replies ---
const catReplies = [
  "Meow?",
  "Meeeow...",
  "*tilts head* Mrrr?",
  "Purrrr... Zzzz...",
  "*nuzzles* Meow!",
  "Puuuuurrrrrrrrrrr...",
  "Meow meow!",
  "*blinks slowly*",
  "Mrow?",
  "What is it, human? Meow?",
  "Calling for meow?",
];

module.exports = {
  EXP_PER_CHARACTER,
  LEVELING_FACTOR,
  COOLDOWN_MILLISECONDS,
  COMMAND_PREFIX,
  HOURLY_CHECK_INTERVAL,
  catReplies,
  ANNOUNCEMENT_CHANNEL_ID,
  CACHE_RARITIES_PREFIX,
  CACHE_RARITIES_TTL,
  CACHE_CHANNEL_PREFIX,
  CACHE_CHANNEL_TTL,
  CACHE_MATERIAL_CHANNEL_PREFIX,
  CACHE_MATERIAL_CHANNEL_TTL_MS,
  CACHE_USER_BAG_PREFIX,
  CACHE_USER_BAG_TTL_MS,
  CACHE_LEADERBOARD_POINT_PREFIX,
  CACHE_LEADERBOARD_VALUE_TTL_MS,
  CACHE_LEADERBOARD_MONSTER_KILL_PREFIX,
  CACHE_LEADERBOARD_MONSTER_KILL_TTL_MS,
  CACHE_ASSEMBLE_PREFIX,
  CACHE_ASSEMBLE_TTL_MS,
  GET_CHANCE
};
