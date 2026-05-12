import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';
import {
  getCachedData,
  saveCachedData,
  deleteCachedData,
} from '../../providers/cacheProvider';
import {
  createAssembleEmbed,
  createAssembleFinalEmbed,
  createGameInvatationEmbed,
} from '../embedManager';
import * as CONSTANTS from '../../constants';

const LIMIT_TURN = 10;
const HINT_TURN = [4, 8];

const handleAssembleButton = async (interaction: any): Promise<void> => {
  const commander = interaction.user;

  try {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.deferUpdate();
    } else {
      return;
    }
  } catch (deferError: any) {
    console.error(
      `Error deferring update for ${commander.id}: ${deferError.message}`
    );
    return;
  }

  const parts = interaction.customId.split('-');
  if (parts.length !== 3) {
    console.warn(
      `Malformed nav customId for ${commander.id}: ${interaction.customId}`
    );
    return;
  }

  const messageId = parts[1];
  const selectedNumber = parts[2];

  const gameValueKey = `${CONSTANTS.CACHE_ASSEMBLE_PREFIX}-${parts[1]}`;
  const gameCache: any = await getCachedData(
    gameValueKey,
    CONSTANTS.CACHE_ASSEMBLE_PREFIX
  );
  if (!gameCache) {
    await interaction.followUp({
      content: 'This command is out of date. Please use the command again.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const currentPlayerId = gameCache.currentPlayer.userId;
  const userPool = gameCache.log.map((entry: any) => entry.userId);
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

  const currentPlayer = gameCache.log.filter(
    (item: any) => item.userId == commander.id
  )[0];
  const nextPlayer = switchTurn(currentPlayer.userId, gameCache.log);
  const player1Log = gameCache.log.filter((item: any) => item.order == 0)[0];
  const player2Log = gameCache.log.filter((item: any) => item.order == 1)[0];

  if (player1Log.userId == commander.id) {
    player1Log.result.push(selectedNumber);
  } else {
    player2Log.result.push(selectedNumber);
  }

  const player1FormattedResult = formatSumString(player1Log.result);
  const player2FormattedResult = formatSumString(player2Log.result);

  let hintMessage = gameCache.hintMessage;

  const embed = createAssembleEmbed(
    player1Log,
    player2Log,
    player1FormattedResult,
    player2FormattedResult,
    nextPlayer.username,
    hintMessage
  );

  const player1Result: number[] = [];
  const player2Result: number[] = [];
  for (let i = 0; i < player1Log.result.length; i++) {
    player1Result.push(parseInt(player1Log.result[i]));
  }

  for (let i = 0; i < player2Log.result.length; i++) {
    player2Result.push(parseInt(player2Log.result[i]));
  }

  const initialComponent = createChoiceButtons(
    CONSTANTS.CACHE_ASSEMBLE_PREFIX,
    messageId,
    25,
    5,
    player1Result,
    player2Result
  );

  if (gameCache.turn == LIMIT_TURN) {
    const player1Sum = sumString(player1Log.result);
    const player1Diff = diffBetween(gameCache.answer, player1Sum);

    const player2Sum = sumString(player2Log.result);
    const player2Diff = diffBetween(gameCache.answer, player2Sum);

    let winner = '';

    if (player1Diff === player2Diff) {
      winner = 'Tie';
    } else if (player1Diff > player2Diff) {
      winner = player2Log.username;
    } else {
      winner = player1Log.username;
    }

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
    await interaction.editReply({
      embeds: [embed],
      components: initialComponent,
    });
  }

  const log: any[] = [];
  log.push(player1Log);
  log.push(player2Log);

  saveCachedData(
    `${CONSTANTS.CACHE_ASSEMBLE_PREFIX}-${messageId}`,
    {
      answer: gameCache.answer,
      disabledPool: [],
      currentPlayer: nextPlayer,
      turn: gameCache.turn == LIMIT_TURN ? gameCache.turn : ++gameCache.turn,
      hintMessage: hintMessage,
      log: log,
    },
    0,
    CONSTANTS.CACHE_ASSEMBLE_PREFIX
  );
};

const handleAssembleCommand = async (interaction: any): Promise<void | null> => {
  try {
    const commander = interaction.user;
    const challenger = interaction.options.getUser('user');

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }

    if (commander.id == challenger.id) {
      await interaction.followUp({
        content: 'You cannot challenge yourself.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const initialComponent = createChoiceButtons(
      CONSTANTS.CACHE_ASSEMBLE_PREFIX,
      `temp_${Date.now()}`,
      25,
      5
    );

    const embed = createAssembleEmbed(
      { username: commander.username, userId: commander.id } as any,
      { username: challenger.username, userId: challenger.id } as any,
      '| - | - | - | - | - |',
      '| - | - | - | - | - |',
      commander.username
    );

    const replyMessage = await interaction.followUp({
      embeds: [embed],
      components: initialComponent,
    });

    const finalComponents = createChoiceButtons(
      CONSTANTS.CACHE_ASSEMBLE_PREFIX,
      replyMessage.id,
      25,
      5
    );

    replyMessage
      .edit({ components: finalComponents })
      .catch((e: any) =>
        console.warn(
          'Failed to edit ASSEMBLE buttons with final components:',
          e.message
        )
      );

    if (replyMessage.guildId) {
      const messageLink = `https://discord.com/channels/${replyMessage.guildId}/${replyMessage.channelId}/${replyMessage.id}`;
      const invitationEmbed = createGameInvatationEmbed(
        commander,
        'Assemble XX',
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
      `Unexpected error during spin command for ${interaction.user.username}:`,
      error
    );
    interaction.reply('An unexpected error occurred. Please try again.');
    return null;
  }
};

const diffBetween = (a: number, b: number): number => {
  return Math.abs(a - b);
};

function getHint(answer: number, maxDeviation = 20): string {
  const type = Math.floor(Math.random() * 3);
  const deviation = () => Math.floor(Math.random() * maxDeviation) + 1;

  switch (type) {
    case 0: {
      const hintNum = answer - deviation();
      return `🔍 The answer is greater than ${hintNum}`;
    }
    case 1: {
      const hintNum = answer + deviation();
      return `🔍 The answer is lower than ${hintNum}`;
    }
    case 2: {
      const lower = answer - deviation();
      const upper = answer + deviation();
      const [min, max] = [Math.min(lower, upper), Math.max(lower, upper)];
      return `🔍 The answer is between ${min} and ${max}`;
    }
    default:
      return '';
  }
}

const formatSumString = (numbers: string[]): string => {
  const sum = numbers.reduce((acc: number, num: string) => acc + parseInt(num), 0);
  return `${numbers.join(' + ')} = ${sum}`;
};

const sumString = (numbers: string[]): number => {
  return numbers.reduce((acc: number, num: string) => acc + parseInt(num), 0);
};

const switchTurn = (currentPlayerId: string, playerLog: any[]): { userId: string; username: string } => {
  const playerIndex = playerLog.filter(
    (player: any) => player.userId === currentPlayerId
  )[0];
  const nextTurnIndex = (playerIndex.order + 1) % playerLog.length;
  const nextPlayer = playerLog.filter(
    (player: any) => player.order === nextTurnIndex
  )[0];
  return { userId: nextPlayer.userId, username: nextPlayer.username };
};

const createChoiceButtons = (
  prefix: string,
  messageId: string,
  number: number,
  buttonsPerRow: number = 5,
  player1LogResult: number[] = [],
  player2LogResult: number[] = []
): ActionRowBuilder[] => {
  const rows: ActionRowBuilder[] = [];

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

export { handleAssembleCommand, handleAssembleButton };
