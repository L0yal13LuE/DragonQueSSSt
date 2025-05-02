const { EmbedBuilder } = require('discord.js');
const { getUser, getUserItems, getMonsterForDate, getTotalDamageDealt } = require('./dbUtils');
const { calculateNextLevelExp, getTodaysDateString } = require('./gameLogic');

/**
 * Handles the '!rank' command with a fancier embed and progress bar. Works in any channel.
 * @param {object} message - Discord message object.
 * @param {object} supabase - Supabase client instance.
 */
const handleRankCommand = async (message, supabase) => {
    if (!supabase) {
        message.reply('ฐานข้อมูลมีปัญหา เช็คอันดับไม่ได้จ้า 😥'); // Thai Error
        return;
    }

    const userId = message.author.id;
    const username = message.author.username;
    const userAvatar = message.author.displayAvatarURL(); // Get user avatar URL

    try {
        const userData = await getUser(supabase, userId);
        if (userData) {
            const userLevel = userData.level;
            const userExp = userData.current_exp;
            const nextLevelExp = calculateNextLevelExp(userLevel);

            // --- Progress Bar Calculation ---
            const totalBlocks = 10; // Number of blocks in the progress bar
            let filledBlocks = 0;
            let percentage = 0;

            if (nextLevelExp > 0) { // Avoid division by zero
                const cappedExp = Math.min(userExp, nextLevelExp);
                percentage = (cappedExp / nextLevelExp) * 100;
                filledBlocks = Math.floor(percentage / (100 / totalBlocks));
            } else {
                filledBlocks = totalBlocks; // Max out bar if next level isn't defined properly
                percentage = 100;
            }

            const emptyBlocks = totalBlocks - filledBlocks;
            const progressBar = '🟩'.repeat(filledBlocks) + '⬛'.repeat(emptyBlocks);
            // --- End Progress Bar Calculation ---

            const rankEmbed = new EmbedBuilder()
                .setColor(0xFFD700) // Gold color for flair
                .setTitle(`🌟 เลเวล 🌟`)
                .setDescription(`${message.author.toString()} ขอส่องหน่อยซิว่าไปถึงไหนแล้ว!`)
                .setThumbnail(userAvatar)
                .addFields(
                    { name: 'เลเวลปัจจุบัน', value: `**${userLevel}**`, inline: true },
                    { name: 'ค่าประสบการณ์ (EXP)', value: `${userExp} / ${nextLevelExp}`, inline: true },
                    { name: 'ความคืบหน้าเลเวลถัดไป', value: `${progressBar} (${percentage.toFixed(1)}%)`, inline: false }
                )
                .setFooter({ text: `สะสม EXP ต่อไปนะ สู้ๆ! 💪` })
                .setTimestamp();

            message.reply({ embeds: [rankEmbed] });
            console.log(`[${username}] Replied to !rank in channel ${message.channel.name}.`);

        } else {
            message.reply('คุณยังไม่มีอันดับเลยนะ! ส่งข้อความเพื่อเริ่มเก็บ EXP สิ! 💪'); // Thai Encouragement
            console.log(`[${username}] User not found for !rank.`);
        }
    } catch (error) {
        console.error('Error during rank command:', error);
        message.reply('อุ๊ปส์! มีข้อผิดพลาดตอนเช็คอันดับ ลองใหม่นะ'); // Thai Error
    }
};

/**
 * Handles the '!chat' command.
 */
const handleChatCommand = async (message, args) => {
    const userMessage = args.join(' ');
    if (!userMessage) {
        message.reply('ลืมใส่ข้อความรึเปล่า? บอกหน่อยสิว่าจะให้พูดว่าอะไร 😉');
        return;
    }
    try {
        await message.channel.send(userMessage);
        console.log(`[${message.author.username}] Repeated chat message.`);
    } catch (error) {
        console.error('Error sending chat reply:', error);
        message.reply('อ่า... ส่งข้อความนี้ไม่ได้แฮะ ขอโทษที 🙏');
    }
};

/**
 * Handles the '!bag' command.
 */
