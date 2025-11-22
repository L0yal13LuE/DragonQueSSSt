/**
 * @fileoverview This file manages all pet-related functionalities for the Discord bot,
 * including renting pets, checking their status, and recalling them to claim rewards.
 * It interacts with the Supabase database to manage user pets and inventory.
 *
 * @requires discord.js: For handling Discord interactions.
 * @requires ../supabaseClient: For database communication with Supabase.
 * @requires ../constants: For application-wide constants.
 * @requires ../providers/materialProvider: For database operations related to materials.
 */

// const { MessageFlags } = require('discord.js');
const { supabase } = require("../supabaseClient");
const { createBaseEmbed } = require("./embedManager");
// const CONSTANTS = require("../constants");
const { getMaterial, updateUserItem, getUserItem } = require("../providers/materialProvider");

// --- Constants for Pet Farming ---

/** @const {number} The cost in "Como" currency to rent a pet. */
const PET_COST = 32;

/** @const {number} The maximum duration in hours a pet can be sent for farming. */
const MAX_FARMING_HOURS = 24;

/** @const {number} The chance (as a decimal) of finding an item per hour of farming. 10% chance. */
const ITEM_CHANCE_PER_HOUR = 0.1;

/** @const {string[]} An array of valid pet types that can be rented. */
const PET_TYPES = ["cat", "chicken", "bird", "wolf", "hamster", "panda", "monkey", "turtle", "parrot", "fox"];

/** @const {number} The material ID for the "Como" currency. */
const COMO_MATERIAL_ID = 1;

// --- Caching for Materials ---

/** @type {Array<Object>|null} A cache for materials with rarity levels 1-3 to reduce database queries. */
let rarityMaterialsCache = null;

/** @type {Date|null} The timestamp of when the material cache was last loaded. */
let cacheLastLoaded = null;

/** @const {number} The duration in minutes before the material cache expires. */
const CACHE_EXPIRY_MINUTES = 60;

// base factor level ratio (for level up)
const baseFactorLevel = 1.0;


/**
 * Calculates date and time information based on start and end dates.
 * This function is used to determine the duration of a pet's journey and the time remaining.
 *
 * @param {string} startDateString - The start date of the journey in ISO 8601 format.
 * @param {string} endDateString - The end date of the journey in ISO 8601 format.
 * @returns {Object|null} An object containing formatted start and end dates, total duration, and remaining time, or null if dates are invalid.
 * @property {string} startDate - The formatted start date.
 * @property {string} endDate - The formatted end date.
 * @property {number} hoursUntilEnd - The total duration of the journey in hours.
 * @property {number} hourLeft - The remaining time in hours.
 */
function calculateDateInfo(startDateString, endDateString) {
    const gmtPlus7OffsetMs = 7 * 60 * 60 * 1000;

    const startDate = new Date(startDateString);
    const endDate = new Date(endDateString);

    // Get the current time in UTC milliseconds.
    const currentUtcTimeMillis = Date.now();

    // To correctly calculate the remaining time, we simulate the current time in GMT+7.
    const currentTimeInGmt7 = new Date(currentUtcTimeMillis + gmtPlus7OffsetMs);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        console.error("Invalid date string provided to calculateDateInfo.");
        return null;
    }

    const timeDifferenceMs = endDate.getTime() - startDate.getTime();
    const timeDifferenceCurrentToEndMs = endDate.getTime() - currentTimeInGmt7.getTime();

    const hoursUntilEnd = timeDifferenceMs / (1000 * 60 * 60);
    const hourLeft = timeDifferenceCurrentToEndMs / (1000 * 60 * 60);

    const dateTimeFormatOptions = {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZoneName: 'shortOffset'
    };

    return {
        startDate: startDate.toLocaleString('en-US', dateTimeFormatOptions),
        endDate: endDate.toLocaleString('en-US', dateTimeFormatOptions),
        hoursUntilEnd: hoursUntilEnd,
        hourLeft: hourLeft + 7 // Adjusting for GMT+7
    };
}

/**
 * Pre-loads materials with rarity levels 1-3 into a cache to improve performance.
 * The cache expires after a set duration to ensure data freshness.
 *
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of material objects.
 */
