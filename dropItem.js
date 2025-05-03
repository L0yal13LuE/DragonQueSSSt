// -- Define drop rate
const DROP_RATE = {
    common: 0.33, // 33%
    uncommon: 0.2, // 20%
    rare: 0.1,  // 10%
    superRare: 0.05,  // 5%
    legendary: 0.01,  // 1%
    baseExpRatio: 1, // base exp ratio (1=normal 100%, 2=200%, 3=300%, 4=400%, 5=500%)
    baseDropRatio: 1, // base drop ratio (1=normal 100%, 2=200%, 3=300%, 4=400%, 5=500%)
};

// -- General Drop Item List
// NOTE: Added 'rarity' for probability calculation in unknown areas
const MATERIAL_LIST = [
    { emoji: '🪵', name: 'Wood', rarity: 'common' },
    { emoji: '🧱', name: 'Concrete', rarity: 'common' },
    { emoji: '🔩', name: 'Steel', rarity: 'common' },
    { emoji: '🪟', name: 'Glass', rarity: 'common' },
    { emoji: '🏠', name: 'Plaster', rarity: 'common' },
    { emoji: '🪨', name: 'Stone', rarity: 'common' },
    { emoji: '🛠️', name: 'Aluminum', rarity: 'common' },
    { emoji: '🧵', name: 'Fabric', rarity: 'common' },
    { emoji: '🌿', name: 'Bamboo', rarity: 'common' },
    { emoji: '🛢️', name: 'Plastic', rarity: 'common' },
];

// -- City Only Drop Item List
const CITY_MATERIAL_LIST = {
    townhall: [
        { emoji: '💫', name: 'Cosmo Shard', rarity: 'uncommon' },
    ],
    castle: [
        { emoji: '💫', name: 'Cosmo Shard', rarity: 'uncommon' },
    ],
    workshop: [
        { emoji: '💫', name: 'Cosmo Shard', rarity: 'uncommon' },
    ],
    church: [
        { emoji: '💫', name: 'Cosmo Shard', rarity: 'uncommon' },
    ],
    bazaar: [
        { emoji: '💫', name: 'Cosmo Shard', rarity: 'uncommon' },
    ],
    port: [
        { emoji: '💫', name: 'Cosmo Shard', rarity: 'uncommon' },
    ],
}

