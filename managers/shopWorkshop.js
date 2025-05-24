const { Events } = require('discord.js');
const { supabase } = require('../supabaseClient');
const { getShop, getShopItems } = require('./../dbUtils');

const fs = require('fs');
const { join } = require('path');

const CACHE_MAT_SELL_DIR = join(__dirname, '../cache');

const shopSettings = async (channelId, client) => {
    try {
        if (!supabase) { console.error("[shopSettings] Supabase client not available."); return null; } // Or handle differently

        // define default value
        let title = 'Master Shiro\'s Shop';
        let description = 'Welcome, See what wares I have for sale';
        let thumbnail = '<URL>';
        let image = '<URL>';
        let footer = 'Hope you like it!';
        let itemsForSellMaster = [];

        // Get shop data by channel id
        const shopData = await getShop(channelId);

        // There was a bug in your console.log - fixed it to show the shop data
        // console.log('Shop Data:', shopData);

        if (shopData) {
            title = shopData.title || title;
            description = shopData.description || description;
            thumbnail = shopData.thumbnail || thumbnail;
            image = shopData.image || image;
            footer = shopData.footer || footer;

            // Get items in this shop
            const shopItemCurrency = await getShopItems(shopData.id);
            const shopMaterials = await getShopMaterialsForSell();
            const shopItems = shopItemCurrency.concat(shopMaterials);

            // console.log('Shop Items:', shopItems);
            // console.log('Shop Materials:', shopMaterials);

            // Check if shopItems is not null and has items
            if (shopItems && shopItems.length > 0) {
                itemsForSellMaster = shopItems;
            }
        } else {
            console.log('No shop found for channel', channelId);
            return;
        }

        let items = itemsForSellMaster;

        // add letters indicators to items
        const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
        items.forEach((item, index) => {
            item.letter = letters[index];
        });

        // console.log("Shop items:", items); // Log the items to check if they are fetched correctly

        const shopSettings = {
            channelId,
            title,
            description,
            thumbnail,
            image,
            footer,
            items
        };

        let shopSuccess = false;

        // // set discord `client` event listener
        // client.on(Events.InteractionCreate, async interaction => {
        //     try {
        //         await handleShopButtonClick(interaction, shopSettings);
        //         // console.info("Shop settings available, handling buy interaction.", shopSuccess);
        //     } catch (error) {
        //         // console.error("Error handling buy interaction:", error);
        //     }
        // });

        // return shop settings object because we need to use it in the main file 
        // to set the event command listener
        return shopSettings;
    } catch (error) {
        console.error("Error in shopSettings:", error);
        return false;
    }
};

