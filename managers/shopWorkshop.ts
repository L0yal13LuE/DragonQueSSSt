import supabase from '../supabaseClient';
import { getShop, getShopItems } from '../dbUtils';

import fs from 'fs';
import { join } from 'path';

const CACHE_MAT_SELL_DIR = join(__dirname, '../cache');

const shopSettings = async (channelId: string, client: any): Promise<any> => {
  try {
    if (!supabase) { console.error('[shopSettings] Supabase client not available.'); return null; }

    let title = 'Master Shiro\'s Shop';
    let description = 'Welcome, See what wares I have for sale';
    let thumbnail = null;
    let image = null;
    let footer = 'Hope you like it!';
    let itemsForSellMaster: any[] = [];

    const shopData = await getShop(channelId);

    if (shopData) {
      title = shopData.title || title;
      description = shopData.description || description;
      thumbnail = shopData.thumbnail || thumbnail;
      image = shopData.image || image;
      footer = shopData.footer || footer;

      const shopItems = await getShopMaterialsForSell();

      if (shopItems && shopItems.length > 0) {
        itemsForSellMaster = shopItems;
      }
    } else {
      return;
    }

    let items = itemsForSellMaster;

    const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
    items.forEach((item: any, index: number) => {
      item.letter = letters[index];
    });

    const shopSettingsObj = {
      channelId,
      title,
      description,
      thumbnail,
      image,
      footer,
      items,
      instance: new Map(),
      instanceTimeout: new Map(),
    };

    return shopSettingsObj;
  } catch (error) {
    console.error('Error in shopSettings:', error);
    return false;
  }
};

const craftSettings = async (command: string, client: any): Promise<any> => {
  if (!supabase) { console.error('[shopSettings] Supabase client not available.'); return null; }

  const getCraftCommand = async (): Promise<any> => {
    try {
      const { data, error } = await supabase!
        .from('crafts')
        .select('*')
        .eq('command', command)
        .eq('is_active', true)
        .single();

      if (error) {
        console.error('Error fetching craft command:', error);
        return false;
      }

      if (!data) {
        console.log('Craft command not found or not active.');
        return false;
      }
      return data;
    } catch (error) {
      console.error('Error fetching craft command:', error);
      return false;
    }
  };

  const getCraftSubCommand = async (): Promise<any> => {
    try {
      const { data, error } = await supabase!
        .from('crafts')
        .select('*')
        .like('command', `${command} %`)
        .eq('is_active', true)
        .order('id', { ascending: true });

      if (error) {
        console.error('Error fetching craft sub-command:', error);
        return false;
      }
      if (!data) {
        console.log('Craft sub-command not found or not active.');
        return false;
      }
      return data;
    } catch (error) {
      console.error('Error fetching craft sub-command:', error);
      return false;
    }
  };

  const getCraftSubCommandItems = async (craftId: number): Promise<any> => {
    try {
      const { data: dataArray, error } = await supabase!
        .from('craft_materials')
        .select('id, material_id, amount, materials(emoji, name)')
        .eq('craft_id', craftId)
        .eq('is_active', true)
        .eq('materials.is_active', true)
        .order('amount', { ascending: false })
        .order('material_id', { ascending: true });
      if (error) {
        console.error('Supabase query error (fetchCraftMaterials):', error);
        return false;
      }
      return dataArray;
    } catch (error) {
      console.error('Error fetching craft sub-command items:', error);
      return [];
    }
  };

  try {
    const craftCommand = await getCraftCommand();

    if (craftCommand) {
      const craftSubCommand = await getCraftSubCommand();

      if (!craftSubCommand) {
        console.log('[Craft] No items for craft : craftSubCommand', craftSubCommand);
      }

      let description = craftCommand.description + '\n\n';
      const fieldsItems: any[] = [];
      const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];

      await Promise.all(craftSubCommand.map(async (item: any, index: number) => {
        const letter = letters[index];

        const { data: itemToCraft, error: craftSubCommandMainItemErr } = await supabase!
          .from('materials')
          .select('id,emoji,name')
          .eq('is_active', true)
          .eq('id', item.material_id)
          .single();

        if (craftSubCommandMainItemErr) {
          console.error('[Craft] Error fetching item to craft:', craftSubCommandMainItemErr);
          return;
        }

        if (!itemToCraft) {
          console.log('[Craft] No items for craft : itemToCraft', itemToCraft);
          return;
        }

        const materialsForItemToCraft = await getCraftSubCommandItems(item.id);

        fieldsItems[index] = {
          id: itemToCraft.id,
          emoji: itemToCraft.emoji,
          name: itemToCraft.name,
          amount: 1,
          letter: letter,
          materials: materialsForItemToCraft,
        };
      }));

      const craftSettingObj = {
        channelId: '0',
        title: craftCommand.title,
        description: description,
        items: fieldsItems,
      };

      return craftSettingObj;
    } else {
      console.log('[Craft] No items for craft', craftCommand);
      return false;
    }
  } catch (error) {
    console.error('[Craft] Error in craftSettings:', error);
    return false;
  }
};

