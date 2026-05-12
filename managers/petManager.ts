import supabase from '../supabaseClient';
import { createBaseEmbed } from './embedManager';
import { getMaterial, updateUserItem, getUserItem } from '../providers/materialProvider';

const PET_COST = 32;
const MAX_FARMING_HOURS = 24;
const ITEM_CHANCE_PER_HOUR = 0.1;
const PET_TYPES = ['cat', 'chicken', 'bird', 'wolf', 'hamster', 'panda', 'monkey', 'turtle', 'parrot', 'fox'];
const COMO_MATERIAL_ID = 1;

let rarityMaterialsCache: any[] | null = null;
let cacheLastLoaded: Date | null = null;
const CACHE_EXPIRY_MINUTES = 60;

const baseFactorLevel = 1.0;

function calculateDateInfo(startDateString: string, endDateString: string): {
  startDate: string;
  endDate: string;
  hoursUntilEnd: number;
  hourLeft: number;
} | null {
  const gmtPlus7OffsetMs = 7 * 60 * 60 * 1000;

  const startDate = new Date(startDateString);
  const endDate = new Date(endDateString);

  const currentUtcTimeMillis = Date.now();
  const currentTimeInGmt7 = new Date(currentUtcTimeMillis + gmtPlus7OffsetMs);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    console.error('Invalid date string provided to calculateDateInfo.');
    return null;
  }

  const timeDifferenceMs = endDate.getTime() - startDate.getTime();
  const timeDifferenceCurrentToEndMs = endDate.getTime() - currentTimeInGmt7.getTime();

  const hoursUntilEnd = timeDifferenceMs / (1000 * 60 * 60);
  const hourLeft = timeDifferenceCurrentToEndMs / (1000 * 60 * 60);

  const dateTimeFormatOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'shortOffset',
  };

  return {
    startDate: startDate.toLocaleString('en-US', dateTimeFormatOptions),
    endDate: endDate.toLocaleString('en-US', dateTimeFormatOptions),
    hoursUntilEnd: hoursUntilEnd,
    hourLeft: hourLeft + 7,
  };
}

const loadRarityMaterials = async (): Promise<any[]> => {
  if (rarityMaterialsCache && cacheLastLoaded) {
    const now = new Date();
    const expiryTime = new Date(cacheLastLoaded.getTime() + CACHE_EXPIRY_MINUTES * 60 * 1000);
    if (now < expiryTime) {
      return rarityMaterialsCache;
    }
  }

  const materials1 = await getMaterial({ rarity_id: 1 });
  const materials2 = await getMaterial({ rarity_id: 2 });
  const materials3 = await getMaterial({ rarity_id: 3 });

  const allMaterials = [...(materials1 || []), ...(materials2 || []), ...(materials3 || [])];

  if (allMaterials.length === 0) {
    console.error('No materials found for rarity 1-3.');
    return [];
  }

  rarityMaterialsCache = allMaterials;
  cacheLastLoaded = new Date();

  return allMaterials;
};

const getRandomItem = async (materials: any[]): Promise<any | null> => {
  if (!materials || materials.length === 0) {
    console.error('No materials provided to getRandomItem.');
    return null;
  }
  return materials[Math.floor(Math.random() * materials.length)];
};

const hasEnoughCurrency = async (userId: string, itemCost: number): Promise<boolean> => {
  const { data: userCurrency, error } = await supabase!
    .from('user_material')
    .select('amount')
    .eq('user_id', userId.toString())
    .eq('material_id', COMO_MATERIAL_ID)
    .single();

  if (error) {
    console.error('Error fetching user currency:', error);
    return false;
  }

  return (userCurrency as any).amount >= itemCost;
};

