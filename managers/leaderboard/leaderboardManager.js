const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const {
  createLeaderboardValueEmbed,
  createLeaderboardMonsterKillEmbed,
} = require("../embedManager");
const CONSTANTS = require("../../constants");
const {
  getCachedData,
  saveCachedData,
} = require("../../providers/cacheProvider");
const { paginateArray } = require("../utilityManager");
const { getUser } = require("../../providers/userProvider");
const { getEventMonsters } = require("../../providers/monsterProvider");

const LEADERBOARD_MEMBER_PER_PAGE = 10;

const handleLeaderboardPagination = async (interaction, prefix) => {
  const userId = interaction.user.id;

  // Step 1: Defer the interaction
  try {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.deferUpdate();
    } else {
      return;
    }
  } catch (deferError) {
    console.error(
      `Error deferring pagination update for ${userId}: ${deferError.message}`
    );
    return;
  }

  // Step 2: Verify custom ID
  const parts = interaction.customId.split("-");
  if (parts.length !== 5) {
    console.warn(
      `Malformed nav customId for ${userId}: ${interaction.customId}`
    );
    return;
  }

  // Step 3: Verify cache if expired already
  const leaderboardValueKey = `${prefix}-${parts[3]}`;
  const leaderboardCache = await getCachedData(leaderboardValueKey);
  if (!leaderboardCache) {
    await interaction.followUp({
      content: `This command is out of date. Please use the command again.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Step 4: Verify user
  const commander = leaderboardCache.commander;
  if (commander.id !== userId) {
    await interaction.followUp({
      content: `This command belong to ${commander.username}. Please use the command yourself`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Step 5: Calculate the page
  const instanceData = leaderboardCache.data;
  const totalPages = Math.ceil(
    leaderboardCache.total / LEADERBOARD_MEMBER_PER_PAGE
  );

  const action = parts[4];
  let currentPage = leaderboardCache.currentPage;
  let newPage = currentPage;
  if (action === "first") newPage = 1;
  else if (action === "prev") newPage = Math.max(1, currentPage - 1);
  else if (action === "next") newPage = Math.min(totalPages, currentPage + 1);
  else if (action === "last") newPage = totalPages;

  if (newPage === currentPage) {
    return; // No actual page change, deferUpdate was enough
  }

  // Step 6: Slice data for page
  const leaderboardResult = paginateArray(
    instanceData,
    newPage,
    LEADERBOARD_MEMBER_PER_PAGE
  );

  // Step 7: Create embeded
  try {
    const updatedEmbed = createLeaderboardValueEmbed(
      leaderboardResult.data,
      newPage,
      LEADERBOARD_MEMBER_PER_PAGE
    );

    // Step 8: Create pagination button
    const updatedButtons = createPaginationButtons(
      prefix,
      interaction.message.id,
      newPage,
      totalPages,
      userId
    );

    // Step 9: Edit the message
    const replyMessage = await interaction.editReply({
      embeds: [updatedEmbed],
      components: [updatedButtons],
    });

    // Step 10: Update cache
    console.log(
      `Set current page from ${leaderboardCache.currentPage} to ${newPage}`
    );
    leaderboardCache.currentPage = newPage;

    const jsonCache = {
      commander: leaderboardCache.commander,
      data: leaderboardCache.data,
      currentPage: leaderboardCache.currentPage,
      total: leaderboardCache.total,
      message: replyMessage,
    };
    saveCachedData(leaderboardValueKey, jsonCache, 0);
  } catch (error) {
    console.error(
      `Error on editReply for ${prefix} pagination for ${userId} (page ${currentPage}): ${error.message}`
    );
  }
};

const handleLeaderboardInteraction = async (
  interaction,
  prefix,
  calculateFn,
  embededFn
) => {
  var interactUser = interaction.user;
  const userId = interactUser.id;

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply();
  }

  // Step 1: Calculate
  const dataOriginal = await calculateFn();

  if (!dataOriginal || dataOriginal.length === 0) {
    await interaction.editReply("The leaderboard is currently empty.");
    return;
  }

  // Step 2: Save cache
  const startingPage = 1;

  // Step 3: Slice data for page
  const leaderboardResult = paginateArray(
    dataOriginal,
    startingPage,
    LEADERBOARD_MEMBER_PER_PAGE
  );

  // Step 4: Create embeded
  const leaderboardEmbed = embededFn(
    leaderboardResult.data,
    startingPage,
    LEADERBOARD_MEMBER_PER_PAGE
  );

  // Step 5: Create pagination button
  const initialComponents =
    leaderboardResult.totalPages > 1
      ? [
          createPaginationButtons(
            prefix,
            `temp_${Date.now()}`, // Placeholder for customId before message exists
            startingPage,
            leaderboardResult.totalPages
          ),
        ]
      : [];

  // Step 6: Send the message to get message ID
  const replyMessage = await interaction.followUp({
    embeds: [leaderboardEmbed],
    components: initialComponents,
    fetchReply: true,
  });

  // Step 7: Bind message ID into each navigation buttons
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
      .catch((e) =>
        console.warn(
          "Failed to edit leaderboard message with final components:",
          e.message
        )
      );
  }

  // Step 8: Save cache
  const leaderboardValueKey = `${prefix}-${replyMessage.id}`;

  const jsonCache = {
    commander: {
      id: interactUser.id,
      username: interactUser.username,
    },
    data: dataOriginal,
    currentPage: startingPage,
    total: dataOriginal.length,
    message: replyMessage,
  };
  saveCachedData(
    leaderboardValueKey,
    jsonCache,
    CONSTANTS.CACHE_LEADERBOARD_VALUE_TTL_MS
  );

  console.log(`[${interaction.user.username}] Replied with the leaderboard.`);
};

const calculateValueLeaderboard = async (interaction) => {
  // Single database call to get users and their materials with values.
  const usersWithItems = await getUser({ isActive: true });

  if (!usersWithItems || usersWithItems.length === 0) {
    console.log("[Leaderboard] No active users found.");
    await interaction.editReply(
      "The material value leaderboard is currently empty. Start collecting materials!"
    );
    return;
  }

  // Map over the users to calculate their total material value.
  const leaderboardOriginal = usersWithItems.map((user) => {
    // Calculate total value from the nested userMaterial array.
    const totalMaterialValue = (user.userMaterial || []).reduce(
      (total, item) => {
        // Check for valid data to prevent errors.
        if (
          item.material &&
          item.material.rarity &&
          typeof item.material.rarity.value === "number"
        ) {
          return total + item.amount * item.material.rarity.value;
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

  // Sort users by their total material value in descending order
  leaderboardOriginal.sort((a, b) => b.value - a.value);

  return leaderboardOriginal;
};

const calculateMonsterLeaderboard = async () => {
  const eventMonsters = await getEventMonsters();

  if (!eventMonsters) return;

  // Group และนับจำนวนที่ user ฆ่ามอนสเตอร์
  const leaderboard = eventMonsters.reduce((acc, monster) => {
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

  // แปลง object เป็น array และเรียงตามจำนวน kill
  const sortedLeaderboard = Object.values(leaderboard).sort(
    (a, b) => b.value - a.value
  );

  return sortedLeaderboard;
};

const createPaginationButtons = (
  prefix,
  messageId,
  currentPage,
  totalPages,
  userId
) => {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${prefix}-nav-${userId}-${messageId}-first`)
      .setLabel("<< First")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage === 1 || totalPages <= 1),
    new ButtonBuilder()
      .setCustomId(`${prefix}-nav-${userId}-${messageId}-prev`)
      .setLabel("< Prev")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage === 1 || totalPages <= 1),
    new ButtonBuilder()
      .setCustomId(`${prefix}-nav-${userId}-${messageId}-next`)
      .setLabel("Next >")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage >= totalPages || totalPages <= 1),
    new ButtonBuilder()
      .setCustomId(`${prefix}-nav-${userId}-${messageId}-last`)
      .setLabel("Last >>")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage >= totalPages || totalPages <= 1)
  );
};

const handleLeaderboardCommand = async (interaction) => {
  const focusedOption = interaction.options.getString("type");
  switch (focusedOption) {
    case "value":
      await handleLeaderboardInteraction(
        interaction,
        CONSTANTS.CACHE_LEADERBOARD_VALUE_PREFIX,
        calculateValueLeaderboard,
        createLeaderboardValueEmbed
      );
      break;
    case "monster_kills":
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

module.exports = {
  handleLeaderboardCommand,
  handleLeaderboardPagination,
};
