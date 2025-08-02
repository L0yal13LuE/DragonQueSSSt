const { MessageFlags } = require('discord.js');
const { supabase } = require("../supabaseClient");
const CONSTANTS = require("../constants");
const { getMaterial, getUserItem, insertUserItem, updateUserItem } = require("../providers/materialProvider");

// Constants for pet farming
const PET_COST = 10; // Como cost to rent a pet
const MAX_FARMING_HOURS = 72; // Maximum farming duration in hours
const ITEM_CHANCE_PER_HOUR = 0.1; // 10% chance per hour
const PET_TYPES = ["cat", "chicken", "bird"];
const COMO_MATERIAL_ID = 1; // Como currency material ID

// Cache for pre-loaded materials with rarity 1-3
let rarityMaterialsCache = null;
let cacheLastLoaded = null;
const CACHE_EXPIRY_MINUTES = 60; // Cache expires after 1 hour

function calculateDateInfo(startDateString, endDateString) {
  const gmtPlus7OffsetMs = 7 * 60 * 60 * 1000;

  // Attempt to create Date objects from the input strings.
  // The Date constructor correctly parses ISO 8601 strings with timezone offsets (e.g., +07:00 or Z).

  // REMOVE GMT+7
  // const startDate = new Date(new Date(startDateString).getTime() - gmtPlus7OffsetMs);
  // const endDate = new Date(new Date(endDateString).getTime() - gmtPlus7OffsetMs);

  // NOT GMT+7
  const startDate = new Date(startDateString)
  const endDate = new Date(endDateString)

  // Get the current time in UTC milliseconds.
  const currentUtcTimeMillis = Date.now();

  // Calculate the current time as if it were in GMT+7.
  // This is done by taking the current UTC time and adding 7 hours to it in milliseconds.
  // This creates a Date object that, when its getTime() is used, represents the UTC equivalent
  // of the current time *if* the current time were observed in GMT+7.

  const currentTimeInGmt7 = new Date(currentUtcTimeMillis + gmtPlus7OffsetMs);

  // Validate if the dates are valid
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    console.error("Invalid date string provided.");
    return null; // Return null for invalid dates
  }

  // Calculate the difference in milliseconds from start to end
  const timeDifferenceMs = endDate.getTime() - startDate.getTime();

  // Calculate the difference in milliseconds from the current time (adjusted to GMT+7) to the end date
  const timeDifferenceCurrentToEndMs = endDate.getTime() - currentTimeInGmt7.getTime();

  // Convert milliseconds to hours
  // 1 hour = 60 minutes/hour * 60 seconds/minute * 1000 milliseconds/second
  const hoursUntilEnd = timeDifferenceMs / (1000 * 60 * 60);
  const hourLeft = timeDifferenceCurrentToEndMs / (1000 * 60 * 60);

  const dateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false, // Use 24-hour format
    timeZoneName: 'shortOffset' // Displays e.g., "GMT+7"
  };

  return {
    startDate: startDate.toLocaleString('en-US', dateTimeFormatOptions),
    endDate: endDate.toLocaleString('en-US', dateTimeFormatOptions),
    hoursUntilEnd: hoursUntilEnd,
    hourLeft: hourLeft + 7 // Hours left from the current time (adjusted to GMT+7) to the end date
  };
}

// Function to pre-load all materials with rarity 1-3
const loadRarityMaterials = async () => {
  // Check if cache is still valid
  if (rarityMaterialsCache && cacheLastLoaded) {
    const now = new Date();
    const expiryTime = new Date(cacheLastLoaded.getTime() + CACHE_EXPIRY_MINUTES * 60 * 1000);
    if (now < expiryTime) {
      return rarityMaterialsCache;
    }
  }

  // Load fresh data from database
  const materials1 = await getMaterial({ rarity_id: 1 });
  const materials2 = await getMaterial({ rarity_id: 2 });
  const materials3 = await getMaterial({ rarity_id: 3 });

  // Combine all materials
  const allMaterials = [...(materials1 || []), ...(materials2 || []), ...(materials3 || [])];

  if (allMaterials.length === 0) {
    console.error("No materials found for rarity 1-3");
    return [];
  }

  // Update cache
  rarityMaterialsCache = allMaterials;
  cacheLastLoaded = new Date();

  return allMaterials;
};

// Helper function to get random item based on rarity from pre-loaded cache
const getRandomItem = async (materials) => {
  if (materials.length === 0) {
    console.error("No materials found for rarity 1-3");
    return null;
  }

  // Return a random material from the list
  return materials[Math.floor(Math.random() * materials.length)];
};

