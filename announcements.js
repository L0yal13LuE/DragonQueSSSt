const { EmbedBuilder } = require('discord.js');
const { supabase } = require('./supabaseClient');
const { markRewardAnnounced, deleteMonsterHits } = require('./dbUtils'); // Need DB utils here

/**
 * Sends the bot online announcement to the announcement channel.
 */
const sendOnlineAnnouncement = async (announcementChannel) => {
    if (!announcementChannel) {
        console.error('Announcement channel not found. Cannot send online announcement.');
        return;
    }
    const onlineMessage = `☀️ **Adventure, wake up!** <@&1378563196763242557>\nYour RPG bot is **online and ready to play**! ✨\nGo collect EXP in the city and resources area to earn new levels, items, and resources! 🔥\nType \`!bag\` to see your items, \`!level\` to see your level, and \`!monster\` to see the monsters! 🎯\nUse \`!craft\` to craft items, \`!shop\` to buy items, and \`/send\` to trade with friends!\nIt's time to **start your adventure!**, Click profile to learn more! 🚀`;
    try {
        await announcementChannel.send(onlineMessage);
        console.log('Bot online announcement sent.');
    } catch (error) { console.error('Error sending online announcement:', error); }
};

/**
 * Sends a level up announcement embed to the announcement channel.
 */
const handleLevelUpAnnouncement = (message, newLevel, currentExp, announcementChannel) => {
    if (!announcementChannel) {
        console.warn(`[${message.author.username}] Leveled up, but announcement channel unavailable.`);
        return;
    }
    // Need to recalculate next level exp here or pass it in
    const { calculateNextLevelExp } = require('./gameLogic'); // Lazy require to avoid circular dependency if needed, or pass value

    const levelUpEmbed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('🎉 Level Up! 🎉')
        .setDescription(`${message.author.toString()} just leveled up! Great job 👍`)
        .addFields(
            { name: 'New Level', value: newLevel.toString(), inline: true },
            { name: 'Current EXP', value: currentExp.toString(), inline: true },
            { name: 'EXP for Next Level', value: calculateNextLevelExp(newLevel).toString(), inline: true }
        )
        .setThumbnail(message.author.displayAvatarURL())
        .setTimestamp();

    try {
        announcementChannel.send({ embeds: [levelUpEmbed] });
        console.log(`[${message.author.username}] Sent level up announcement.`);
    } catch (error) {
        console.error(`Error sending level up announcement for ${message.author.username}:`, error);
    }
};


/**
 * Announces that a new monster has spawned in the announcement channel.
 */
const announceMonsterSpawn = (announcementChannel, monsterData) => {
    if (!announcementChannel || !monsterData) {
        console.warn("Cannot announce monster spawn: Channel or monster data missing.");
        return;
    }

    const spawnEmbed = new EmbedBuilder()
        .setColor(0xFF4500)
        .setTitle(`💥 Monster Invasion! ${monsterData.name} Has Appeared! 💥`)
        .setDescription(`**${monsterData.name}** has appeared! Attack it by chatting in any channel to earn EXP!\nEveryone’s EXP counts as damage to the boss! 🔥`)
        .addFields(
            { name: 'Total HP', value: `**${monsterData.max_hp}**`, inline: true },
            { name: 'Spawn Date', value: monsterData.spawn_date, inline: true }
        )
        .setTimestamp();

    try {
        announcementChannel.send({
            content: "<@&1378563196763242557> The daily challenge mission has begun!",
            embeds: [spawnEmbed]
        });
        console.log(`Announced spawn of ${monsterData.name}`);
    } catch (error) {
        console.error(`Error sending monster spawn announcement for ${monsterData.name}:`, error);
    }
};
/**
 * Announces monster defeat in the announcement channel, marks reward announced in DB, and deletes hits.
 */
const announceMonsterDefeat = async (announcementChannel, monsterData) => {
    if (!announcementChannel || !monsterData) {
        console.warn("Cannot announce monster defeat: Channel or monster data missing.");
        return;
    }
    if (!supabase) {
        console.warn("Cannot announce monster defeat: Supabase client missing.");
        return;
    }

    const killerUser = monsterData.killed_by_user_id ? `<@${monsterData.killed_by_user_id}>` : "the adventurers";
    const defeatEmbed = new EmbedBuilder()
        .setColor(0x32CD32)
        .setTitle(`🎉 Victory! ${monsterData.name} Has Been Defeated! 🎉`)
        .setDescription(`**${monsterData.name}** has been defeated! Congrats to **${killerUser}** for landing the final blow! 🏆`)
        .addFields(
            { name: 'Defeated On', value: monsterData.spawn_date, inline: true },
            { name: 'Total HP', value: monsterData.max_hp.toString(), inline: true }
        )
        .setTimestamp(monsterData.killed_at_timestamp ? new Date(monsterData.killed_at_timestamp) : new Date());

    if (monsterData.killed_by_user_id) {
        defeatEmbed.addFields({
            name: 'Final Blow By',
            value: `<@${monsterData.killed_by_user_id}>`,
            inline: true
        });
    }

    if (monsterData.killed_at_timestamp) {
        defeatEmbed.addFields({
            name: 'Time Defeated',
            value: `<t:${Math.floor(new Date(monsterData.killed_at_timestamp).getTime() / 1000)}:R>`,
            inline: true
        });
    }

    try {
        await announcementChannel.send({
            content: "<@&1378563196763242557> Daily monster defeated successfully!",
            embeds: [defeatEmbed]
        });
        console.log(`Announced defeat of ${monsterData.name}`);
        await markRewardAnnounced(monsterData.spawn_date);
        await deleteMonsterHits(monsterData.spawn_date); // Delete hits after successful announcement and marking
    } catch (error) {
        console.error(`Error sending monster defeat announcement, marking reward, or deleting hits for ${monsterData.spawn_date}:`, error);
    }
};

module.exports = {
    sendOnlineAnnouncement, handleLevelUpAnnouncement, announceMonsterSpawn, announceMonsterDefeat
};