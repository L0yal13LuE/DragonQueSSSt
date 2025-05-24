// --- Constants ---
const COMMAND_PREFIX = "!";
const HOURLY_CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour in milliseconds

let COOLDOWN_MILLISECONDS = 5 * 1000;
let EXP_PER_CHARACTER = 1;
let LEVELING_FACTOR = 10;
let ANNOUNCEMENT_CHANNEL_ID = 1366780291380678737

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
  // MATERIAL_LIST, RARE_MATERIAL_LIST,
  // POSSIBLE_MONSTERS,
  catReplies,
  ANNOUNCEMENT_CHANNEL_ID
};
