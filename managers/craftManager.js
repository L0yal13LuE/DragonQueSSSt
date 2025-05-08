// managers/craftManager.js
const { EmbedBuilder } = require('discord.js');

/**
 * Retrieves a craft command from the database that matches the given command.
 * The query first looks for a matching command, then checks if the command is active.
 * If an error occurs, it is logged and false is returned.
 * If the command is found, the entire craft object is returned. Otherwise, false is returned.
 * @param {object} supabase - The Supabase client instance for querying the database.
 * @param {string} command - The command to search for in the database.
 * @returns {Promise<object|boolean>} - The craft object if found, or false if not found or an error occurred.
 */
const fetchCraftCommand = async (supabase, command) => {
    const { data: craftMatched, error } = await supabase
        .from('crafts')
        .select('*')
        .eq('command', command)
        .eq('is_active', true)
        .single();

    if (error) {
        console.error("Supabase query error (fetchCraftCommand):", error);
        return false;
    }

    // console.log(`typing ${command} > fetchCraftCommand > found`, craftMatched);

    if (craftMatched && craftMatched.id) return craftMatched;

    return false;
}

/**
 * Fetches the materials required for a specific craft by its ID.
 * Queries the 'craft_materials' table to retrieve active materials associated with the given craft ID.
 * Each fetched material includes its ID, material ID, amount, and emoji.
 * 
 * @param {object} supabase - The Supabase client instance for querying the database.
 * @param {number} craftId - The ID of the craft for which materials are to be fetched.
 * @returns {Promise<Array|boolean>} - Returns an array of materials if successful, or false if an error occurs.
 */
const fetchCraftMaterials = async (supabase, craftId) => {
    console.log("Fetching craft materials for craft ID:", craftId);

    const { data: dataArray, error } = await supabase
        .from('craft_materials')
        .select('id, material_id, amount, materials(emoji, name)')
        .eq('craft_id', craftId)
        .eq('is_active', true)
        .eq('materials.is_active', true);

    if (error) {
        console.error("Supabase query error (fetchCraftMaterials):", error);
        return false;
    }

    console.log(`Fetched ${dataArray.length} materials for craft ID: ${craftId}`);
    return dataArray;
}

/**
 * Retrieves all items for a specific user that match the given material names.
 * Queries the 'user_item' table to retrieve active items associated with the given user ID and material names.
 * Each fetched item includes its ID, user ID, emoji, name, and amount.
 * If there are multiple items with the same name, they will be merged by summing their amounts and keeping the highest ID.
 * The resulting array of items is returned.
 * 
 * @param {object} supabase - The Supabase client instance for querying the database.
 * @param {number} userId - The ID of the user for which items are to be fetched.
 * @param {Array<string>} materialNames - An array of material names for which items are to be fetched.
 * @returns {Promise<Array|boolean>} - Returns an array of items if successful, or false if an error occurs.
 */
const fetchUserItemsByMaterialIds = async (supabase, userId, materialNames) => {
    if (!materialNames.length) return [];

    const getData = async (id, names) => {
        const { data: userItems, error } = await supabase
            .from('user_item')
            .select('id, userid, itememoji, itemname, itemamount')
            .eq('userid', id)
            .gt('itemamount', 0)
            .in('itemname', names);
        if (error) {
            console.error(`Error fetching user items for user ${id} with material name ${names.join(', ')}:`, error.message);
            return null;
        }
        return userItems;
    }

    const updateUserItem = async (userid, items) => {
        if (items.length <= 0) return false;
        const itemMap = {};
        let needProcess = false;
        items.forEach((item) => {
            if (itemMap[item.itemname]) {
                itemMap[item.itemname].itemamount += item.itemamount;
                needProcess = true;
            } else {
                itemMap[item.itemname] = item;
            }
        });

        const updateAmount = async (id, amount) => {
            await supabase
                .from('user_item')
                .update({ itemamount: amount })
                .eq('id', id)
                .eq('userid', userid);
        }

        if (needProcess) {
            items.forEach(async (item) => {
                if (itemMap[item.itemname] && item.id !== itemMap[item.itemname].id) {
                    await updateAmount(item.id, 0);
                } else {
                    await updateAmount(itemMap[item.itemname].id, itemMap[item.itemname].itemamount);
                }
            });
        }
    }

    try {
        const userItems = await getData(userId, materialNames);
        // console.log("fetchUserItemsByMaterialIds > userItems", userItems);
        if (userItems && userItems.length > 0) {
            await updateUserItem(userId, userItems);
        }
        const newUpdatedItems = await getData(userId, materialNames);
        // console.log("fetchUserItemsByMaterialIds > newUpdatedItems", newUpdatedItems);
        return newUpdatedItems;

    } catch (error) {
        console.error(`Unexpected error fetching user items for user ${userId} with material name ${materialNames.join(', ')}:`, error);
        return null;
    }
};