// -- Outside Only Drop Item List
const OUTSIDE_MATEIRL_LIST = {
    moduField: [
        // common
        { emoji: '🌽', name: 'Grain', rarity: 'common' },
        { emoji: '🥬', name: 'Leaf Veg', rarity: 'common' },
        { emoji: '🥕', name: 'Root Veg', rarity: 'common' },
        { emoji: '🧅', name: 'Bulb Veg', rarity: 'common' },
        // uncommon
        { emoji: '🫘', name: 'Bean', rarity: 'uncommon' },
        { emoji: '🥚', name: 'Egg', rarity: 'uncommon' },
        { emoji: '🥩', name: 'Meat', rarity: 'uncommon' },
        { emoji: '🍗', name: 'Chicken Leg', rarity: 'uncommon' },
        // rare
        { emoji: '🧶', name: 'Wool', rarity: 'rare' },
        { emoji: '🥛', name: 'Milk', rarity: 'rare' },

    ],
    moduForest: [
        // common
        { emoji: '🍀', name: 'Herb', rarity: 'common' },
        { emoji: '🌷', name: 'Flower', rarity: 'common' },
        { emoji: '🍄', name: 'Mushroom', rarity: 'common' },
        { emoji: '🫐', name: 'Berry', rarity: 'common' },
        // uncommon
        { emoji: '🪵', name: 'Wood', rarity: 'uncommon' },
        { emoji: '🍊', name: 'Fruit', rarity: 'uncommon' },
        { emoji: '🪶', name: 'Feather', rarity: 'uncommon' },
        { emoji: '🪲', name: 'Bug', rarity: 'uncommon' },
        // rare
        { emoji: '🐗', name: 'Leather', rarity: 'rare' },
        { emoji: '🦠', name: 'Slime', rarity: 'rare' },
    ],
    moduMount: [
        // common
        { emoji: '🪨', name: 'Stone', rarity: 'common' },
        { emoji: '🧱', name: 'Clay', rarity: 'common' },
        { emoji: '🧊', name: 'Ice', rarity: 'common' },
        // uncommon
        { emoji: '🖤', name: 'Coal', rarity: 'uncommon' },
        { emoji: '🩶', name: 'Iron', rarity: 'uncommon' },
        { emoji: '🧡', name: 'Copper', rarity: 'uncommon' },
        // rare
        { emoji: '💛', name: 'Gold', rarity: 'rare' },
        { emoji: '💎', name: 'Diamond', rarity: 'rare' },
        // super rare
        { emoji: '🧿', name: 'Magic Orb', rarity: 'superRare' },
        { emoji: '🐉', name: 'Dragon Tail', rarity: 'superRare' },
    ],
    moduDune: [
        // common
        { emoji: '⏳', name: 'Sand', rarity: 'common' },
        { emoji: '🦎', name: 'Scale', rarity: 'common' },
        { emoji: '🦴', name: 'Bone', rarity: 'common' },
        // uncommon
        { emoji: '🫙', name: 'Glass', rarity: 'uncommon' },
        { emoji: '🕸️', name: 'String', rarity: 'uncommon' },
        { emoji: '🦷', name: 'Fang', rarity: 'uncommon' },
        // rare
        { emoji: '🧪', name: 'Poison', rarity: 'rare' },
        { emoji: '🐐', name: 'Horn', rarity: 'rare' },
        // super rare
        // Corrected rarity based on context (previously common)
        { emoji: '💀', name: 'Skull', rarity: 'superRare' },
        { emoji: '👻', name: 'Soul Core', rarity: 'superRare' },
    ],
    moduIsland: [
        // common
        { emoji: '🌿', name: 'Seaweed', rarity: 'common' },
        { emoji: '🧂', name: 'Salt', rarity: 'common' },
        { emoji: '🐟', name: 'Fish', rarity: 'common' },
        // uncommon
        { emoji: '🦐', name: 'Shrimp', rarity: 'uncommon' },
        { emoji: '🦑', name: 'Squid', rarity: 'uncommon' },
        { emoji: '🦀', name: 'Crab', rarity: 'uncommon' },
        // rare
        { emoji: '🐚', name: 'Clam', rarity: 'rare' },
        { emoji: '🪸', name: 'Coral', rarity: 'rare' },
        // super rare
        { emoji: '🛢️', name: 'Oil', rarity: 'superRare' },
        { emoji: '🫧', name: 'Pearl', rarity: 'superRare' },
    ]
};

// Helper function to check if channel is in a city area
const cityAreaChannels = [
    '1366739740589817886', // townhall
    '1366829263273201765', // castle
    '1366826513759993968', // workshop
    '1366821253180297317', // church
    '1366825306358419567', // bazaar
    '1366831923493601320', // port
    '1368075262721261688', // townhall (test)
];
const isCityArea = (channelId) => cityAreaChannels.includes(channelId);

// Helper function to check if channel is in an outside area
const outsideAreaChannels = [
    '1367542066246193314',//field
    '1367542339651895387',//forest
    '1367542902091284520',//mount
    '1367543454342844426',//dune
    '1367544108805259346',//island
    '1368075302198317158', //field (test)
];
const isOutsideArea = (channelId) => outsideAreaChannels.includes(channelId);

