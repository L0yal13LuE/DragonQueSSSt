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

let COOLDOWN_MILLISECONDS = 5 * 1000;
let EXP_PER_CHARACTER = 1;
let LEVELING_FACTOR = 10;
let ANNOUNCEMENT_CHANNEL_ID = 1366780291380678737;

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
  CACHE_USER_BAG_TTL_MS
};