const deductCurrency = async (userId: string, itemCost: number): Promise<boolean> => {
  const { data: userMaterial, error } = await supabase!
    .from('user_material')
    .select('id, amount')
    .eq('user_id', userId.toString())
    .eq('material_id', COMO_MATERIAL_ID)
    .single();

  if (error || !userMaterial) {
    console.error('Error fetching user material for currency deduction:', error);
    return false;
  }

  if ((userMaterial as any).amount < itemCost) {
    return false;
  }
  const newAmount = (userMaterial as any).amount - itemCost;
  const userItem = await getUserItem(
    {
      userId: userId.toString(),
      itemId: COMO_MATERIAL_ID,
    });
  const userItemMatch = userItem?.[0];
  if (!userItemMatch) return false;
  return await updateUserItem({ id: userId.toString() }, userItemMatch as any, newAmount);
};

const getCurrentDate = (): Date => {
  return new Date();
};

const createPetStatusEmbed = (user: any, pets: any[], activePet: any, returningInfo: any): any => {
  const embed = createBaseEmbed({
    color: 0x4CAF50,
    title: `✨ ${user.username}'s Pet Status ✨`,
    description: "Here's the status of your pets:",
  });

  if (activePet) {
    embed.addFields(
      {
        name: `✨ Active Pet: ${activePet.pet_type.toUpperCase()}`,
        value: `Level: **${activePet.level}**\nEXP: **${activePet.exp}**\n\n` +
          `Started: *${returningInfo.startDate}*\n` +
          `Returns: *${returningInfo.endDate}*\n` +
          `Time left: **${Math.ceil(returningInfo.hourLeft)} hours**`,
        inline: false,
      }
    );

    if (returningInfo.hourLeft <= 0) {
      embed.addFields({
        name: '✅ Journey Complete',
        value: 'You can **recall** your pet now to get your rewards!',
        inline: false,
      });
    } else {
      embed.addFields({
        name: 'ℹ️ Journey Status',
        value: 'Your pet is still on its journey. You can recall them early, but rewards will be reduced.',
        inline: false,
      });
    }
  }

  if (pets.length > 0) {
    const otherPetsField: { name: string; value: string; inline: boolean } = { name: '✨ Your Other Pets', value: '', inline: false };

    pets.forEach((pet: any) => {
      if (!activePet || pet.id !== activePet.id) {
        otherPetsField.value += `• **${pet.pet_type}** (Level ${pet.level}, ${pet.exp} EXP) - ${pet.is_active ? 'Active' : 'Inactive'}\n`;
      }
    });

    if (otherPetsField.value) {
      embed.addFields(otherPetsField);
    }
  }

  embed.setFooter({
    text: "Use '/pet buy' to get a new pet | Use '/pet send' to send a pet on a journey | Use '/pet recall' to get your rewards",
  });

  return embed;
};

const upsertUserItem = async (userId: string, item: any): Promise<boolean> => {
  const { data: existingItem, error: checkError } = await supabase!
    .from('user_material')
    .select('id, amount')
    .eq('user_id', userId.toString())
    .eq('material_id', item.id)
    .single();

  if (checkError && checkError.code !== 'PGRST116') {
    console.error('Error checking for existing user item:', checkError);
    return false;
  }

  if (existingItem) {
    const newAmount = (existingItem as any).amount + 1;
    const { error: updateError } = await supabase!
      .from('user_material')
      .update({ amount: newAmount })
      .eq('id', (existingItem as any).id);

    if (updateError) {
      console.error(`[Item Update Error] User: ${userId} | ${updateError.message}`);
      return false;
    }
    console.log(`[Item Update] User: ${userId} | Item: ${item.name} ${item.emoji} | Old: ${(existingItem as any).amount} -> New: ${newAmount}`);
    return true;
  } else {
    const { error: insertError } = await supabase!
      .from('user_material')
      .insert([{ user_id: userId, material_id: item.id, amount: 1 }]);

    if (insertError) {
      console.error(`Error inserting new item for ${userId}:`, insertError.message);
      return false;
    }
    console.log(`User ${userId} earned new item: 1 x ${item.name}.`);
    return true;
  }
};