// Check if user has enough currency (Como)
const hasEnoughCurrency = async (userId) => {

  // Check user's currency balance
  const { data: userCurrency, error } = await supabase
    .from("user_material")
    .select(`
    id, 
    user_id, 
    amount, 
    material:materials(
      id, 
      name, 
      emoji, 
      rarity_id, 
      rarities(id, name, emoji, drop_rate, value)
    )`)
    .eq("user_id", userId.toString())
    .eq("material_id", COMO_MATERIAL_ID)
    .single();

  if (error) {
    console.log("hasEnoughCurrency : error", error, userCurrency)
    return false;
  }

  const currentBalance = userCurrency.amount;

  console.log("hasEnoughCurrency : currentBalance", currentBalance, "PET_COST", PET_COST)
  return currentBalance >= PET_COST;
};

// Deduct currency from user
const deductCurrency = async (userId) => {
  const { data: userMaterials, error } = await supabase
    .from("user_material")
    .select(`
    id, 
    user_id, 
    amount, 
    material:materials(
      id, 
      name, 
      emoji, 
      rarity_id, 
      rarities(id, name, emoji, drop_rate, value)
    )`)
    .eq("user_id", userId.toString())
    .eq("material_id", COMO_MATERIAL_ID)
    .single();

  if (error) {
    return false;
  }

  const comoMaterial = userMaterials;
  if (comoMaterial.amount < PET_COST) {
    return false;
  }

  // Update the amount
  const newAmount = comoMaterial.amount - PET_COST;
  return await updateUserItem({ id: userId }, comoMaterial, newAmount);
};

// Helper function to get current time in Bangkok (GMT+7)
const getCurrentDate = () => {
  const now = new Date();
  // Bangkok is GMT+7, so add 7 hours (7 * 60 * 60 * 1000 milliseconds)
  // return new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return new Date();
};

const upsertUserItem = async (userId, item) => {

  const existItem = async (material_id) => {
    const { data: data, error: checkError } = await supabase
      .from("user_material")
      .select(`
    id, 
    user_id, 
    amount, 
    material:materials(
      id, 
      name, 
      emoji, 
      rarity_id, 
      rarities(id, name, emoji, drop_rate, value)
    )`)
      .eq("user_id", userId.toString())
      .eq("material_id", material_id)
      .single();

    if (checkError && checkError.code !== "PGRST116") { // PGRST116 = not found
      console.error("Error checking active pet:", checkError);
      return { success: false, message: "Error checking pet status" };
    }

    return data ?? false;
  }

  const userExistItem = await existItem(item.id);
  if (userExistItem) {
    // update
    const newAmount = userExistItem.amount + 1;
    const { error: updateError } = await supabase
      .from("user_material")
      .update({ amount: newAmount })
      .eq("id", userExistItem.id);
    if (updateError) {
      console.error(
        `[Item Update Error] User: ${userId} | ${updateError.message}`
      );
      return false;
    }
    console.log(
      `[Item Update] User: ${userId} | Item: ${item.name} ${item.emoji} | Old: ${userExistItem.amount} → New: ${newAmount}`
    );
    return true;

  } else {
    // insert
    const { error: insertError } = await supabase
      .from("user_material")
      .insert([
        {
          user_id: userId,
          material_id: item.id,
          amount: 1,
        },
      ]);
    if (insertError) {
      console.error(
        `Error inserting new item for ${userId}:`,
        insertError.message
      );
      return false;
    }
    console.log(
      `User ${userId} earned new item: 1 x ${item.name}.`
    );
    return true;
  }

}

// Rent a pet
const rentPet = async (userId, petType) => {
  if (!PET_TYPES.includes(petType)) {
    return { success: false, message: "Invalid pet type" };
  }

  // Check if user already has an active pet
  const { data: activePet, error: checkError } = await supabase
    .from("user_pets")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .single();

  if (checkError && checkError.code !== "PGRST116") { // PGRST116 = not found
    console.error("Error checking active pet:", checkError);
    return { success: false, message: "Error checking pet status" };
  }

  if (activePet) {
    return { success: false, message: "You stil have an active pet, check them now using `/pet status` command." };
  }

  // Check if user has enough currency
  if (!await hasEnoughCurrency(userId)) {
    return { success: false, message: "You don't have **10 Como**!? come back when you have it" };
  }

  // Deduct currency
  if (!await deductCurrency(userId)) {
    return { success: false, message: "Failed to deduct currency" };
  }

  // Rent the pet using Bangkok time
  const startTime = getCurrentDate();
  const endTime = new Date(startTime.getTime() + MAX_FARMING_HOURS * 60 * 60 * 1000);

  const { error } = await supabase
    .from("user_pets")
    .insert({
      user_id: userId,
      pet_type: petType,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      is_active: true
    });

  if (error) {
    console.error("Error renting pet:", error);
    return { success: false, message: "Failed to rent pet" };
  }

  return { success: true, message: `Successfully rented a ${petType}` };
};