// Helper function to get the item list and area type based on channel ID
const getItemListAndAreaType = (channelId) => {
    let itemList = [];
    let areaType = 'unknown';

    if (isOutsideArea(channelId)) {
        areaType = 'outside';
        const outsideChannelMap = {
            '1367542066246193314': 'moduField',    // field
            '1368075302198317158': 'moduField',    // field(test)
            '1367542339651895387': 'moduForest',   // forest
            '1367542902091284520': 'moduMount',     // mount
            '1367543454342844426': 'moduDune',      // dune
            '1367544108805259346': 'moduIsland'     // island
        };
        const areaKey = outsideChannelMap[channelId];
        if (areaKey && OUTSIDE_MATEIRL_LIST[areaKey]) {
            itemList = OUTSIDE_MATEIRL_LIST[areaKey];
            console.log(`[Drop Logic] Area: Outside - ${areaKey}`);
        }
    } else if (isCityArea(channelId)) {
        areaType = 'city';
        const cityAreaChannelMap = {
            '1366739740589817886': 'townhall',
            '1368075262721261688': 'townhall', // townhall(test)
            '1366829263273201765': 'castle',
            '1366826513759993968': 'workshop',
            '1366821253180297317': 'church',
            '1366825306358419567': 'bazaar',
            '1366831923493601320': 'port',
        };
        const areaKey = cityAreaChannelMap[channelId];
        if (areaKey && CITY_MATERIAL_LIST[areaKey]) {
            itemList = CITY_MATERIAL_LIST[areaKey];
            console.log(`[Drop Logic] Area: City - ${areaKey}`);
        }
    } else {
        areaType = 'unknown';
        itemList = MATERIAL_LIST; // Use general list
        console.log("[Drop Logic] Area: Unknown - Using general material list.");
    }

    return { itemList, areaType };
};

// Helper function to calculate the total drop probability for an item list
const calculateTotalDropProbability = (itemList) => {
    const uniqueRarities = [...new Set(itemList.map(item => item.rarity))];
    let totalProbability = 0;

    console.log("[Drop Logic] Calculating total area drop probability...");
    uniqueRarities.forEach(rarity => {
        if (DROP_RATE[rarity]) {
            const rarityProbability = DROP_RATE[rarity] * DROP_RATE.baseDropRatio;
            totalProbability += rarityProbability;
            console.log(`[Drop Logic] - Adding ${rarity}: ${(rarityProbability * 100).toFixed(2)}%`);
        } else {
            console.warn(`[Drop Logic] Warning: Unknown rarity '${rarity}' found in item list.`);
        }
    });

    // Clamp the total area probability between 0 and 1
    const clampedProbability = Math.max(0, Math.min(totalProbability, 1));
    console.log(`[Drop Logic] Total calculated probability: ${(totalProbability * 100).toFixed(2)}%, Clamped: ${(clampedProbability * 100).toFixed(2)}%`);
    return clampedProbability;
};

