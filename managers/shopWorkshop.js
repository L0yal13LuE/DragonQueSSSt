const { supabase } = require('../supabaseClient');
const { getShop, getShopItems } = require('./../dbUtils');

const shopSettings = async (channelId) => {
    // define default value
    let title = 'Master Shiro\'s Shop';
    let description = 'Welcome, See what wares I have for sale';
    let thumbnail = '<URL>';
    let image = '<URL>';
    let footer = 'Hope you like it!';
    let itemsForSellMaster = [];
    
    // Get shop data by channel id
    if (!supabase) { console.error("[shopSettings] Supabase client not available."); return null; } // Or handle differently
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
        const shopItems = await getShopItems(shopData.id);
        
        // Check if shopItems is not null and has items
        if (shopItems && shopItems.length > 0) {
            itemsForSellMaster = shopItems;
        }
    } else {
        console.log('No shop found for channel', channelId);
    }

    const items = itemsForSellMaster;
    
    return {
        channelId,
        title,
        description,
        thumbnail,
        image,
        footer,
        items
    };
};

module.exports = {
    shopSettings
};