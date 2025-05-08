// command/leaderboard.js

// --- Required Libraries ---
const { EmbedBuilder } = require('discord.js');

// --- Database Helper (Internal to this command) ---
/**
 * Retrieves the top users based on level and EXP for the leaderboard.
 * @param {object} supabase - The initialized Supabase client instance.
 * @param {number} limit - The maximum number of users to retrieve. Default is 10.
 * @returns {Promise<Array|null>} An array of user objects or null on error.
 */
const getLeaderboardUsers = async (supabase, limit = 10) => {
    // Assume supabase is valid if passed in
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('id, username, level, current_exp')
            .order('level', { ascending: false })
            .order('current_exp', { ascending: false })
            .limit(limit);

        if (error && error.code !== 'PGRST116') {
            console.error(`[Leaderboard] Error fetching users:`, error.message);
            return null;
        }
        return users || [];
    } catch (error) {
        console.error(`[Leaderboard] Unexpected error fetching users:`, error);
        return null;
    }
};

/**
   * Handles the leaderboard command. using '!leaderboard'
   * display player level ranking
   * @param {object} message - Discord message object.
   * @param {object} supabase - The initialized Supabase client instance.
   * @param {object} client - The Discord client instance.
   */
const handleLeaderboardCommand = async (message, supabase, client) => {
    try {

        if (!supabase) {
            console.error("[Leaderboard Command] Supabase client is missing!");
            message.reply('ฐานข้อมูลมีปัญหา โปรดติดต่อผู้ดูแล 😥');
            return;
        }

        const username = message.author.username;
        const topUsersLimit = 10;

        console.log(`[${username}] Requested leaderboard via external command.`); // Log difference
        const leaderboardUsers = await getLeaderboardUsers(supabase, topUsersLimit);

        if (leaderboardUsers === null) {
            message.reply('อุ๊ปส์! มีข้อผิดพลาดตอนดึงข้อมูลอันดับ ลองใหม่นะ');
            return;
        }

        if (leaderboardUsers.length === 0) {
            message.reply('ยังไม่มีใครติดอันดับเลยนะ! มาเริ่มเก็บเวลกัน! 💪');
            console.log(`Leaderboard requested by [${username}] but it's empty.`);
            return;
        }

        const leaderboardEntries = leaderboardUsers.map((user, index) => {
            return `\`${index + 1}.\` <@${user.id}> - **เลเวล ${user.level}**`;
        }).join('\n');

        const leaderboardEmbed = new EmbedBuilder()
            .setColor(0xFFD700)
            .setTitle('🏆 สุดยอดนักผจญภัย 🏆')
            .setDescription(`✨ นี่คือ **${leaderboardUsers.length}** อันดับแรกของผู้เล่นที่แข็งแกร่งที่สุด! ✨\n\n${leaderboardEntries}`)
            .setThumbnail(client.user.displayAvatarURL())
            .setFooter({ text: 'ไต่แรงค์กันต่อไปนะ สู้ๆ! 🔥' })
            .setTimestamp();

        message.reply({ embeds: [leaderboardEmbed] });
        console.log(`[${username}] Replied with the leaderboard (external).`);

    } catch (error) {
        console.error('[Leaderboard Command] Error during execution:', error);
        message.reply('อุ๊ปส์! มีข้อผิดพลาดตอนสร้างตารางอันดับ ลองใหม่นะ');
    }
}

// --- Command Export ---
module.exports = { handleLeaderboardCommand };