// Helper function to perform weighted item selection
const selectWeightedItem = (droppableItems, areaType) => {
    console.log("[Drop Logic] Performing weighted item selection...");
    const itemProbabilities = {};
    const rarityCounts = droppableItems.reduce((acc, item) => {
        acc[item.rarity] = (acc[item.rarity] || 0) + 1;
        return acc;
    }, {});

    let weightedTotal = 0;
    droppableItems.forEach(item => {
        // Ensure rarity and drop rate exist before calculating
        if (item.rarity && DROP_RATE[item.rarity] !== undefined && rarityCounts[item.rarity] > 0) {
            const individualProb = (DROP_RATE[item.rarity] * DROP_RATE.baseDropRatio) / rarityCounts[item.rarity];
            itemProbabilities[item.name] = individualProb;
            weightedTotal += individualProb;
            console.log(`[Drop Logic] - Item: ${item.name}, Rarity: ${item.rarity}, Individual Weight: ${individualProb.toFixed(5)}`);
        } else {
            console.warn(`[Drop Logic] Skipping item '${item.name}' in weighted selection due to missing rarity, drop rate, or zero rarity count.`);
        }
    });

    console.log(`[Drop Logic] Total weighted sum for selection: ${weightedTotal.toFixed(5)}`);

    if (weightedTotal <= 0) {
        console.warn("[Drop Logic] Weighted total individual probability is zero. No item selected.");
        return null; // Indicate no item was selected
    }

    let selectionRoll = Math.random() * weightedTotal;
    console.log(`[Drop Logic] Item selection roll: ${selectionRoll.toFixed(5)} (Needed <= cumulative probability)`);

    let cumulativeProbability = 0;

    // Select the item based on the weighted roll
    for (const item of droppableItems) {
        // Only consider items that had a valid probability calculated
        if (itemProbabilities.hasOwnProperty(item.name)) {
            cumulativeProbability += itemProbabilities[item.name];
            console.log(`[Drop Logic] Checking item: ${item.name}, Cumulative Probability: ${cumulativeProbability.toFixed(5)}`);
            if (selectionRoll <= cumulativeProbability) {
                return item; // Return the selected item
            }
        }
    }

    // Fallback: Should ideally not be reached
    console.error("[Drop Logic] Error in weighted individual item drop selection: Fell through the selection loop.");
    // As a last resort, return a random item if the loop failed unexpectedly
    return droppableItems.length > 0 ? droppableItems[Math.floor(Math.random() * droppableItems.length)] : null;
};


// --- REFACTORED FUNCTION: Handles item dropping based on location and rarity ---
const handleDropByLocation = (channelId) => {
    console.log(`\n--- Starting Drop Logic for Channel ID: ${channelId} ---`);

    // 1. Determine Item List and Area Type
    const { itemList, areaType } = getItemListAndAreaType(channelId);

    // Exit if no items are defined for the determined area
    if (!itemList || itemList.length === 0) {
        console.log(`[Drop Logic] No items defined for area type: ${areaType}. No drop possible.`);
        console.log(`--- Drop Logic Finished ---\n`);
        return []; // No items available to drop
    }

    // 2. Calculate Total Drop Probability for the Area
    const totalAreaDropProbability = calculateTotalDropProbability(itemList);

    // 3. Check if ANY drop occurs based on total area probability
    const dropRoll = Math.random();
    console.log(`[Drop Logic] Initial drop roll: ${dropRoll.toFixed(5)} (Needed < ${totalAreaDropProbability.toFixed(5)} for a drop)`);

    if (dropRoll < totalAreaDropProbability) {
        console.log("[Drop Logic] Initial drop roll successful. Proceeding to item selection.");
        // 4. If a drop occurs, determine WHICH item drops (Weighted Selection)
        const droppableItems = itemList.filter(item => item.rarity && DROP_RATE[item.rarity] !== undefined);

        if (droppableItems.length === 0) {
            console.log(`[Drop Logic] No droppable items with valid rarity/drop rate in ${areaType} area after initial drop success.`);
            console.log(`--- Drop Logic Finished ---\n`);
            return [];
        }

        const selectedItem = selectWeightedItem(droppableItems, areaType);

        if (selectedItem) {
            console.log(`[Drop Logic] Drop Success! Selected Item: ${selectedItem.emoji} ${selectedItem.name}`);
            console.log(`--- Drop Logic Finished ---\n`);
            return [selectedItem]; // Return the single chosen item as an array
        } else {
            console.warn(`[Drop Logic] Initial drop successful, but no item was selected in weighted selection for ${areaType} area.`);
            console.log(`--- Drop Logic Finished ---\n`);
            return []; // Should not happen if droppableItems.length > 0 and weightedTotal > 0
        }

    } else {
        // No drop occurred based on the initial roll
        console.log(`[Drop Logic] Initial drop roll failed. No drop occurred.`);
        console.log(`--- Drop Logic Finished ---\n`);
        return []; // Return empty array indicating no drop
    }
};
// --- END OF REFACTORED FUNCTION ---

module.exports = {
    handleDropByLocation
};