const filterChanceOfRarity = (materials: any[], chanceToShowInPercent: number): any[] => {
  const cardList = [
    'FCO-A',
    'FCO-B',
    'FCO-C',
    'FCO-D',
    'FCO-E',
    'DCO-A',
    'DCO-B',
    'DCO-C',
    'DCO-D',
    'DCO-E',
    'SCO-A',
    'SCO-B',
    'SCO-C',
    'SCO-D',
    'SCO-E',
    'PCO',
  ];
  const filtered = materials.filter((material: any) => {
    return !cardList.includes(material.name) && (Math.floor(Math.random() * 100) <= chanceToShowInPercent);
  });
  if (filtered.length > 1) {
    return [filtered[0]];
  } else {
    return [];
  }
};

const getShopMaterialsForSell = async (): Promise<any[]> => {
  const date = new Date();
  const today = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
  const cacheDir = CACHE_MAT_SELL_DIR;
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
  const cacheFile = join(cacheDir, `shop_clan_${today}.json`);

  try {
    if (fs.existsSync(cacheFile)) {
      const data = fs.readFileSync(cacheFile, 'utf-8');
      console.log('[Shop] using cached json');
      return JSON.parse(data);
    }

    const { data: rarity1Data, error: rarity1Error } = await supabase!.rpc('get_materials_by_rarity_1');
    const { data: rarity2Data, error: rarity2Error } = await supabase!.rpc('get_materials_by_rarity_2');
    const { data: rarity3Data, error: rarity3Error } = await supabase!.rpc('get_materials_by_rarity_3');
    const { data: rarity4Data, error: rarity4Error } = await supabase!.rpc('get_materials_by_rarity_4');

    const rarity4Filtered = rarity4Data && rarity4Data.length > 0 ? filterChanceOfRarity(rarity4Data, 20) : [];
    let combinedResults: any[] = [];
    if (rarity1Error || rarity2Error || rarity3Error) {
      console.error('Error fetching materials:', rarity1Error || rarity2Error || rarity3Error);
    } else {
      combinedResults = [...(rarity1Data || []), ...(rarity2Data || []), ...(rarity3Data || []), ...rarity4Filtered];
    }

    const buildPrice = (rarity_id: number): number => {
      switch (rarity_id) {
        case 1:
          return 4;
        case 2:
          return 7;
        case 3:
          return 12;
        case 4:
          return 96;
        default:
          return 36;
      }
    };

    if (combinedResults && combinedResults.length <= 0) return [];
    const returnData = combinedResults.map((row: any) => {
      const ID = Math.floor(1000 + Math.random() * 9000);
      return {
        id: ID,
        shop_id: 1,
        price: buildPrice(row.rarity_id),
        currency: 'Como',
        created_at: '2025-05-19T12:14:50.611711+00:00',
        is_active: true,
        material_id: row.id,
        amount: 1,
        material_use_id: 1,
        materials: { id: row.id, name: row.name, emoji: row.emoji },
      };
    });
    fs.writeFileSync(cacheFile, JSON.stringify(returnData));
    console.log('[Shop] refresh data from database');
    return returnData;
  } catch (error) {
    console.error('Error in getShopMaterialsForSell:', error);
    return [];
  }
};

const clanShopChannels = async (clanNumber: number): Promise<string[] | null> => {
  try {
    const channelData = await getChannelIdForClanShop(clanNumber);
    if (!channelData) return null;
    const channelIDs = channelData.map((row: any) => row.channel_id);
    return channelIDs;
  } catch (error) {
    console.error(`Unexpected error fetching shop for ${clanNumber}:`, error);
    return null;
  }
};

const getChannelIdForClanShop = async (clanNumber: number): Promise<any> => {
  try {
    const { data: channelsData, error } = await supabase!
      .from('shop_clan')
      .select('channel_id')
      .eq('number', clanNumber)
      .eq('is_active', true);

    if (error) {
      console.error(`Error fetching channel for clan ${clanNumber}:`, error.message);
      return null;
    }

    return channelsData;
  } catch (error) {
    console.error(`Unexpected error fetching channel for ${clanNumber}:`, error);
    return null;
  }
};

