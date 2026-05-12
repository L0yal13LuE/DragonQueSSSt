import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';
import {
  createLeaderboardPointEmbed,
  createLeaderboardMonsterKillEmbed,
} from '../embedManager';
import * as CONSTANTS from '../../constants';
import {
  getCachedData,
  saveCachedData,
} from '../../providers/cacheProvider';
import { paginateArray } from '../utilityManager';
import { getUser } from '../../providers/userProvider';
import { getEventMonsters } from '../../providers/monsterProvider';

const LEADERBOARD_MEMBER_PER_PAGE = 10;

const handlePaging = async (interaction: any, prefix: string, embededFn: Function): Promise<void> => {
  const userId = interaction.user.id;

  try {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.deferUpdate();
    } else {
      return;
    }
  } catch (deferError: any) {
    console.error(
      `Error deferring pagination update for ${userId}: ${deferError.message}`
    );
    return;
  }

  const parts = interaction.customId.split('-');
  if (parts.length !== 5) {
    console.warn(
      `Malformed nav customId for ${userId}: ${interaction.customId}`
    );
    return;
  }

  const leaderboardValueKey = `${prefix}-${parts[3]}`;
  const leaderboardCache: any = await getCachedData(leaderboardValueKey, prefix);
  if (!leaderboardCache) {
    await interaction.followUp({
      content: 'This command is out of date. Please use the command again.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const commander = leaderboardCache.commander;
  if (commander.id !== userId) {
    await interaction.followUp({
      content: `This command belong to ${commander.username}. Please use the command yourself`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const instanceData = leaderboardCache.data;
  const totalPages = Math.ceil(
    leaderboardCache.total / LEADERBOARD_MEMBER_PER_PAGE
  );

  const action = parts[4];
  let currentPage = leaderboardCache.currentPage;
  let newPage = currentPage;
  if (action === 'first') newPage = 1;
  else if (action === 'prev') newPage = Math.max(1, currentPage - 1);
  else if (action === 'next') newPage = Math.min(totalPages, currentPage + 1);
  else if (action === 'last') newPage = totalPages;

  if (newPage === currentPage) {
    return;
  }

  const leaderboardResult = paginateArray(
    instanceData,
    newPage,
    LEADERBOARD_MEMBER_PER_PAGE
  );

  try {
    const updatedEmbed = embededFn(
      leaderboardResult.data,
      newPage,
      LEADERBOARD_MEMBER_PER_PAGE
    );

    const updatedButtons = createPaginationButtons(
      prefix,
      interaction.message.id,
      newPage,
      totalPages,
      userId
    );

    const replyMessage = await interaction.editReply({
      embeds: [updatedEmbed],
      components: [updatedButtons],
    });

    console.log(
      `Set current page from ${leaderboardCache.currentPage} to ${newPage}`
    );
    leaderboardCache.currentPage = newPage;

    saveCachedData(
      leaderboardValueKey,
      {
        commander: leaderboardCache.commander,
        data: leaderboardCache.data,
        currentPage: leaderboardCache.currentPage,
        total: leaderboardCache.total,
        message: replyMessage,
      },
      0,
      prefix
    );
  } catch (error: any) {
    console.error(
      `Error on editReply for ${prefix} pagination for ${userId} (page ${currentPage}): ${error.message}`
    );
  }
};

const handleLeaderboardInteraction = async (
  interaction: any,
  prefix: string,
  calculateFn: Function,
  embededFn: Function
): Promise<void> => {
  const interactUser = interaction.user;
  const userId = interactUser.id;

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply();
  }

  const dataOriginal = await calculateFn();

  if (!dataOriginal || dataOriginal.length === 0) {
    await interaction.editReply('The leaderboard is currently empty.');
    return;
  }

  const startingPage = 1;

  const leaderboardResult = paginateArray(
    dataOriginal,
    startingPage,
    LEADERBOARD_MEMBER_PER_PAGE
  );

  const leaderboardEmbed = embededFn(
    leaderboardResult.data,
    startingPage,
    LEADERBOARD_MEMBER_PER_PAGE
  );

  const initialComponents =
    leaderboardResult.totalPages > 1
      ? [
          createPaginationButtons(
            prefix,
            `temp_${Date.now()}`,
            startingPage,
            leaderboardResult.totalPages
          ),
        ]
      : [];

  const replyMessage = await interaction.followUp({
    embeds: [leaderboardEmbed],
    components: initialComponents,
    fetchReply: true,
  });

  if (leaderboardResult.totalPages > 1) {
    const finalComponents = [
      createPaginationButtons(
        prefix,
        replyMessage.id,
        startingPage,
        leaderboardResult.totalPages,
        userId
      ),
    ];
    await replyMessage
      .edit({ components: finalComponents })
      .catch((e: any) =>
        console.warn(
          'Failed to edit leaderboard message with final components:',
          e.message
        )
      );
  }

  const leaderboardValueKey = `${prefix}-${replyMessage.id}`;

  saveCachedData(
    leaderboardValueKey,
    {
      commander: {
        id: interactUser.id,
        username: interactUser.username,
      },
      data: dataOriginal,
      currentPage: startingPage,
      total: dataOriginal.length,
      message: replyMessage,
    },
    CONSTANTS.CACHE_LEADERBOARD_VALUE_TTL_MS,
    prefix
  );

  console.log(`[${interaction.user.username}] Replied with the leaderboard.`);
};

const calculateValueLeaderboard = async (interaction: any): Promise<any[] | undefined> => {
  const usersWithItems = await getUser({ isActive: true });

  if (!usersWithItems || usersWithItems.length === 0) {
    console.log('[Leaderboard] No active users found.');
    await interaction.editReply(
      'The material value leaderboard is currently empty. Start collecting materials!'
    );
    return;
  }

  const leaderboardOriginal = usersWithItems.map((user: any) => {
    const totalMaterialValue = (user.userMaterial || []).reduce(
      (total: number, item: any) => {
        const material = item.material;
        const amount = item.amount || 0;

        if (material) {
          const points = material.default_points ?? material.rarity?.value;
          if (typeof points === 'number') {
            return total + amount * points;
          }
        }

        return total;
      },
      0
    );

    return {
      id: user.id,
      username: user.username,
      value: totalMaterialValue,
    };
  });

  leaderboardOriginal.sort((a: any, b: any) => b.value - a.value);

  return leaderboardOriginal;
};

const calculateMonsterLeaderboard = async (): Promise<any[] | undefined> => {
  const eventMonsters = await getEventMonsters();

  if (!eventMonsters) return;

  const leaderboard = eventMonsters.reduce((acc: Record<string, any>, monster: any) => {
    const user = monster.user;
    if (!user) return acc;

    if (!acc[user.id]) {
      acc[user.id] = {
        id: user.id,
        username: user.username,
        value: 1,
      };
    } else {
      acc[user.id].value += 1;
    }

    return acc;
  }, {});

  const sortedLeaderboard = Object.values(leaderboard).sort(
    (a: any, b: any) => b.value - a.value
  );

  return sortedLeaderboard;
};

const createPaginationButtons = (
  prefix: string,
  messageId: string,
  currentPage: number,
  totalPages: number,
  userId?: string
): ActionRowBuilder => {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${prefix}-nav-${userId}-${messageId}-first`)
      .setLabel('<< First')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage === 1 || totalPages <= 1),
    new ButtonBuilder()
      .setCustomId(`${prefix}-nav-${userId}-${messageId}-prev`)
      .setLabel('< Prev')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage === 1 || totalPages <= 1),
    new ButtonBuilder()
      .setCustomId(`${prefix}-nav-${userId}-${messageId}-next`)
      .setLabel('Next >')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage >= totalPages || totalPages <= 1),
    new ButtonBuilder()
      .setCustomId(`${prefix}-nav-${userId}-${messageId}-last`)
      .setLabel('Last >>')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage >= totalPages || totalPages <= 1)
  );
};

const handleLeaderboardPagination = async (interaction: any, prefix: string): Promise<void> => {
  switch (prefix) {
    case CONSTANTS.CACHE_LEADERBOARD_POINT_PREFIX:
      await handlePaging(interaction, prefix, createLeaderboardPointEmbed);
      break;
    case CONSTANTS.CACHE_LEADERBOARD_MONSTER_KILL_PREFIX:
      await handlePaging(
        interaction,
        prefix,
        createLeaderboardMonsterKillEmbed
      );
      break;
    default:
      break;
  }
};

const handleLeaderboardCommand = async (interaction: any): Promise<void> => {
  const focusedOption = interaction.options.getString('type');
  switch (focusedOption) {
    case 'points':
      await handleLeaderboardInteraction(
        interaction,
        CONSTANTS.CACHE_LEADERBOARD_POINT_PREFIX,
        calculateValueLeaderboard,
        createLeaderboardPointEmbed
      );
      break;
    case 'monster_kills':
      await handleLeaderboardInteraction(
        interaction,
        CONSTANTS.CACHE_LEADERBOARD_MONSTER_KILL_PREFIX,
        calculateMonsterLeaderboard,
        createLeaderboardMonsterKillEmbed
      );
      break;
    default:
      break;
  }
};

export {
  handleLeaderboardCommand,
  handleLeaderboardPagination,
};