const loadRarityMaterials = async () => {
    // Check if a valid cache already exists.
    if (rarityMaterialsCache && cacheLastLoaded) {
        const now = new Date();
        const expiryTime = new Date(cacheLastLoaded.getTime() + CACHE_EXPIRY_MINUTES * 60 * 1000);
        if (now < expiryTime) {
            return rarityMaterialsCache;
        }
    }

    // If cache is expired or doesn't exist, load fresh data from the database.
    const materials1 = await getMaterial({ rarity_id: 1 });
    const materials2 = await getMaterial({ rarity_id: 2 });
    const materials3 = await getMaterial({ rarity_id: 3 });

    const allMaterials = [...(materials1 || []), ...(materials2 || []), ...(materials3 || [])];

    if (allMaterials.length === 0) {
        console.error("No materials found for rarity 1-3.");
        return [];
    }

    // Update the cache.
    rarityMaterialsCache = allMaterials;
    cacheLastLoaded = new Date();

    return allMaterials;
};

/**
 * Selects a random item from a given list of materials.
 *
 * @param {Array<Object>} materials - An array of material objects.
 * @returns {Promise<Object|null>} A promise that resolves to a random material object, or null if the input array is empty.
 */
const getRandomItem = async (materials) => {
    if (!materials || materials.length === 0) {
        console.error("No materials provided to getRandomItem.");
        return null;
    }
    return materials[Math.floor(Math.random() * materials.length)];
};

/**
 * Checks if a user has enough "Como" currency to perform an action.
 *
 * @param {string} userId - The Discord user ID.
 * @param {number} itemCost - total cost of the item
 * @returns {Promise<boolean>} A promise that resolves to true if the user has enough currency, false otherwise.
 */
const hasEnoughCurrency = async (userId, itemCost) => {
    const { data: userCurrency, error } = await supabase
        .from("user_material")
        .select('amount')
        .eq("user_id", userId.toString())
        .eq("material_id", COMO_MATERIAL_ID)
        .single();

    if (error) {
        console.error("Error fetching user currency:", error);
        return false;
    }

    return userCurrency.amount >= itemCost;
};

/**
 * Deducts the pet rental cost from a user's "Como" currency balance.
 *
 * @param {string} userId - The Discord user ID.
 * @param {number} itemCost - total cost of the item
 * @returns {Promise<boolean>} A promise that resolves to true if the currency was successfully deducted, false otherwise.
 */
const deductCurrency = async (userId, itemCost) => {
    const { data: userMaterial, error } = await supabase
        .from("user_material")
        .select('id, amount')
        .eq("user_id", userId.toString())
        .eq("material_id", COMO_MATERIAL_ID)
        .single();

    if (error || !userMaterial) {
        console.error("Error fetching user material for currency deduction:", error);
        return false;
    }

    if (userMaterial.amount < itemCost) {
        return false; // Should be caught by hasEnoughCurrency, but as a safeguard.
    }
    const newAmount = userMaterial.amount - itemCost;
    const userItem = await getUserItem(
        {
            userId: userId.toString(),
            itemId: COMO_MATERIAL_ID
        });
    const userItemMatch = userItem?.[0];
    return await updateUserItem({ id: userId.toString() }, userItemMatch, newAmount);
};

/**
 * Gets the current date and time.
 *
 * @returns {Date} The current Date object.
 */
const getCurrentDate = () => {
    return new Date();
};

/**
 * Creates an embed for displaying pet status information.
 *
 * @param {Object} user - The Discord user object.
 * @param {Array} pets - Array of user's pets.
 * @param {Object} activePet - The active pet object.
 * @param {Object} returningInfo - Information about the active pet's journey.
 * @returns {Object} Discord embed object.
 */