const clanShopSetting = async (channelId: string, clanNumber: number): Promise<any> => {
  try {
    if (!supabase) { console.error('[shopSettings] Supabase client not available.'); return null; }

    let title = 'Master Shiro\'s Shop';
    let description = 'Welcome, See what wares I have for sale';
    let thumbnail = null;
    let image = null;
    let footer = 'Hope you like it!';
    let itemsForSellMaster: any[] = [];

    const shopData = await getShop(channelId);

    if (shopData) {
      title = shopData.title || title;
      description = shopData.description || description;
      thumbnail = shopData.thumbnail || thumbnail;
      image = shopData.image || image;
      footer = shopData.footer || footer;

      const shopItemCurrency = await getShopItems(shopData.id);
      const shopItems = shopItemCurrency;

      if (shopItems && shopItems.length > 0) {
        itemsForSellMaster = shopItems;
      }
    } else {
      return;
    }

    let items = itemsForSellMaster;

    const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
    items.forEach((item: any, index: number) => {
      item.letter = letters[index];
    });

    const shopSettingsObj = {
      channelId,
      clanNumber: clanNumber,
      title,
      description,
      thumbnail,
      image,
      footer,
      items,
      instance: new Map(),
      instanceTimeout: new Map(),
    };
    return shopSettingsObj;
  } catch (error) {
    console.error('Error in shopSettings:', error);
    return false;
  }
};

const craftClanSettings = async (craftClanData: any, clanNumber: number): Promise<any> => {
  if (!supabase) { console.error('[shopSettings] Supabase client not available.'); return null; }

  const getCraftCommand = async (): Promise<any> => {
    try {
      const { data, error } = await supabase!
        .from('crafts')
        .select('*')
        .eq('id', craftClanData.craft_id)
        .single();

      if (error) {
        console.error('Error fetching craft command:', error);
        return false;
      }

      if (!data) {
        console.log('Craft command not found or not active.');
        return false;
      }
      return data;
    } catch (error) {
      console.error('Error fetching craft command:', error);
      return false;
    }
  };

  const getCraftSubCommand = async (mainCraftCommand: string): Promise<any> => {
    try {
      const { data, error } = await supabase!
        .from('crafts')
        .select('*')
        .like('command', `${mainCraftCommand} %`)
        .eq('is_active', true)
        .order('id', { ascending: true });

      if (error) {
        console.error('Error fetching craft sub-command:', error);
        return false;
      }
      if (!data) {
        console.log('Craft sub-command not found or not active.');
        return false;
      }
      return data;
    } catch (error) {
      console.error('Error fetching craft sub-command:', error);
      return false;
    }
  };

  const getCraftSubCommandItems = async (craftId: number): Promise<any> => {
    try {
      const { data: dataArray, error } = await supabase!
        .from('craft_materials')
        .select('id, material_id, amount, materials(emoji, name)')
        .eq('craft_id', craftId)
        .eq('is_active', true)
        .eq('materials.is_active', true)
        .order('amount', { ascending: false })
        .order('material_id', { ascending: true });
      if (error) {
        console.error('Supabase query error (fetchCraftMaterials):', error);
        return false;
      }
      return dataArray;
    } catch (error) {
      console.error('Error fetching craft sub-command items:', error);
      return [];
    }
  };

  try {
    const craftCommand = await getCraftCommand();

    if (craftCommand) {
      const craftSubCommand = await getCraftSubCommand(craftCommand.command);

      if (!craftSubCommand) {
        console.log('[Craft] No items for craft : craftSubCommand', craftSubCommand);
      }

      let description = craftCommand.description + '\n\n';
      const fieldsItems: any[] = [];
      const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];

      await Promise.all(craftSubCommand.map(async (item: any, index: number) => {
        const letter = letters[index];

        const { data: itemToCraft, error: craftSubCommandMainItemErr } = await supabase!
          .from('materials')
          .select('id,emoji,name')
          .eq('is_active', true)
          .eq('id', item.material_id)
          .single();

        if (craftSubCommandMainItemErr) {
          console.error('[Craft] Error fetching item to craft:', craftSubCommandMainItemErr);
          return;
        }

        if (!itemToCraft) {
          console.log('[Craft] No items for craft : itemToCraft', itemToCraft);
          return;
        }

        const materialsForItemToCraft = await getCraftSubCommandItems(item.id);

        fieldsItems[index] = {
          id: itemToCraft.id,
          emoji: itemToCraft.emoji,
          name: itemToCraft.name,
          amount: 1,
          letter: letter,
          materials: materialsForItemToCraft,
        };
      }));

      const craftSettingObj = {
        channelId: '0',
        clanNumber: clanNumber,
        title: craftCommand.title,
        description: description,
        items: fieldsItems,
      };

      return craftSettingObj;
    } else {
      console.log('[Craft] No items for craft', craftCommand);
      return false;
    }
  } catch (error) {
    console.error('[Craft] Error in craftSettings:', error);
    return false;
  }
};

export {
  shopSettings,
  craftSettings,
  clanShopChannels,
  clanShopSetting,
  craftClanSettings,
};
