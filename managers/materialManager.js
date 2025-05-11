const { supabase } = require('../supabaseClient');
const { getMaterialByChannel } = require("../providers/materialProvider");
const { createBaseEmbed } = require("../managers/embedManager");
/**
 * Handles the '!spin' command to fetch and display a random card.
 * @param {object} message - The Discord message object.
 */
const handleMaterialCommand = async (message) => {
  try {
    if (!supabase) { message.reply("ฐานข้อมูลมีปัญหา โปรดติดต่อผู้ดูแล"); return; }

    const channelId = message.channelId;
    const materialData = await getMaterialByChannel({
      channelId: channelId,
    });    

    if (materialData && materialData.length > 0) {
      const itemList = materialData
        .map(
          (entry) =>
            `${entry.material.emoji} ${entry.material.name} (${(entry.material.rarity.drop_rate * 100).toFixed(2)}%)`
        )
        .join("\n");

      const materialEmbed = createBaseEmbed({
        color: 0x8a2be2,
        title: `✨ Possible Materials ✨`,
        description: itemList,
      });

      message.reply({ embeds: [materialEmbed] });
    } else {
      const materialEmbed = createBaseEmbed({
        color: 0x8a2be2,
        title: `✨ No materials found for this channel ✨`,
      });

      message.reply({ embeds: [materialEmbed] });
    }
  } catch (error) {
    console.error(
      `Unexpected error during material command for ${message.author.username}:`,
      error
    );
    message.reply("เกิดข้อผิดพลาดที่ไม่คาดคิด ลองใหม่อีกครั้งนะ"); // Unexpected error reply (Thai)
    return null;
  }
};

// Export the function to be used in other files
module.exports = { handleMaterialCommand };