const createPetStatusEmbed = (user, pets, activePet, returningInfo) => {
    // Create base embed
    const embed = createBaseEmbed({
        color: 0x4CAF50, // Green color
        title: `✨ ${user.username}'s Pet Status ✨`,
        description: "Here's the status of your pets:"
    });

    // Add active pet information
    if (activePet) {
        embed.addFields(
            {
                name: `✨ Active Pet: ${activePet.pet_type.toUpperCase()}`,
                value: `Level: **${activePet.level}**\nEXP: **${activePet.exp}**\n\n` +
                    `Started: *${returningInfo.startDate}*\n` +
                    `Returns: *${returningInfo.endDate}*\n` +
                    `Time left: **${Math.ceil(returningInfo.hourLeft)} hours**`,
                inline: false
            }
        );

        if (returningInfo.hourLeft <= 0) {
            embed.addFields({
                name: "✅ Journey Complete",
                value: "You can **recall** your pet now to get your rewards!",
                inline: false
            });
        } else {
            embed.addFields({
                name: "ℹ️ Journey Status",
                value: "Your pet is still on its journey. You can recall them early, but rewards will be reduced.",
                inline: false
            });
        }
    }

    // Add other pets information
    if (pets.length > 0) {
        let otherPetsField = { name: "✨ Your Other Pets", value: "", inline: false };

        pets.forEach(pet => {
            if (!activePet || pet.id !== activePet.id) {
                otherPetsField.value += `• **${pet.pet_type}** (Level ${pet.level}, ${pet.exp} EXP) - ${pet.is_active ? "Active" : "Inactive"}\n`;
            }
        });

        if (otherPetsField.value) {
            embed.addFields(otherPetsField);
        }
    }

    // Add footer with instructions
    embed.setFooter({
        text: "Use '/pet buy' to get a new pet | Use '/pet send' to send a pet on a journey | Use '/pet recall' to get your rewards"
    });

    return embed;
};

/**
 * Inserts a new item into a user's inventory or updates the amount if the item already exists.
 *
 * @param {string} userId - The Discord user ID.
 * @param {Object} item - The material object to add to the inventory.
 * @returns {Promise<boolean>} A promise that resolves to true if the operation was successful, false otherwise.
 */
const upsertUserItem = async (userId, item) => {
    const { data: existingItem, error: checkError } = await supabase
        .from("user_material")
        .select('id, amount')
        .eq("user_id", userId.toString())
        .eq("material_id", item.id)
        .single();

    if (checkError && checkError.code !== "PGRST116") { // PGRST116 means no rows found
        console.error("Error checking for existing user item:", checkError);
        return false;
    }

    if (existingItem) {
        // Item exists, so update the amount.
        const newAmount = existingItem.amount + 1;
        const { error: updateError } = await supabase
            .from("user_material")
            .update({ amount: newAmount })
            .eq("id", existingItem.id);

        if (updateError) {
            console.error(`[Item Update Error] User: ${userId} | ${updateError.message}`);
            return false;
        }
        console.log(`[Item Update] User: ${userId} | Item: ${item.name} ${item.emoji} | Old: ${existingItem.amount} -> New: ${newAmount}`);
        return true;
    } else {
        // Item does not exist, so insert a new record.
        const { error: insertError } = await supabase
            .from("user_material")
            .insert([{ user_id: userId, material_id: item.id, amount: 1 }]);

        if (insertError) {
            console.error(`Error inserting new item for ${userId}:`, insertError.message);
            return false;
        }
        console.log(`User ${userId} earned new item: 1 x ${item.name}.`);
        return true;
    }
};

/**
 * Send a pet to journey farming for items
 *
 * @param {string} userId - The Discord user ID.
 * @param {string} petType - The type of pet to send.
 * @returns {Promise<Object>} A promise that resolves to an object with success status and a message.
 */
