const { getShop, getShopItems } = require('./../dbUtils');

const shopSettings = async (supabase, channelId) => {
    // define default value
    let title = 'Master Shiro\'s Shop';
    let description = 'Welcome, See what wares I have for sale';
    let thumbnail = '<URL>';
    let image = '<URL>';
    let footer = 'Hope you like it!';
    let itemsForSellMaster = [];
    
    // Get shop data by channel id
    const shopData = await getShop(supabase, channelId);
    
    // There was a bug in your console.log - fixed it to show the shop data
    // console.log('Shop Data:', shopData);

    if (shopData) {
        title = shopData.title || title;
        description = shopData.description || description;
        thumbnail = shopData.thumbnail || thumbnail;
        image = shopData.image || image;
        footer = shopData.footer || footer;
        
        // Get items in this shop
        const shopItems = await getShopItems(supabase, shopData.id);
        
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