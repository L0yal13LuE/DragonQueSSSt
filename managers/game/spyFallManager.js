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
  createSpyFallInvitationEmbed,
  createSpyFallRoleDMEmbed,
} = require("../embedManager");

const CONSTANTS = require("../../constants");

const spyFallGame = new Map();
const prefix = "SPYFALL";
const MINIMUM_PLAYER = 3;

const handleSpyFallButton = async (interaction, client) => {
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
  let game = spyFallGame.get(gameKey);
  if (!game) {
    await interaction.followUp({
      content: "This game lobby has expired or could not be found.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  switch (action) {
    case "JOIN":
      _handleJoinButton(interaction, game);
      return;
    case "LEAVE":
      _handleLeaveButton(interaction, game);
      return;
    case "START":
      _handleStartButton(interaction, game, client);
      return;
    default:
      return;
  }
};

const _handleJoinButton = async (interaction, game) => {
  const commander = interaction.user;
  const messageId = game.messageId;
  const gameKey = `${prefix}-${messageId}`;

  // Prevent duplicate players
  if (game.players.some((player) => player.user.id === commander.id)) {
    await interaction.followUp({
      content: "You have already joined this game.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  game.players.push({
    user: commander,
    roleId: 0,
  });
  spyFallGame.set(gameKey, game); // Update the game state in the map

  game = spyFallGame.get(gameKey);
  await _handlePreGameEmbed(interaction, game);
};

const _handleLeaveButton = async (interaction, game) => {
  const commander = interaction.user;
  const messageId = game.messageId;
  const gameKey = `${prefix}-${messageId}`;

  // Host cannot leave the game
  if (game.commander.id == commander.id) {
    await interaction.followUp({
      content: "Host cannot leave the game.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Prevent players that're not even join the game
  if (!game.players.some((player) => player.user.id === commander.id)) {
    await interaction.followUp({
      content: "You haven't joined this game yet.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const index = game.players.findIndex(
    (player) => player.user.id === commander.id
  );
  if (index !== -1) {
    game.players.splice(index, 1); // Remove 1 item at that index
  }

  spyFallGame.set(gameKey, game); // Update the game state in the map

  game = spyFallGame.get(gameKey);
  await _handlePreGameEmbed(interaction, game);
};

const _handleStartButton = async (interaction, game, client) => {
  const commander = interaction.user;
  const messageId = game.messageId;
  const gameKey = `${prefix}-${messageId}`;

  // Only host can start the game
  if (game.commander.id != commander.id) {
    await interaction.followUp({
      content: "Only host can start the game.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const pool = [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
    22, 23, 24,
  ];

  const players = _setSpyRole(game.players, pool);
  game.players = players;
  spyFallGame.set(gameKey, game); // Update the game state in the map

  for (const player of game.players) {
    try {
      const message = createSpyFallRoleDMEmbed();

      const user = await client.users.fetch(player.user.id); // Fetch the user
      await user.send(message);
    } catch (error) {
      console.error(`❌ Failed to send DM to user ${userId}:`, error.message);
    }
  }
};

function _setSpyRole(players, itemPool, spyCount = 0) {
  const playerCount = players.length;
  if (spyCount == 0) {
    if (playerCount >= 11) spyCount = 3;
    else if (playerCount >= 7) spyCount = 2;
    else if (playerCount >= 3) spyCount = 1;
  }

  const randomItem = itemPool[Math.floor(Math.random() * itemPool.length)];
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  const spies = shuffled.slice(0, spyCount).map((item) => item.user.id);

  const result = [];

  players.forEach((item) => {
    const aa = {
      user: item.user,
      roleId: spies.some((spy) => spy === item.user.id) ? 2 : 1, // 2 = spy, 1 = normal player
      item: spies.some((spy) => spy === item.user.id) ? null : randomItem,
    };

    result.push(aa);
  });

  // Return full player object list
  return result;
}

const handleSpyFallCommand = async (interaction) => {
  const commander = interaction.user;

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply();
  }

  const countdownMinutes = 5;
  const expiresAt = Math.floor(Date.now() / 1000) + countdownMinutes * 60;
  const initialPlayerPool = [
    {
      user: commander,
      roleId: 0,
    },
  ];

  const embed = createSpyFallInvitationEmbed(
    commander,
    expiresAt,
    initialPlayerPool
  );

  let replyMessage = await interaction.followUp({
    embeds: [embed],
  });

  const gameKey = `${prefix}-${replyMessage.id}`;

  spyFallGame.set(`${gameKey}`, {
    commander: commander,
    players: initialPlayerPool,
    messageId: replyMessage.id,
    expiresAt: expiresAt,
  });

  const game = spyFallGame.get(gameKey);
  await _handlePreGameEmbed(interaction, game);
};

const _handlePreGameEmbed = async (interaction, game) => {
  // Step: Edit the reply with the updated embed
  const embed = createSpyFallInvitationEmbed(
    game.commander, // Use the original host
    game.expiresAt, // Use the stored expiration time
    game.players,
    MINIMUM_PLAYER
  );

  // Step: Add button
  const rows = _createPreGameButton(game.messageId, game.players);

  // Step: Edit the reply with the updated embed
  await interaction.editReply({ embeds: [embed], components: rows });
};

const _createPreGameButton = (messageId, playerLists = []) => {
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