/**
 * Retrieves the materials required for a specific craft command and the user's owned materials associated with the required materials.
 * 
 * @param {object} supabase - The Supabase client instance for querying the database.
 * @param {object} message - The Discord message object containing the user ID.
 * @param {object} craftCommand - The craft command object containing the ID.
 * @returns {Promise<object>} - Returns an object with the required materials and the user's owned materials.
 */
const fetchCraftItemsRequired = async (supabase, message, craftCommand) => {
    // fetch requred materials
    const materials = await fetchCraftMaterials(supabase, craftCommand.id);
    // fetch user materials
    const materialNames = materials.map(item => item.materials.name);
    const userMaterials = await fetchUserItemsByMaterialIds(supabase, message.author.id, materialNames);
    return {
        materials,
        userMaterials,
    }
}

/**
 * Retrieves a single material by ID.
 * Queries the 'materials' table to retrieve the material associated with the given ID.
 * The material is expected to be active.
 * 
 * @param {object} supabase - The Supabase client instance for querying the database.
 * @param {number} material_id - The ID of the material to fetch.
 * @returns {Promise<object|boolean>} - Returns the material object if successful, or false if an error occurs.
 */
const fetchNewCraftItems = async (supabase, material_id) => {
    const { data: dataItem, error } = await supabase
        .from('materials')
        .select('*')
        .eq('id', material_id)
        .eq('is_active', true) // -> production
        .single();

    if (error) {
        console.error("Supabase query error (fetchNewCraftItems):", error);
        return false;
    }

    return (dataItem && dataItem.id) ? dataItem : false;
}

/**
 * Handles a craft command from a user.
 * Determines if the command is for checking or crafting based on the presence of 'start' at the end.
 * If the command is for checking, it fetches the required materials and the user's owned materials and sends a message to the channel with the requirements.
 * If the command is for crafting, it deducts the required materials from the user's inventory and adds the new craft item to the user's inventory.
 * If the user does not have enough materials, it sends an error message to the channel.
 * If the user successfully crafts the item, it sends a success message to the channel.
 * @param {object} supabase - The Supabase client instance for querying the database.
 * @param {string} command - The craft command issued by the user (e.g. '!craft fco-a' or '!craft fco-a start')
 * @param {object} message - The Discord message object containing the user ID and channel ID.
 * @param {object} client - The Discord client instance.
 */