const sendPet = async (userId, petType) => {
    if (!PET_TYPES.includes(petType)) {
        return { success: false, message: "Invalid pet type. Please choose from: " + PET_TYPES.join(', ') };
    }

    // Check if the user already has active pet farming
    const { data: activePet, error: checkError } = await supabase
        .from("user_pets")
        .select("*")
        .eq("user_id", userId)
        .eq("is_active", true)
        .single();

    if (checkError && checkError.code !== "PGRST116") {
        console.error("Error checking for active pet:", checkError);
        return { success: false, message: "Error checking your pet status. Please try again." };
    }

    if (activePet) {
        return { success: false, message: "You already sent your pet to a journey. You can only send one pet. Use `/pet status` to check on them." };
    }

    const { data: targetPet, error: checkErrorTarget } = await supabase
        .from("user_pets")
        .select("*")
        .eq("user_id", userId)
        .eq("pet_type", petType)
        .single();

    if (checkErrorTarget && checkErrorTarget.code !== "PGRST116") {
        console.error("Error checking for active pet:", checkErrorTarget);
        return { success: false, message: "Error checking your pet status. Please try again." };
    }

    if (targetPet) {

        // Check if this pet is hungry or not
        const lastFeed = new Date(targetPet.last_feed);
        const now = getCurrentDate();
        const hoursPassedSunceLastFeed = Math.floor((now - lastFeed) / (1000 * 60 * 60));
        if (hoursPassedSunceLastFeed > MAX_FARMING_HOURS || targetPet.last_feed === null) {
            return { success: false, message: "Your pet is hungry. Please feed it using `/pet feed` first." };
        }

        // Set up the pet's journey.
        const startTime = getCurrentDate();
        const endTime = new Date(startTime.getTime() + MAX_FARMING_HOURS * 60 * 60 * 1000);

        const { error } = await supabase
            .from("user_pets")
            .update({
                start_time: startTime.toISOString(),
                end_time: endTime.toISOString(),
                is_active: true
            })
            .eq("id", targetPet.id);

        if (error) {
            console.error("Error sending pet:", error);
            return { success: false, message: "Failed to send the pet. Please try again." };
        }
        return { success: true, message: `You have successfully sent a ${petType}!\nIt will return in ${MAX_FARMING_HOURS} hours.` };
    } else {
        return { success: false, message: "You don't own this pet." };
    }
};

/**
 * Rents a pet for a user, deducting the cost and setting it to be active.
 *
 * @param {string} userId - The Discord user ID.
 * @param {string} petType - The type of pet to rent.
 * @returns {Promise<Object>} A promise that resolves to an object with success status and a message.
 */
const buyPet = async (userId, petType) => {
    if (!PET_TYPES.includes(petType)) {
        return { success: false, message: "Invalid pet type. Please choose from: " + PET_TYPES.join(', ') };
    }

    // Check if the user already has target pet.
    const { data: activePet, error: checkError } = await supabase
        .from("user_pets")
        .select("*")
        .eq("user_id", userId)
        .eq("pet_type", petType)
        .single();

    if (checkError && checkError.code !== "PGRST116") {
        console.error("Error checking for active pet:", checkError);
        return { success: false, message: "Error checking your pet status. Please try again." };
    }

    if (activePet) {
        return { success: false, message: "You already have an this pet." };
    }

    // Check for sufficient currency.
    if (!await hasEnoughCurrency(userId, PET_COST)) {
        return { success: false, message: `You don't have enough Como! You need ${PET_COST} Como to rent a pet.` };
    }

    // Deduct the currency.
    if (!await deductCurrency(userId, PET_COST)) {
        return { success: false, message: "Failed to deduct currency. Please try again." };
    }

    // Set up the pet's journey.
    const startTime = getCurrentDate();
    // const endTime = new Date(startTime.getTime() + MAX_FARMING_HOURS * 60 * 60 * 1000);

    const { error } = await supabase
        .from("user_pets")
        .insert({
            user_id: userId,
            pet_type: petType,
            start_time: startTime.toISOString(),
            end_time: startTime.toISOString(),
            is_active: false,
            last_feed: startTime.toISOString()
        });

    if (error) {
        console.error("Error buying pet:", error);
        return { success: false, message: "Failed to buy the pet. Please try again." };
    }

    return { success: true, message: `You have successfully bought ${petType}!` };
};

/**
 * Checks the status of a user's active pet.
 *
 * @param {string} userId - The Discord user ID.
 * @param {Object} interaction - The Discord interaction object (optional, for embeds).
 * @returns {Promise<Object>} A promise that resolves to an object with success status, message, and optionally embed.
 */
