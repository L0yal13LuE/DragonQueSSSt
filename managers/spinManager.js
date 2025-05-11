const { supabase } = require('../supabaseClient');
const { EmbedBuilder } = require('discord.js');

/**
 * Handles the '!spin' command to fetch and display a random card.
 * @param {object} message - The Discord message object.
 */
const handleSpinCommand = async (message) => {
    // Check if the Supabase client is available (imported)
    if (!supabase) {
        message.reply('ฐานข้อมูลมีปัญหา ลองอีกครั้งนะ 😥'); // Database issue reply (Thai)
        message.reply('Database connection issue. Please try again later. 😥'); // Database issue reply
        console.error(`[${message.author.username}] Spin command failed: Supabase client unavailable.`);
        return null; // Indicate failure or handle error appropriately
    }

    try {
        // Fetch all cards from the 'cards' table
        const { data: cardData, error } = await supabase.from('cards').select('*');

        // Handle potential errors during fetch
        if (error) {
            console.error(`Error fetching cards for spin command:`, error);
            message.reply('อุ๊ปส์! มีปัญหาตอนหยิบการ์ด ลองใหม่นะ'); // Error fetching reply (Thai)
            return null;
        }

        // Check if any cards were returned
        if (cardData && cardData.length > 0) {
            // Select a random card from the fetched data
            const randomCard = cardData[Math.floor(Math.random() * cardData.length)];

            // Create an embed to display the found card
            const cardEmbed = new EmbedBuilder()
                .setColor(0x8A2BE2) // Purple color
                .setTitle(`✨ Card Found ✨`) // Thai: Found a Card!
                .setDescription(`${message.author.toString()} found a card! \n**[${randomCard.code}] ${randomCard.title}**`)
                // Optional: .setImage(randomCard.image_url || null) // If you have image URLs
                .setFooter({ text: `Congratz!` }) // Thai: Congratulations!
                .setTimestamp();

            message.reply({ embeds: [cardEmbed] });
            console.log(`[${message.author.username}] Spun and found card: [${randomCard.code}] ${randomCard.title}`);
        } else {
            message.reply('อ๊ะ! ไม่มีการ์ดในระบบเลยแฮะ 😮'); // No cards found reply (Thai)
            console.log(`[${message.author.username}] Tried to spin, but no cards found in DB.`);
        }
    } catch (error) {
        console.error(`Unexpected error during spin command for ${message.author.username}:`, error);
        message.reply('เกิดข้อผิดพลาดที่ไม่คาดคิด ลองใหม่อีกครั้งนะ'); // Unexpected error reply (Thai)
        return null;
    }
};

// Export the function to be used in other files
module.exports = { handleSpinCommand };