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
} = require("../embedManager");

const CONSTANTS = require("../../constants");
const LIMIT_TURN = 10;
const HINT_TURN = [4, 8];

const handleAssembleButton = async (interaction) => {
  const commander = interaction.user;

  // Step 1: Defer the interaction
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
      `Malformed nav customId for ${userId}: ${interaction.customId}`
    );
    return;
  }

  // Step 3: Extract data from custom ID
  const messageId = parts[1];
  const selectedNumber = parts[2];

  // Step 4: Verify cache if expired already
  const gameValueKey = `${CONSTANTS.CACHE_ASSEMBLE_PREFIX}-${parts[1]}`;
  const gameCache = await getCachedData(
    gameValueKey,
    CONSTANTS.CACHE_ASSEMBLE_PREFIX
  );
  if (!gameCache) {
    await interaction.followUp({
      content: `This command is out of date. Please use the command again.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Step 5: Verify user
  const currentPlayerId = gameCache.currentPlayer.userId;
  var userPool = gameCache.log.map((entry) => entry.userId);
  if (!userPool.includes(commander.id)) {
    await interaction.followUp({
      content: `This battle is between to ${gameCache.log[0].username} and ${gameCache.log[1].username}.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  } else {
    if (commander.id !== currentPlayerId) {
      await interaction.followUp({
        content: `This turn belong to ${gameCache.currentPlayer.username}. Please wait for your turn.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  // Step 6: create embed

  var currentPlayer = gameCache.log.filter(
    (item) => item.userId == commander.id
  )[0];
  var nextPlayer = switchTurn(currentPlayer.userId, gameCache.log);
  var player1Log = gameCache.log.filter((item) => item.order == 0)[0];
  var player2Log = gameCache.log.filter((item) => item.order == 1)[0];

  if (player1Log.userId == commander.id) {
    player1Log.result.push(selectedNumber);
  } else {
    player2Log.result.push(selectedNumber);
  }

  var player1FormattedResult = formatSumString(player1Log.result);
  var player2FormattedResult = formatSumString(player2Log.result);

  var hintMessage = gameCache.hintMessage;

  const embed = createAssembleEmbed(
    player1Log,
    player2Log,
    player1FormattedResult,
    player2FormattedResult,
    nextPlayer.username,
    hintMessage
  );

  // Step 7: Disable pressed button
  var disabledPool = [];
  var player1Result = [];
  var player2Result = [];
  for (var i = 0; i < player1Log.result.length; i++) {
    player1Result.push(parseInt(player1Log.result[i]));
  }

  for (var i = 0; i < player2Log.result.length; i++) {
    player2Result.push(parseInt(player2Log.result[i]));
  }

  let initialComponent = createChoiceButtons(
    CONSTANTS.CACHE_ASSEMBLE_PREFIX,
    messageId,
    25,
    5,
    player1Result,
    player2Result
  );

  // Step 8: return embed
  if (gameCache.turn == LIMIT_TURN) {
    var player1Sum = sumString(player1Log.result);
    var player1Diff = diffBetween(gameCache.answer, player1Sum);

    var player2Sum = sumString(player2Log.result);
    var player2Diff = diffBetween(gameCache.answer, player2Sum);

    var winner = "";

    if (player1Diff === player2Diff) {
      winner = "Tie";
    } else if (player1Diff > player2Diff) {
      winner = player2Log.username;
    } else {
      winner = player1Log.username;
    }

    // Step HINT: show the result
    const hintEmbed = createAssembleFinalEmbed(
      player1Log,
      player2Log,
      player1FormattedResult,
      player2FormattedResult,
      gameCache.answer,
      winner
    );
    await interaction.editReply({
      embeds: [hintEmbed],
      components: [],
    });
  } else if (HINT_TURN.includes(gameCache.turn)) {
    // Step LAST: show the result
    hintMessage = getHint(gameCache.answer);

    const finalEmbed = createAssembleEmbed(
      player1Log,
      player2Log,
      player1FormattedResult,
      player2FormattedResult,
      nextPlayer.username,
      hintMessage
    );
    await interaction.editReply({
      embeds: [finalEmbed],
      components: initialComponent,
    });
  } else {
    // Step NORMAL: show the result
    await interaction.editReply({
      embeds: [embed],
      components: initialComponent,
    });
  }

  // Step 9: save cache
  var log = [];
  log.push(player1Log);
  log.push(player2Log);

  saveCachedData(
    `${CONSTANTS.CACHE_ASSEMBLE_PREFIX}-${messageId}`,
    {
      answer: gameCache.answer,
      disabledPool: disabledPool,
      currentPlayer: nextPlayer,
      // playerPool: gameCache.playerPool,
      turn: gameCache.turn == LIMIT_TURN ? gameCache.turn : ++gameCache.turn,
      hintMessage: hintMessage,
      log: log,
    },
    0,
    CONSTANTS.CACHE_ASSEMBLE_PREFIX
  );
};

const handleAssembleCommand = async (interaction) => {
  try {
    const commander = interaction.user;
    const challenger = interaction.options.getUser("user");

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }

    if (commander.id == challenger.id) {
      await interaction.followUp({
        content: `You cannot challenge yourself.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    let initialComponent = createChoiceButtons(
      CONSTANTS.CACHE_ASSEMBLE_PREFIX,
      `temp_${Date.now()}`,
      25,
      5
    );

    const embed = createAssembleEmbed(
      {
        userId: commander.id,
        username: commander.username,
      },
      {
        userId: challenger.id,
        username: challenger.username,
      },
      "| - | - | - | - | - |",
      "| - | - | - | - | - |",
      commander.username
    );

    let replyMessage = await interaction.followUp({
      embeds: [embed],
      components: initialComponent,
    });

    let finalComponents = createChoiceButtons(
      CONSTANTS.CACHE_ASSEMBLE_PREFIX,
      replyMessage.id,
      25,
      5
    );

    // Step: Edit the message to fill in custom ID into each button
    replyMessage
      .edit({ components: finalComponents })
      .catch((e) =>
        console.warn(
          "Failed to edit ASSEMBLE buttons with final components:",
          e.message
        )
      );

    // Step: Send a notification to the challenger
    if (replyMessage.guildId) {
      const messageLink = `https://discord.com/channels/${replyMessage.guildId}/${replyMessage.channelId}/${replyMessage.id}`;
      const invitationEmbed = createGameInvatationEmbed(
        commander,
        "Assemble XX",
        messageLink
      );

      challenger.send({ embeds: [invitationEmbed] });
    }

    const answer = Math.floor(Math.random() * (100 - 20 + 1)) + 20;

    saveCachedData(
      `${CONSTANTS.CACHE_ASSEMBLE_PREFIX}-${replyMessage.id}`,
      {
        answer: answer,
        currentPlayer: {
          userId: commander.id,
          username: commander.username,
        },
        // playerPool: [commander.id, challenger.id],
        disabledPool: [],
        turn: 1,
        hintMessage: null,
        log: [
          {
            order: 0,
            userId: commander.id,
            username: commander.username,
            result: [],
          },
          {
            order: 1,
            userId: challenger.id,
            username: challenger.username,
            result: [],
          },
        ],
      },
      15 * 60 * 1000,
      CONSTANTS.CACHE_ASSEMBLE_PREFIX
    );
  } catch (error) {
    console.error(
      `Unexpected error during spin command for ${commander.username}:`,
      error
    );
    interaction.reply("An unexpected error occurred. Please try again.");
    return null;
  }
};

const diffBetween = (a, b) => {
  return Math.abs(a - b);
};

function getHint(answer, maxDeviation = 20) {
  const type = Math.floor(Math.random() * 3); // 0 = greater, 1 = lower, 2 = between
  const deviation = () => Math.floor(Math.random() * maxDeviation) + 1;

  switch (type) {
    case 0: {
      // "greater than"
      const hintNum = answer - deviation();
      return `🔍 The answer is greater than ${hintNum}`;
    }
    case 1: {
      // "lower than"
      const hintNum = answer + deviation();
      return `🔍 The answer is lower than ${hintNum}`;
    }
    case 2: {
      // "between"
      const lower = answer - deviation();
      const upper = answer + deviation();
      const [min, max] = [Math.min(lower, upper), Math.max(lower, upper)];
      return `🔍 The answer is between ${min} and ${max}`;
    }
  }
}

const formatSumString = (numbers) => {
  const sum = numbers.reduce((acc, num) => acc + parseInt(num), 0);
  return `${numbers.join(" + ")} = ${sum}`;
};

const sumString = (numbers) => {
  return numbers.reduce((acc, num) => acc + parseInt(num), 0);
};

const switchTurn = (currentPlayerId, playerLog) => {
  var playerIndex = playerLog.filter(
    (player) => player.userId === currentPlayerId
  )[0];
  const nextTurnIndex = (playerIndex.order + 1) % playerLog.length;
  const nextPlayer = playerLog.filter(
    (player) => player.order === nextTurnIndex
  )[0];
  return { userId: nextPlayer.userId, username: nextPlayer.username };
};

const createChoiceButtons = (
  prefix,
  messageId,
  number,
  buttonsPerRow = 5,
  player1LogResult = [],
  player2LogResult = []
) => {
  const rows = [];

  for (let i = 0; i < number; i += buttonsPerRow) {
    const row = new ActionRowBuilder();
    for (let j = i; j < i + buttonsPerRow && j < number; j++) {
      const btn = new ButtonBuilder()
        .setCustomId(`${prefix}-${messageId}-${j}`)
        .setLabel(`${j}`)
        .setStyle(ButtonStyle.Secondary);

      if (player1LogResult.includes(j)) {
        btn.setStyle(ButtonStyle.Primary);
        btn.setDisabled(true);
      }

      if (player2LogResult.includes(j)) {
        btn.setStyle(ButtonStyle.Danger);
        btn.setDisabled(true);
      }

      row.addComponents(btn);
    }
    rows.push(row);
  }

  return rows;
};

// Export the function to be used in other files
module.exports = { handleAssembleCommand, handleAssembleButton };
