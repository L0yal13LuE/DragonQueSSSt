const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");

const {
  getCachedData,
  saveCachedData,
  deleteCachedData,
} = require("../../providers/cacheProvider");

const {
  createAssembleEmbed,
  createAssembleFinalEmbed,
  createGameInvatationEmbed,
  createSpyFallInvitationEmbed,
} = require("../embedManager");

const CONSTANTS = require("../../constants");
const LIMIT_TURN = 10;
const HINT_TURN = [4, 8];

const handleSpyFallPlayerRecruitment = async (interaction) => {
  const commander = interaction.user;

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply();
  }

  const embed = createSpyFallInvitationEmbed(commander);

  let replyMessage = await interaction.followUp({
    embeds: [embed],
  });
};

// Export the function to be used in other files
module.exports = { handleSpyFallPlayerRecruitment };
