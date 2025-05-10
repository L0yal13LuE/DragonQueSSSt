// --- Constants ---
const COMMAND_PREFIX = "!";
const HOURLY_CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour in milliseconds

let COOLDOWN_MILLISECONDS = 5 * 1000;
let EXP_PER_CHARACTER = 1;
let LEVELING_FACTOR = 10;
let ANNOUNCEMENT_CHANNEL_ID = 1366780291380678737


// --- Monster Definitions (English Names with Gaming Vibe) ---
const POSSIBLE_MONSTERS = [
  // common
  { name: "Grumpy Goblin", baseHp: 2000 },
  { name: "Giant Slime", baseHp: 2000 },
  { name: "Skeletal Warrior", baseHp: 2000 },
  { name: "Forest Sprite", baseHp: 2000 },
  { name: "Rock Golem", baseHp: 2000 },
  // uncommon
  { name: "Shadow Stalker", baseHp: 2500 },
  { name: "Ice Elemental", baseHp: 2200 },
  { name: "Fire Drake", baseHp: 2300 },
  { name: "Venomous Serpent", baseHp: 2100 },
  { name: "Mystic Phoenix", baseHp: 3000 },
  { name: "Dark Knight", baseHp: 2700 },
  { name: "Storm Giant", baseHp: 2600 },
  { name: "Lava Beast", baseHp: 2400 },
  { name: "Crystal Golem", baseHp: 2800 },
  { name: "Ethereal Wraith", baseHp: 2900 },
];

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
  POSSIBLE_MONSTERS,
  catReplies,
  ANNOUNCEMENT_CHANNEL_ID
};
