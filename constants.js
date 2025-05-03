// --- Constants ---
const EXP_PER_CHARACTER = 1;
const LEVELING_FACTOR = 10;
const COOLDOWN_MILLISECONDS = 5 * 1000;
const COMMAND_PREFIX = '!';
const HOURLY_CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour in milliseconds

// --- Material Lists ---
const MATERIAL_LIST = [
    { emoji: '🪵', name: 'Wood' }, { emoji: '🧱', name: 'Concrete' }, { emoji: '🔩', name: 'Steel' },
    { emoji: '🪟', name: 'Glass' }, { emoji: '🏠', name: 'Plaster' }, { emoji: '🪨', name: 'Stone' },
    { emoji: '🛠️', name: 'Aluminum' }, { emoji: '🧵', name: 'Fabric' }, { emoji: '🌿', name: 'Bamboo' },
    { emoji: '🛢️', name: 'Plastic' },
];
const RARE_MATERIAL_LIST = [
    { emoji: '💎', name: 'Diamond' }, { emoji: '👑', name: 'Crown' }, { emoji: '🔮', name: 'Magic Orb' },
];

// --- Monster Definitions (Thai Names) ---
const POSSIBLE_MONSTERS = [
    { name: "ก็อบลินหน้าบูด", baseHp: 1000 }, // Grumpy Goblin
    { name: "สไลม์ยักษ์", baseHp: 1000 },     // Giant Slime
    { name: "นักรบโครงกระดูก", baseHp: 1000 },// Skeletal Warrior
    { name: "ภูตพงไพร", baseHp: 1000 },     // Forest Sprite
    { name: "โกเลมหินผา", baseHp: 1000 },   // Rock Golem
];

// --- Cat Language Replies ---
const catReplies = [
    "เหมียว?", // Meow?
    "เมี้ยววว...", // Meeeow...
    "*เอียงคอ* เหมี๊ยว?", // *tilts head* Mrrr?
    "พรืดดดด... ฟี้...", // Purrrr... Zzzz...
    "*คลอเคลีย* เหมียว!", // *nuzzles* Meow!
    "เหมียววววววววว...", // Puuuurrrrrrrrrrr...
    "เมี้ยว เมี้ยว!", // Meow meow!
    "*กะพริบตาช้าๆ*", // *blinks slowly*
    "หง่าววว?", // Mrow?
    "ว่าไงทาส เหมียว?", // What is it, human? Meow?
    "เรียกหาเหมียวเหรอ?", // Calling for meow?
];

module.exports = {
    EXP_PER_CHARACTER, LEVELING_FACTOR, COOLDOWN_MILLISECONDS, COMMAND_PREFIX, HOURLY_CHECK_INTERVAL,
    MATERIAL_LIST, RARE_MATERIAL_LIST, POSSIBLE_MONSTERS, catReplies
};