const handleCraftCommand = async (supabase, command, message, client) => {
    const userID = message.author.id;


    // Determine if the command is for checking or crafting
    const isCraftingCommand = command.toLowerCase().endsWith('start');
    const baseCommand = isCraftingCommand ? command.slice(0, -6).trim() : command.trim();

    // find the craft that matches the command
    const craftCommand = await fetchCraftCommand(supabase, baseCommand.toLowerCase());

    if (isCraftingCommand) {
        // Logic for when user wants to start crafting
        console.log(`Crafting command issued: ${baseCommand}`);

        // new item
        const newItem = await fetchNewCraftItems(supabase, craftCommand.material_id);

        // Add crafting logic here
        const { materials, userMaterials } = await fetchCraftItemsRequired(supabase, message, craftCommand);

        // double check if user already got eveything they need
        // deduct each material from user_item table
        // add new craft item to user_item table

        if (newItem && materials && materials.length > 0 && userMaterials && userMaterials.length > 0) {

            // loop through materials and deduct from user's inventory
            materials.forEach(material => {
                const currentOwnedOfMaterial = userMaterials.find(userMaterial => userMaterial.itemname === material.materials.name);
                if (currentOwnedOfMaterial.itemamount < material.amount) {
                    console.error(`User ${message.author.id} does not have enough ${material.materials.name} to craft ${craftCommand.title}`);
                    return;
                }

                // deduct the material from user's inventory
                const newUpdateAmount = currentOwnedOfMaterial.itemamount - material.amount;
                // const { error: updateError } = supabase.from('user_item')
                //     .update({ itemamount: newUpdateAmount })
                //     .eq('id', currentOwnedOfMaterial.id)
                //     .eq('userid', userID);

                // if (updateError) {
                //     console.error(`Error updating user item for ${userID} when crafting ${craftCommand.title}`, updateError.message);
                //     return;
                // }

                console.log(`Deducted '${material.materials.name} x ${material.amount}' from ${userID} when crafting '${newItem.emoji} ${newItem.name}', from ${currentOwnedOfMaterial.itemamount} to ${newUpdateAmount}`);
            });

            // add new craft item to user_item table

            // const { error: insertError } = supabase.from('user_item').insert([{
            //     userid: userID,
            //     channelid: "craft",
            //     itememoji: newItem.emoji,
            //     itemname: newItem.name,
            //     itemamount: 1,
            //     timestamp: new Date().toISOString(),
            // }]);

            // if (insertError) {
            //     console.error(`Error inserting new item for ${userID} after crafting ${craftCommand.title}`, insertError.message);
            //     return;
            // }

            console.log(`Adding '${newItem.emoji} ${newItem.name}' to user ${userID} when crafting ${craftCommand.command}`);

            // send a success message
            message.reply(`Congratulations! You have successfully crafted '${newItem.emoji} ${newItem.name}'!`);
        } else {
            message.reply('You can\'t craft this item right now or you don\'t have enough materials, comeback again later!');
        }
    } else {
        // Logic for when user wants to check crafting requirements
        console.log(`Checking command issued: ${baseCommand}`);
        console.log(`Checking command issued: ${baseCommand} > craftCommand, ${craftCommand}`);

        // Add checking logic here
        if (craftCommand) {

            const username = message.author.username;
            console.log(`[${username}] Requested !${command}`); // Log difference

            let embed = new EmbedBuilder()
                .setColor(0xE6DAC3)
                .setTitle(`**⚒️ ${craftCommand.title} ⚒️**`);

            const { materials, userMaterials } = await fetchCraftItemsRequired(supabase, message, craftCommand);

            // this craft has materials > print material
            // to start whole process both need to be true
            if (materials && materials.length > 0 && userMaterials && userMaterials.length > 0) {
                let desc = craftCommand.description + '\n\n';
                let isAllMaterialsFound = true;
                materials.forEach(material => {
                    // list each required item and how many they have
                    let currentOwnedOfMaterial = userMaterials.find(userMaterial => userMaterial.itemname === material.materials.name);
                    currentOwnedOfMaterial = currentOwnedOfMaterial ? currentOwnedOfMaterial.itemamount : 0;
                    if (currentOwnedOfMaterial < material.amount) {
                        isAllMaterialsFound = false;
                    }
                    desc += `${material.materials.emoji} ${material.materials.name}: ${currentOwnedOfMaterial}/${material.amount}\n`;
                });
                if (isAllMaterialsFound) {
                    desc += '\n—————————————————————————————————————————\n';
                    desc += '✅ You have all the required materials!\n';
                    desc += '✅ Typing `' + craftCommand.command + ' start` to craft an item\n';
                    desc += '\n—————————————————————————————————————————\n';
                } else {
                    desc += '\n—————————————————————————————————————————\n';
                    desc += '❌ Insufficient materials!\n';
                    desc += '❌ Please gather more resources.';
                    desc += '\n—————————————————————————————————————————\n';
                }
                embed.setDescription(desc);
            } else {
                // this craft is not material.. more like a details ?
                embed.setDescription(craftCommand.description.replace('<br/>', '\n'));
            }

            // add thumbnail if exist
            if (craftCommand.thumbnail) {
                embed.setThumbnail(craftCommand.thumbnail);
            }
            // add footer and timestamp
            embed.setFooter({ text: craftCommand.footer }).setTimestamp();

            // sent message to channel
            message.reply({ embeds: [embed] });

            return;
        }
    }
}

module.exports = { handleCraftCommand };
