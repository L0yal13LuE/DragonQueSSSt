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

const spyFallGame = new Map();
const prefix = "SPYFALL";
const MINIMUM_PLAYER = 2;

const handleJoinButton = async (interaction, parts) => {
  const commander = interaction.user;

  const messageId = parts[1];
  const gameKey = `${prefix}-${messageId}`;
  const game = spyFallGame.get(gameKey);
  if (!game) {
    await interaction.followUp({
      content: "This game lobby has expired or could not be found.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Prevent duplicate players
  if (game.players.includes(commander.id)) {
    await interaction.followUp({
      content: "You have already joined this game.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  game.players.push(commander.id);
  spyFallGame.set(gameKey, game); // Update the game state in the map

  if (game.players.length >= MINIMUM_PLAYER) {
    const embed = createSpyFallInvitationEmbed(
      game.commander, // Use the original host
      game.expiresAt, // Use the stored expiration time
      game.players
    );

    // Step: Add button
    const rows = createPreGameButton(messageId, game.players);

    // Step: Edit the reply with the updated embed
    await interaction.editReply({ embeds: [embed], components: rows });
  } else {
    const embed = createSpyFallInvitationEmbed(
      game.commander, // Use the original host
      game.expiresAt, // Use the stored expiration time
      game.players,
      MINIMUM_PLAYER
    );

    // Step: Edit the reply with the updated embed
    await interaction.editReply({ embeds: [embed] });
  }
};

const handleLeaveButton = async (interaction, parts) => {
  const commander = interaction.user;

  const messageId = parts[1];
  const gameKey = `${prefix}-${messageId}`;
  const game = spyFallGame.get(gameKey);
  if (!game) {
    await interaction.followUp({
      content: "This game lobby has expired or could not be found.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Host cannot leave the game
  if ((game.commander.id = commander.id)) {
    await interaction.followUp({
      content: "Host cannot leave the game.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Prevent players that're not even join the game
  if (!game.players.includes(commander.id)) {
    await interaction.followUp({
      content: "You haven't joined this game yet.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const index = game.players.indexOf(commander.id);
  if (index !== -1) {
    game.players.splice(index, 1); // Remove 1 item at that index
  }

  spyFallGame.set(gameKey, game); // Update the game state in the map

  if (game.players.length >= MINIMUM_PLAYER) {
    const embed = createSpyFallInvitationEmbed(
      game.commander, // Use the original host
      game.expiresAt, // Use the stored expiration time
      game.players
    );

    // Step: Add button
    const rows = createPreGameButton(messageId, game.players);

    // Step: Edit the reply with the updated embed
    await interaction.editReply({ embeds: [embed], components: rows });
  } else {
    const embed = createSpyFallInvitationEmbed(
      game.commander, // Use the original host
      game.expiresAt, // Use the stored expiration time
      game.players,
      MINIMUM_PLAYER
    );

    // Step: Edit the reply with the updated embed
    await interaction.editReply({ embeds: [embed] });
  }
};

const handleSpyFallButton = async (interaction) => {
  const commander = interaction.user;

  // Step: Defer the interaction
  try {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.deferUpdate();
    } else {
      return;
    }
  } catch (deferError) {
    console.error(
      `Error deferring update for ${commander.id}: ${deferError.message}`
    );
    return;
  }

  // Step 2: Verify custom ID
  const parts = interaction.customId.split("-");
  if (parts.length !== 3) {
    console.warn(
      `Malformed nav customId for ${commander.id}: ${interaction.customId}`
    );
    return;
  }

  // Step: Extract data from custom ID
  const messageId = parts[1];
  const action = parts[2];

  const gameKey = `${prefix}-${messageId}`;
  const game = spyFallGame.get(gameKey);
  if (!game) {
    await interaction.followUp({
      content: "This game lobby has expired or could not be found.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  switch (action) {
    case "JOIN":
      handleJoinButton(interaction, parts);
      return;
    case "LEAVE":
      handleLeaveButton(interaction, parts);
      return;
    case "START":
      handleJoinButton(interaction, parts);
      return;
    default:
      return;
  }
};

const handleSpyFallCommand = async (interaction) => {
  const commander = interaction.user;

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply();
  }

  const countdownMinutes = 5;
  const expiresAt = Math.floor(Date.now() / 1000) + countdownMinutes * 60;
  const embed = createSpyFallInvitationEmbed(commander, expiresAt, [
    commander.id,
  ]);

  let replyMessage = await interaction.followUp({
    embeds: [embed],
  });

  // Step: Add button
  const rows = createPreGameButton(replyMessage.id);

  spyFallGame.set(`${prefix}-${replyMessage.id}`, {
    commander: commander,
    players: [commander.id],
    message: replyMessage,
    expiresAt: expiresAt,
  });

  // Step: Edit the reply
  await replyMessage
    .edit({ components: rows })
    .catch((e) =>
      console.warn(
        "Failed to edit SPYFALL buttons with final components:",
        e.message
      )
    );
};

const createPreGameButton = (messageId, playerLists = []) => {
  const rows = [];
  const button = new ActionRowBuilder().addComponents([
    new ButtonBuilder()
      .setCustomId(`${prefix}-${messageId}-JOIN`)
      .setLabel(`Join Game`)
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${prefix}-${messageId}-LEAVE`)
      .setLabel(`Leave Game`)
      .setStyle(ButtonStyle.Danger),
  ]);

  let joinButton = new ButtonBuilder()
    .setCustomId(`${prefix}-${messageId}-START`)
    .setLabel(`Start Game`)
    .setStyle(ButtonStyle.Success);

  if (playerLists.length < MINIMUM_PLAYER) {
    joinButton.setDisabled(true);
  }
  button.addComponents(joinButton);

  rows.push(button);

  return rows;
};

// Export the function to be used in other files
module.exports = { handleSpyFallCommand, handleSpyFallButton };