const sendPet = async (userId: string, petType: string): Promise<{ success: boolean; message: string }> => {
  if (!PET_TYPES.includes(petType)) {
    return { success: false, message: 'Invalid pet type. Please choose from: ' + PET_TYPES.join(', ') };
  }

  const { data: activePet, error: checkError } = await supabase!
    .from('user_pets')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .single();

  if (checkError && checkError.code !== 'PGRST116') {
    console.error('Error checking for active pet:', checkError);
    return { success: false, message: 'Error checking your pet status. Please try again.' };
  }

  if (activePet) {
    return { success: false, message: 'You already sent your pet to a journey. You can only send one pet. Use `/pet status` to check on them.' };
  }

  const { data: targetPet, error: checkErrorTarget } = await supabase!
    .from('user_pets')
    .select('*')
    .eq('user_id', userId)
    .eq('pet_type', petType)
    .single();

  if (checkErrorTarget && checkErrorTarget.code !== 'PGRST116') {
    console.error('Error checking for active pet:', checkErrorTarget);
    return { success: false, message: 'Error checking your pet status. Please try again.' };
  }

  if (targetPet) {
    const lastFeed = new Date((targetPet as any).last_feed);
    const now = getCurrentDate();
    const hoursPassedSunceLastFeed = Math.floor((now.getTime() - lastFeed.getTime()) / (1000 * 60 * 60));
    if (hoursPassedSunceLastFeed > MAX_FARMING_HOURS || (targetPet as any).last_feed === null) {
      return { success: false, message: 'Your pet is hungry. Please feed it using `/pet feed` first.' };
    }

    const startTime = getCurrentDate();
    const endTime = new Date(startTime.getTime() + MAX_FARMING_HOURS * 60 * 60 * 1000);

    const { error } = await supabase!
      .from('user_pets')
      .update({
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        is_active: true,
      })
      .eq('id', (targetPet as any).id);

    if (error) {
      console.error('Error sending pet:', error);
      return { success: false, message: 'Failed to send the pet. Please try again.' };
    }
    return { success: true, message: `You have successfully sent a ${petType}!\nIt will return in ${MAX_FARMING_HOURS} hours.` };
  } else {
    return { success: false, message: "You don't own this pet." };
  }
};

const buyPet = async (userId: string, petType: string): Promise<{ success: boolean; message: string }> => {
  if (!PET_TYPES.includes(petType)) {
    return { success: false, message: 'Invalid pet type. Please choose from: ' + PET_TYPES.join(', ') };
  }

  const { data: activePet, error: checkError } = await supabase!
    .from('user_pets')
    .select('*')
    .eq('user_id', userId)
    .eq('pet_type', petType)
    .single();

  if (checkError && checkError.code !== 'PGRST116') {
    console.error('Error checking for active pet:', checkError);
    return { success: false, message: 'Error checking your pet status. Please try again.' };
  }

  if (activePet) {
    return { success: false, message: 'You already have an this pet.' };
  }

  if (!await hasEnoughCurrency(userId, PET_COST)) {
    return { success: false, message: `You don't have enough Como! You need ${PET_COST} Como to rent a pet.` };
  }

  if (!await deductCurrency(userId, PET_COST)) {
    return { success: false, message: 'Failed to deduct currency. Please try again.' };
  }

  const startTime = getCurrentDate();

  const { error } = await supabase!
    .from('user_pets')
    .insert({
      user_id: userId,
      pet_type: petType,
      start_time: startTime.toISOString(),
      end_time: startTime.toISOString(),
      is_active: false,
      last_feed: startTime.toISOString(),
    });

  if (error) {
    console.error('Error buying pet:', error);
    return { success: false, message: 'Failed to buy the pet. Please try again.' };
  }

  return { success: true, message: `You have successfully bought ${petType}!` };
};