// Check pet status
const checkPetStatus = async (userId) => {
  const { data: pet, error } = await supabase
    .from("user_pets")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .single();

  if (error) {
    if (error.code === "PGRST116") { // Not found
      return { success: true, message: "Want some rewards ? rent a pet to farm for you! only cost **10 Como**!" };
    }
    console.error("Error checking pet status:", error);
    return { success: false, message: "Error checking pet status" };
  }

  const returningInfo = calculateDateInfo(pet.start_time, pet.end_time);

  let message = `Your **${pet.pet_type}** left on their journey on *${returningInfo.startDate}*, it will return on *${returningInfo.endDate}*.`;

  if (returningInfo.hourLeft <= 0) {
    message += "\nLook like they've completed their journey! you may **recall** them now!";
  } else {
    message += `\nIt will return approximately in ${Math.returningInfo.hourLeft} hours be patient! You may recall them now but rewards will be reduced.`;
  }

  return { success: true, message };
};

// Recall pet and calculate rewards
const recallPet = async (userId) => {
  const { data: pet, error: petError } = await supabase
    .from("user_pets")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .single();

  if (petError) {
    if (petError.code === "PGRST116") { // Not found
      return { success: false, message: "Want some rewards ? rent a pet to farm for you! only cost **10 Como**!" };
    }
    console.error("Error recalling pet:", petError);
    return { success: false, message: "Error recalling pet" };
  }

  const startTime = new Date(pet.start_time);
  const now = getCurrentDate();
  const hoursPassed = Math.floor((now - startTime) / (1000 * 60 * 60));

  // Calculate rewards
  let itemsEarned = 0;
  for (let i = 0; i < hoursPassed; i++) {
    if (Math.random() < ITEM_CHANCE_PER_HOUR) {
      itemsEarned++;
    }
  }

  // pre-load items
  const materials = await loadRarityMaterials();

  // Add items to user's inventory
  let itemsAdded = [];
  for (let i = 0; i < itemsEarned; i++) {
    const item = await getRandomItem(materials);
    if (item) {
      const success = await upsertUserItem(userId, item)
      console.log("success", success); // Debugging line to check the success of insertUserItem
      if (!success) {
        console.error("Error adding item to inventory:", success);
      }
      itemsAdded.push(item);
    }
  }


  // Deactivate the pet
  const { error: updateError } = await supabase
    .from("user_pets")
    .update({ is_active: false })
    .eq("id", pet.id);

  if (updateError) {
    console.error("Error updating pet status:", updateError);
    return { success: false, message: "Error updating pet status" };
  }

  return {
    success: true,
    message: `Your ${pet.pet_type} has been recalled.\nYou earned ${itemsAdded.length} items: ${itemsAdded.map(item => item.name).join(", ")}!`
  };
};

// Main command handler for the pet command
const handlePetCommand = async (interaction) => {
  try {
    await interaction.deferReply(); // Defer the reply to give us more time to process (public reply)
    // await interaction.deferReply({ flags: MessageFlags.Ephemeral }); // Defer the reply to give us more time to process (private reply)

    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    switch (subcommand) {
      case "rent":
        const petType = interaction.options.getString("pet_type");
        const rentResult = await rentPet(userId, petType);
        await interaction.editReply(rentResult.message);
        break;

      case "status":
        const statusResult = await checkPetStatus(userId);
        await interaction.editReply(statusResult.message);
        break;

      case "recall":
        const recallResult = await recallPet(userId);
        await interaction.editReply(recallResult.message);
        break;

      default:
        await interaction.editReply("Wrong command!");
    }
  } catch (error) {
    console.error("Error handling pet command:", error);
    await interaction.editReply("An error occurred while processing your command.");
  }
};

module.exports = {
  rentPet,
  checkPetStatus,
  recallPet,
  handlePetCommand
};