const checkPetStatus = async (userId, interaction = null) => {
    // Get all pets for the user
    const { data: pets, error } = await supabase
        .from("user_pets")
        .select("*")
        .eq("user_id", userId);

    if (error) {
        console.error("Error checking pet status:", error);
        return { success: false, message: "Error checking your pet status. Please try again." };
    }

    if (!pets || pets.length === 0) {
        return { success: true, message: `You don't have any pets. Rent one using \"/pet buy\" for only ${PET_COST} Como!` };
    }

    // Find the active pet
    const activePet = pets.find(pet => pet.is_active);

    // If we have an interaction object, create an embed
    if (interaction) {
        if (!activePet) {
            // Create embed for no active pet case
            const embed = createBaseEmbed({
                color: 0xFFA500, // Orange color
                title: `🐾 Your Pets 🐾`,
                description: "You don't have an active pet. Here are your pets:"
            });

            // Add all pets to the embed
            pets.forEach(pet => {
                embed.addFields({
                    name: `${pet.pet_type.toString().toUpperCase()}`,
                    value: `Level: **${pet.level}**\nEXP: **${pet.exp}**\nStatus: ${pet.is_active ? "Active" : "Inactive"}`,
                    inline: true
                });
            });

            return { success: true, embed };
        } else {
            // For active pet, create detailed embed
            const returningInfo = calculateDateInfo(activePet.start_time, activePet.end_time);
            const embed = createPetStatusEmbed(interaction.user, pets, activePet, returningInfo);
            return { success: true, embed };
        }
    }

    // Fallback to text message if no interaction provided
    if (!activePet) {
        // If no active pet, show all pets with their status
        let message = "You don't have an active pet. Here are your pets:\n";
        pets.forEach(pet => {
            message += `\n- **${pet.pet_type}** (Level ${pet.level}, ${pet.exp} EXP) - ${pet.is_active ? "Active" : "Inactive"}`;
        });
        return { success: true, message };
    }

    // For active pet, show detailed status
    const returningInfo = calculateDateInfo(activePet.start_time, activePet.end_time);

    let message = `Your **${activePet.pet_type}** (Level ${activePet.level}, ${activePet.exp} EXP) started its journey on *${returningInfo.startDate}* and will return on *${returningInfo.endDate}*.`;

    if (returningInfo.hourLeft <= 0) {
        message += "\nIt looks like their journey is complete! You can **recall** them now to get your rewards!";
    } else {
        message += `\nThey will return in approximately ${Math.ceil(returningInfo.hourLeft)} hours. You can recall them early, but the rewards will be reduced.`;
    }

    // Show other pets as well
    if (pets.length > 1) {
        message += "\n\nYour other pets:";
        pets.forEach(pet => {
            if (pet.id !== activePet.id) {
                message += `\n- **${pet.pet_type}** (Level ${pet.level}, ${pet.exp} EXP) - ${pet.is_active ? "Active" : "Inactive"}`;
            }
        });
    }

    return { success: true, message };
};

/**
 * Recalls an active pet, calculates rewards based on the time passed, and deactivates the pet.
 *
 * @param {string} userId - The Discord user ID.
 * @returns {Promise<Object>} A promise that resolves to an object with success status and a message detailing the rewards.
 */
const recallPet = async (userId) => {
    const { data: pet, error: petError } = await supabase
        .from("user_pets")
        .select("*")
        .eq("user_id", userId)
        .eq("is_active", true)
        .single();

    if (petError) {
        if (petError.code === "PGRST116") {
            return { success: false, message: "You don't have an active pet to recall." };
        }
        console.error("Error recalling pet:", petError);
        return { success: false, message: "Error recalling your pet. Please try again." };
    }

    const startTime = new Date(pet.start_time);
    const now = getCurrentDate();
    let hoursPassed = Math.floor((now - startTime) / (1000 * 60 * 60));
    if (hoursPassed > MAX_FARMING_HOURS) hoursPassed = MAX_FARMING_HOURS;

    // Pet need at least 1 hour of journey or you can't recall the pet back
    if (hoursPassed < 1) {
        return { success: false, message: "Your pet has just started its journey. You must wait at least 1 hour to recall it." };
    }

    // Calculate rewards based on hours passed.
    let itemsEarnedCount = 0;
    for (let i = 0; i < hoursPassed; i++) {
        if (Math.random() < ITEM_CHANCE_PER_HOUR) {
            itemsEarnedCount++;
        }
    }

    const materials = await loadRarityMaterials();
    let itemsAdded = [];

    for (let i = 0; i < itemsEarnedCount; i++) {
        const item = await getRandomItem(materials);
        if (item) {
            const success = await upsertUserItem(userId, item);
            if (success) {
                itemsAdded.push(item);
            }
        }
    }

    // Calculate Exp base on item earned and hours passed

    const expEarned = Math.floor(hoursPassed * itemsEarnedCount);
    let combinedExp = pet.exp + expEarned;
    let combineLevel = pet.level;
    if (((pet.level * 100) * baseFactorLevel) >= combinedExp) {
        // new level
        combineLevel = combineLevel + 1;
        combinedExp = 0;
    }

    // Deactivate the pet.
    const updatingFields = { is_active: false, level: combineLevel, exp: combinedExp }
    const { error: updateError } = await supabase
        .from("user_pets")
        .update(updatingFields)
        .eq("id", pet.id);

    if (updateError) {
        console.error("Error deactivating pet:", updateError);
        return { success: false, message: "Error finalizing the recall process. Please check your inventory." };
    }

    const rewardMessage = itemsAdded.length > 0
        ? `You earned ${itemsAdded.length} items.\n${itemsAdded.map(item => `- ${item.name} ${item.emoji} x 1`).join("\n")}!`
        : "Unfortunately, your pet returned with no items this time.";

    return {
        success: true,
        message: `Your ${pet.pet_type} has been recalled. ${rewardMessage}`
    };
};