const checkPetStatus = async (userId: string, interaction: any = null): Promise<{ success: boolean; message?: string; embed?: any }> => {
  const { data: pets, error } = await supabase!
    .from('user_pets')
    .select('*')
    .eq('user_id', userId);

  if (error) {
    console.error('Error checking pet status:', error);
    return { success: false, message: 'Error checking your pet status. Please try again.' };
  }

  if (!pets || pets.length === 0) {
    return { success: true, message: `You don't have any pets. Rent one using "/pet buy" for only ${PET_COST} Como!` };
  }

  const activePet = pets.find((pet: any) => pet.is_active);

  if (interaction) {
    if (!activePet) {
      const embed = createBaseEmbed({
        color: 0xFFA500,
        title: '🐾 Your Pets 🐾',
        description: "You don't have an active pet. Here are your pets:",
      });

      pets.forEach((pet: any) => {
        embed.addFields({
          name: `${pet.pet_type.toString().toUpperCase()}`,
          value: `Level: **${pet.level}**\nEXP: **${pet.exp}**\nStatus: ${pet.is_active ? 'Active' : 'Inactive'}`,
          inline: true,
        });
      });

      return { success: true, embed };
    } else {
      const returningInfo = calculateDateInfo(activePet.start_time, activePet.end_time);
      const embed = createPetStatusEmbed(interaction.user, pets, activePet, returningInfo);
      return { success: true, embed };
    }
  }

  if (!activePet) {
    let message = "You don't have an active pet. Here are your pets:\n";
    pets.forEach((pet: any) => {
      message += `\n- **${pet.pet_type}** (Level ${pet.level}, ${pet.exp} EXP) - ${pet.is_active ? 'Active' : 'Inactive'}`;
    });
    return { success: true, message };
  }

  const returningInfo = calculateDateInfo(activePet.start_time, activePet.end_time);

  let message = `Your **${activePet.pet_type}** (Level ${activePet.level}, ${activePet.exp} EXP) started its journey on *${returningInfo!.startDate}* and will return on *${returningInfo!.endDate}*.`;

  if (returningInfo!.hourLeft <= 0) {
    message += '\nIt looks like their journey is complete! You can **recall** them now to get your rewards!';
  } else {
    message += `\nThey will return in approximately ${Math.ceil(returningInfo!.hourLeft)} hours. You can recall them early, but the rewards will be reduced.`;
  }

  if (pets.length > 1) {
    message += '\n\nYour other pets:';
    pets.forEach((pet: any) => {
      if (pet.id !== activePet.id) {
        message += `\n- **${pet.pet_type}** (Level ${pet.level}, ${pet.exp} EXP) - ${pet.is_active ? 'Active' : 'Inactive'}`;
      }
    });
  }

  return { success: true, message };
};

const recallPet = async (userId: string): Promise<{ success: boolean; message: string }> => {
  const { data: pet, error: petError } = await supabase!
    .from('user_pets')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .single();

  if (petError) {
    if (petError.code === 'PGRST116') {
      return { success: false, message: "You don't have an active pet to recall." };
    }
    console.error('Error recalling pet:', petError);
    return { success: false, message: 'Error recalling your pet. Please try again.' };
  }

  const startTime = new Date((pet as any).start_time);
  const now = getCurrentDate();
  let hoursPassed = Math.floor((now.getTime() - startTime.getTime()) / (1000 * 60 * 60));
  if (hoursPassed > MAX_FARMING_HOURS) hoursPassed = MAX_FARMING_HOURS;

  if (hoursPassed < 1) {
    return { success: false, message: 'Your pet has just started its journey. You must wait at least 1 hour to recall it.' };
  }

  let itemsEarnedCount = 0;
  for (let i = 0; i < hoursPassed; i++) {
    if (Math.random() < ITEM_CHANCE_PER_HOUR) {
      itemsEarnedCount++;
    }
  }

  const materials = await loadRarityMaterials();
  const itemsAdded: any[] = [];

  for (let i = 0; i < itemsEarnedCount; i++) {
    const item = await getRandomItem(materials);
    if (item) {
      const success = await upsertUserItem(userId, item);
      if (success) {
        itemsAdded.push(item);
      }
    }
  }

  const expEarned = Math.floor(hoursPassed * itemsEarnedCount);
  let combinedExp = (pet as any).exp + expEarned;
  let combineLevel = (pet as any).level;
  if (((pet as any).level * 100) * baseFactorLevel >= combinedExp) {
    combineLevel = combineLevel + 1;
    combinedExp = 0;
  }

  const updatingFields = { is_active: false, level: combineLevel, exp: combinedExp };
  const { error: updateError } = await supabase!
    .from('user_pets')
    .update(updatingFields)
    .eq('id', (pet as any).id);

  if (updateError) {
    console.error('Error deactivating pet:', updateError);
    return { success: false, message: 'Error finalizing the recall process. Please check your inventory.' };
  }

  const rewardMessage = itemsAdded.length > 0
    ? `You earned ${itemsAdded.length} items.\n${itemsAdded.map(item => `- ${item.name} ${item.emoji} x 1`).join('\n')}!`
    : 'Unfortunately, your pet returned with no items this time.';

  return {
    success: true,
    message: `Your ${(pet as any).pet_type} has been recalled. ${rewardMessage}`,
  };
};