const craftSettings = async (command, client) => {
    if (!supabase) { console.error("[shopSettings] Supabase client not available."); return null; } // Or handle differently

    const getCraftCommand = async () => {
        const { data, error } = await supabase
            .from('crafts')
            .select('*')
            .eq('command', command)
            .eq('is_active', true)
            .single();

        if (error) {
            console.error("Error fetching craft command:", error);
            return false;
        }

        if (!data) {
            console.log("Craft command not found or not active.");
            return false;
        }
        return data;
    }

    const getCraftSubCommand = async () => {
        const { data, error } = await supabase
            .from('crafts')
            .select('*')
            .like('command', `${command} %`)
            .eq('is_active', true)
            .order('id', { ascending: true });

        if (error) {
            console.error("Error fetching craft sub-command:", error);
            return false;
        }
        if (!data) {
            console.log("Craft sub-command not found or not active.");
            return false;
        }
        return data;
    }

    const getCraftSubCommandItems = async (craftId) => {
        // console.log("Fetching craft materials for craft ID:", craftId);
        const { data: dataArray, error } = await supabase
            .from('craft_materials')
            .select('id, material_id, amount, materials(emoji, name)')
            .eq('craft_id', craftId)
            .eq('is_active', true)
            .eq('materials.is_active', true)
            .order('amount', { ascending: false })
            .order('material_id', { ascending: true });
        if (error) {
            console.error("Supabase query error (fetchCraftMaterials):", error);
            return false;
        }
        // console.log(`Fetched ${dataArray.length} materials for craft ID: ${craftId}`);
        return dataArray;
    }

    try {
        const craftCommand = await getCraftCommand();
        // console.log("[Craft] command:", craftCommand);

        if (craftCommand) {
            const craftSubCommand = await getCraftSubCommand();

            //console.log("[Craft] sub-command:", craftSubCommand);
            if (!craftSubCommand) {
                console.log("[Craft] No items for craft : craftSubCommand", craftSubCommand);
            }

            let description = craftCommand.description + '\n\n';
            let fieldsItems = [];
            const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];

            await Promise.all(craftSubCommand.map(async (item, index) => {
                const letter = letters[index]; // Consistent letter assignment

                const { data: itemToCraft, error: craftSubCommandMainItemErr } = await supabase.from("materials")
                    .select("id,emoji,name")
                    .eq('is_active', true)
                    .eq("id", item.material_id)
                    .single();

                if (craftSubCommandMainItemErr) {
                    console.error("[Craft] Error fetching item to craft:", craftSubCommandMainItemErr);
                    return;
                }

                // console.log("[Craft] sub-command: itemToCraft", itemToCraft);

                if (!itemToCraft) {
                    console.log("[Craft] No items for craft : itemToCraft", itemToCraft);
                    return;
                }

                const materialsForItemToCraft = await getCraftSubCommandItems(item.id);
                // console.log("[Craft] materialsForItemToCraft:", materialsForItemToCraft);

                fieldsItems[index] = {
                    id: itemToCraft.id,
                    emoji: itemToCraft.emoji,
                    name: itemToCraft.name,
                    amount: 1,
                    letter: letter,
                    materials: materialsForItemToCraft
                };
            }));

            // Now fieldsItems is populated with all items
            const craftSettingObj = {
                channelId: '0',
                title: craftCommand.title,
                description: description,
                items: fieldsItems
            };

            return craftSettingObj;
        } else {
            console.log('[Craft] No items for craft', craftCommand);
            return false;
        }
    } catch (error) {
        console.error("[Craft] Error in craftSettings:", error);
        return false;
    }
};

const getShopMaterialsForSell = async () => {
    const date = new Date();
    const today = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
    const cacheDir = CACHE_MAT_SELL_DIR;
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    const cacheFile = join(cacheDir, `${today}_shop_materials.json`);

    try {
        if (fs.existsSync(cacheFile)) {
            const data = fs.readFileSync(cacheFile);
            console.log('[Shop] using cached json');
            return JSON.parse(data);
        }

        const { data: rarity1Data, error: rarity1Error } = await supabase.rpc('get_materials_by_rarity_1');
        const { data: rarity2Data, error: rarity2Error } = await supabase.rpc('get_materials_by_rarity_2');
        const { data: rarity3Data, error: rarity3Error } = await supabase.rpc('get_materials_by_rarity_3');

        let combinedResults = [];
        if (rarity1Error || rarity2Error || rarity3Error) {
            console.error('Error fetching materials:', rarity1Error || rarity2Error || rarity3Error);
        } else {
            combinedResults = [...rarity1Data, ...rarity2Data, ...rarity3Data];
        }

        const buildPrice = (rarity_id) => {
            switch (rarity_id) {
                case 1:
                    return 10;
                case 2:
                    return 15;
                case 3:
                    return 30;
                default:
                    return 10;
            }
        };

        if (combinedResults && combinedResults.length <= 0) return [];
        const returnData = combinedResults.map((row) => {
            const ID = Math.floor(1000 + Math.random() * 9000);
            return {
                id: ID,
                shop_id: 1,
                price: buildPrice(row.rarity_id), // use amount
                currency: 'Como',
                created_at: '2025-05-19T12:14:50.611711+00:00',
                is_active: true,
                material_id: row.id,
                amount: 1,
                material_use_id: 68, // use Como
                materials: { id: row.id, name: row.name, emoji: row.emoji }
            };
        });
        fs.writeFileSync(cacheFile, JSON.stringify(returnData));
        console.log('[Shop] refresh data from database');
        return returnData;
    } catch (error) {
        console.error('Error in getShopMaterialsForSell:', error);
        return [];
    }
}

module.exports = {
    shopSettings,
    craftSettings
};