/**
 * Feeds 1 of a user's pets, consuming 1 como per pet.
 *
 * @param {string} userId - The Discord user ID.
 * @param {string} petType - Pet type (refer to PET_TYPES)
 * @returns {Promise<Object>} A promise that resolves to an object with success status and a message.
 */
const feedPets = async (userId, petType) => {

    // Get the user's pets
    const { data: pet, error: petsError } = await supabase
        .from("user_pets")
        .select("*")
        .eq("user_id", userId)
        .eq("pet_type", petType)
        .single();

    if (petsError) {
        if (petsError.code === "PGRST116") {
            return { success: false, message: "You don't have any pets to feed." };
        }
        console.error("Error recalling pet:", petsError);
        return { success: false, message: "Error fetching your pets. Please try again." };
    }

    // Calculate required como (1 como per pet)
    const requiredComo = 1;

    // Check for sufficient currency.
    if (!await hasEnoughCurrency(userId, requiredComo)) {
        return { success: false, message: `You don't have enough Como! You need ${requiredComo} Como to feed a pet.` };
    }

    if (!await deductCurrency(userId, requiredComo)) {
        return { success: false, message: "Failed to deduct currency. Please try again." };
    }

    // Update last_feed timestamp for pet
    const currentTime = new Date().toISOString();
    const { error: updateError } = await supabase
        .from("user_pets")
        .update({ last_feed: currentTime })
        .eq("id", pet.id);

    if (updateError) {
        console.error("Error feeding pet:", updateError);
        return { success: false, message: "Error finalizing the feed pet process. Please check your report this to a staff member." };
    }

    return { success: true, message: `Used ${requiredComo} Como to fed ${petType}!` };
};

/**
 * Handles the `/pet` slash command from Discord, routing to the appropriate subcommand handler.
 *
 * @param {Interaction} interaction - The Discord interaction object.
 */
const handlePetCommand = async (interaction) => {
    try {
        await interaction.deferReply();

        const subcommand = interaction.options.getSubcommand();
        const userId = interaction.user.id;

        let result = { success: false, message: 'unknown command.' };
        switch (subcommand) {
            case "buy":
                const petTypeToBuy = interaction.options.getString("name");
                result = await buyPet(userId, petTypeToBuy);
                break;

            case "send":
                const petTypeToSend = interaction.options.getString("name");
                result = await sendPet(userId, petTypeToSend);
                break;

            case "feed":
                const petTypeToFeed = interaction.options.getString("name");
                result = await feedPets(userId, petTypeToFeed);
                break;

            case "status":
                result = await checkPetStatus(userId, interaction);
                break;

            case "recall":
                result = await recallPet(userId);
                break;

            default:
                result = { message: "Unknown command. Please use `/pet buy`, `/pet send`, `/pet status`, `/pet recall`, or `/pet feed`." };
        }

        // Handle the result based on whether it has an embed or a message
        if (result.embed) {
            await interaction.editReply({ embeds: [result.embed] });
        } else {
            await interaction.editReply(result.message);
        }

    } catch (error) {
        console.error("Error handling pet command:", error);
        if (interaction.replied || interaction.deferred) {
            await interaction.editReply("An error occurred while processing your command.");
        } else {
            await interaction.reply("An error occurred while processing your command.");
        }
    }
};

module.exports = {
    sendPet,
    checkPetStatus,
    recallPet,
    handlePetCommand
};