const feedPets = async (userId: string, petType: string): Promise<{ success: boolean; message: string }> => {
  const { data: pet, error: petsError } = await supabase!
    .from('user_pets')
    .select('*')
    .eq('user_id', userId)
    .eq('pet_type', petType)
    .single();

  if (petsError) {
    if (petsError.code === 'PGRST116') {
      return { success: false, message: "You don't have any pets to feed." };
    }
    console.error('Error recalling pet:', petsError);
    return { success: false, message: 'Error fetching your pets. Please try again.' };
  }

  const requiredComo = 1;

  if (!await hasEnoughCurrency(userId, requiredComo)) {
    return { success: false, message: `You don't have enough Como! You need ${requiredComo} Como to feed a pet.` };
  }

  if (!await deductCurrency(userId, requiredComo)) {
    return { success: false, message: 'Failed to deduct currency. Please try again.' };
  }

  const currentTime = new Date().toISOString();
  const { error: updateError } = await supabase!
    .from('user_pets')
    .update({ last_feed: currentTime })
    .eq('id', (pet as any).id);

  if (updateError) {
    console.error('Error feeding pet:', updateError);
    return { success: false, message: 'Error finalizing the feed pet process. Please check your report this to a staff member.' };
  }

  return { success: true, message: `Used ${requiredComo} Como to fed ${petType}!` };
};

const handlePetCommand = async (interaction: any): Promise<void> => {
  try {
    await interaction.deferReply();

    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    let result: any = { success: false, message: 'unknown command.' };
    switch (subcommand) {
      case 'buy':
        const petTypeToBuy = interaction.options.getString('name');
        result = await buyPet(userId, petTypeToBuy);
        break;

      case 'send':
        const petTypeToSend = interaction.options.getString('name');
        result = await sendPet(userId, petTypeToSend);
        break;

      case 'feed':
        const petTypeToFeed = interaction.options.getString('name');
        result = await feedPets(userId, petTypeToFeed);
        break;

      case 'status':
        result = await checkPetStatus(userId, interaction);
        break;

      case 'recall':
        result = await recallPet(userId);
        break;

      default:
        result = { message: 'Unknown command. Please use `/pet buy`, `/pet send`, `/pet status`, `/pet recall`, or `/pet feed`.' };
    }

    if (result.embed) {
      await interaction.editReply({ embeds: [result.embed] });
    } else {
      await interaction.editReply(result.message);
    }
  } catch (error) {
    console.error('Error handling pet command:', error);
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply('An error occurred while processing your command.');
    } else {
      await interaction.reply('An error occurred while processing your command.');
    }
  }
};

export {
  sendPet,
  checkPetStatus,
  recallPet,
  handlePetCommand,
};