const handleBagCommand = async (message, supabase) => {
    if (!supabase) {
        message.reply('ฐานข้อมูลมีปัญหา เปิดกระเป๋าไม่ได้จ้า 😥');
        return;
    }
    const userId = message.author.id;
    const username = message.author.username;
    try {
        const userItems = await getUserItems(supabase, userId);
        // Group items by name before displaying
        const groupedItems = (userItems || []).reduce((acc, item) => {
             const key = item.itemname;
             if (!acc[key]) {
                 acc[key] = { emoji: item.itememoji, name: item.itemname, amount: 0 };
             }
             acc[key].amount += item.itemamount;
             return acc;
        }, {});

        const itemList = Object.values(groupedItems).length > 0
            ? Object.values(groupedItems).map(value => `${value.emoji} ${value.name}: ${value.amount}`).join('\n')
            : "กระเป๋าว่างเปล่าเลย... แชทเล่นหาของกันเถอะ!";

        const bagEmbed = new EmbedBuilder()
            .setColor(0x8A2BE2)
            .setTitle(`🎒 กระเป๋าของฉัน 🎒`)
            .setDescription(`${message.author.toString()} เปิดดูข้างในกระเป๋าหน่อยสิ\n\n${itemList}`)
            .setFooter({ text: `สะสมไอเทมเอาไว้นะเผื่อแลกรางวัล 😉` })
            .setTimestamp();
        message.reply({ embeds: [bagEmbed] });
        console.log(`[${username}] Replied to !bag.`);
    } catch (error) {
        console.error('Error during bag command:', error);
        message.reply('อุ๊ปส์! มีข้อผิดพลาดตอนเปิดกระเป๋า ลองใหม่นะ');
    }
};

/**
 * Handles the '!monster' command to show today's monster status.
 */
const handleMonsterCommand = async (message, supabase, currentMonsterState) => {
    if (!supabase) {
        message.reply('ฐานข้อมูลมีปัญหา เช็คสถานะมอนไม่ได้จ้า 😥');
        return;
    }
    const today = getTodaysDateString();
    console.log(`[${message.author.username}] Requested monster status for ${today}.`);
    try {
        // Use cached state if available and for today, otherwise fetch
        let monsterData = currentMonsterState && currentMonsterState.spawn_date === today
            ? currentMonsterState
            : await getMonsterForDate(supabase, today);

        if (monsterData) {
            let status = monsterData.is_alive ? "⚔️" : "☠️";
            let remainingHpText = "0";
            let color = monsterData.is_alive ? 0xFF4500 : 0x32CD32; // Orange if alive, Green if dead

            if (monsterData.is_alive) {
                const totalDamage = await getTotalDamageDealt(supabase, today);
                const remainingHp = Math.max(0, monsterData.max_hp - totalDamage);
                remainingHpText = remainingHp.toString();
                if (remainingHp <= 0) {
                    status = "☠️ (รออัพเดท)"; // Indicate defeat is imminent or pending update
                    color = 0x32CD32; // Show green if HP is 0 or less
                }
            }

            const monsterEmbed = new EmbedBuilder()
                .setColor(color)
                .setTitle(`👽 สถานะมอนสเตอร์วันนี้ (${today}) 🦑`)
                .addFields(
                    { name: 'ชื่อ', value: monsterData.name, inline: true },
                    { name: 'สถานะ', value: `**${status}**`, inline: true },
                    { name: 'พลังชีวิต (HP)', value: `${remainingHpText} / ${monsterData.max_hp}`, inline: true },
                )
                .setTimestamp();

            if (!monsterData.is_alive && monsterData.killed_by_user_id) {
                monsterEmbed.addFields({ name: 'ปิดจ๊อบโดย', value: `<@${monsterData.killed_by_user_id}>`, inline: true });
            }
            if (!monsterData.is_alive && monsterData.killed_at_timestamp) {
                monsterEmbed.addFields({ name: 'เวลาที่ปราบ', value: `<t:${Math.floor(new Date(monsterData.killed_at_timestamp).getTime() / 1000)}:R>`, inline: true });
            }
            message.reply({ embeds: [monsterEmbed] });
        } else {
            message.reply(`ยังไม่มีมอนสเตอร์เกิดวันนี้ (${today}) เลยนะ! 😴`);
            console.log(`No monster found for ${today} via !monster command.`);
        }
    } catch (error) {
        console.error('Error during monster command:', error);
        message.reply('อุ๊ปส์! มีข้อผิดพลาดตอนเช็คสถานะมอนสเตอร์ ลองใหม่นะ');
    }
};

module.exports = {
    handleRankCommand, handleChatCommand, handleBagCommand, handleMonsterCommand
};