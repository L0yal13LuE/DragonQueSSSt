/**
 * Allow dev channel act like real production channel
 * by searching for a channel pair in the database.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {number} dev_channel_id
 * @returns {Promise<number | null>}
 */
const getChannelPair = async (supabase, dev_channel_id) => {
  const { data } = await supabase
    .from('channels_dev')
    .select('prod_channel_id')
    .eq('dev_channel_id', dev_channel_id)
    .single();
  return data ? data.prod_channel_id : null;
};

module.exports = { getChannelPair };
