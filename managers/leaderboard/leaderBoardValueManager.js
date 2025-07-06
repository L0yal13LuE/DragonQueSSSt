const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const {
  createLeaderboardValueEmbed,
  createLeaderboardMonsterKillEmbed,
} = require("../embedManager");
const CONSTANTS = require("../../constants");
const {
  getCachedData,
  saveCachedData,
  deleteCachedData,
} = require("../../providers/cacheProvider");
const { paginateArray } = require("../utilityManager");
const { getUser } = require("../../providers/userProvider");
const { getEventMonsters } = require("../../providers/monsterProvider");

const LEADERBOARD_MEMBER_PER_PAGE = 10;
const BAG_AUTO_CLOSE_MINUTES = 5;

const leaderboardValueInstances = new Map();
const leaderboardValueCooldowns = new Map();

const LEADERBOARD_INTERACTION_COOLDOWN_SECONDS = 5; // Cooldown for button clicks

const handleLeaderboardPagination = async (interaction, prefix) => {
  const userId = interaction.user.id;
  const now = Date.now();

  // Step 1 Verify custom ID
  const parts = interaction.customId.split("-");
  if (parts.length < 4) {
    console.warn(
      `Malformed nav customId for ${userId}: ${interaction.customId}`
    );
    return;
  }
  const messageIdFromCustomId = parts[2];
  const action = parts[3];

  try {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.deferUpdate();
    } else {
      return;
    }
  } catch (deferError) {
    console.error(
      `Error deferring bag pagination update for ${userId}: ${deferError.message}`
    );
    return;
  }

  const userCooldownEndTimestamp = leaderboardValueCooldowns.get(userId);
  if (userCooldownEndTimestamp && now < userCooldownEndTimestamp) {
    const timeLeft = Math.ceil((userCooldownEndTimestamp - now) / 1000);
    try {
      // if (!interaction.replied && !interaction.deferred) {
      //   await interaction.reply({
      //     content: `You're navigating too quickly! Please wait ${timeLeft} more second(s).`,
      //     //flags: MessageFlags.Ephemeral,
      //   });
      // }
    } catch (e) {
      console.warn(
        `Cooldown ephemeral reply failed for ${userId}: ${e.message}`
      );
    }
    return;
  }
  leaderboardValueCooldowns.set(
    userId,
    now + LEADERBOARD_INTERACTION_COOLDOWN_SECONDS * 1000
  );

  const leaderboardValueInstance = leaderboardValueInstances.get(userId);

  if (
    !leaderboardValueInstance ||
    leaderboardValueInstance.message.id !== interaction.message.id ||
    leaderboardValueInstance.message.id !== messageIdFromCustomId
  ) {
    try {
      if (interaction.deferred) {
        // Check if it was successfully deferred
        await interaction.followUp({
          content:
            "This view has expired or is no longer active. Please use the command again.",
          flags: MessageFlags.Ephemeral,
        });
      }
      if (interaction.message.id === messageIdFromCustomId) {
        interaction.message
          .edit({ components: [] })
          .catch((e) =>
            console.warn(
              `Failed to disable components on old bag message ${messageIdFromCustomId}: ${e.message}`
            )
          );
      }
    } catch (e) {
      console.warn(
        `Expired bag view followUp failed for ${userId}: ${e.message}`
      );
    }
    return;
  }

  const instanceData = leaderboardValueInstance;
  const totalPages = Math.ceil(
    instanceData.data.length / LEADERBOARD_MEMBER_PER_PAGE
  );

  // Step ? Calculate the page
  let currentPage = leaderboardValueInstance.currentPage;
  let newPage = currentPage;
  if (action === "first") newPage = 1;
  else if (action === "prev") newPage = Math.max(1, currentPage - 1);
  else if (action === "next") newPage = Math.min(totalPages, currentPage + 1);
  else if (action === "last") newPage = totalPages;

  if (newPage === currentPage) {
    return; // No actual page change, deferUpdate was enough
  }

  leaderboardValueInstance.currentPage = newPage;
  currentPage = newPage;

  const leaderboardResult = paginateArray(
    instanceData.data,
    currentPage,
    LEADERBOARD_MEMBER_PER_PAGE
  );

  try {
    const updatedEmbed = createLeaderboardValueEmbed(
      leaderboardResult.data,
      currentPage,
      LEADERBOARD_MEMBER_PER_PAGE
    );
    const updatedButtons = createPaginationButtons(
      CONSTANTS.CACHE_LEADERBOARD_VALUE_PREFIX,
      interaction.message.id,
      currentPage,
      totalPages
    );

    await interaction.editReply({
      embeds: [updatedEmbed],
      components: [updatedButtons],
    });
  } catch (error) {
    console.error(
      `Error on editReply for bag pagination for ${userId} (page ${currentPage}): ${error.message}`
    );
  }
};

const handleLeaderboardInteraction = async (
  interaction,
  prefix,
  calculateFn,
  embededFn
) => {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply();
  }

  var interactUser = interaction.user;
  const userId = interactUser.id;

  // Step 1: Calculate
  const dataOriginal = await calculateFn();

  if (!dataOriginal || dataOriginal.length === 0) {
    await interaction.editReply("The leaderboard is currently empty.");
    return;
  }

  // Step 2: Save cache
  const leaderboardValueKey = prefix + `_${userId}`;
  saveCachedData(leaderboardValueKey, dataOriginal);

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
        leaderboardResult.totalPages
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

  // await interaction.followUp({ embeds: [leaderboardEmbed] });
  console.log(`[${interaction.user.username}] Replied with the leaderboard.`);

  const autoCloseMs = BAG_AUTO_CLOSE_MINUTES * 60 * 1000;
  const timeoutId = setTimeout(async () => {
    const currentInstance = leaderboardValueInstances.get(userId);
    if (currentInstance && currentInstance.message.id === replyMessage.id) {
      try {
        await replyMessage.edit({
          content: "**leaderboard view closed.**",
          embeds: [],
          components: [],
        });
      } catch (errorDel) {
        console.warn("Error editing bag message on timeout:", errorDel.message);
      }
      leaderboardValueInstances.delete(userId);
      // bagInteractionCooldowns.delete(userId);
    }
  }, autoCloseMs);

  leaderboardValueInstances.set(userId, {
    message: replyMessage,
    timeoutId: timeoutId,
    data: dataOriginal,
    currentPage: 1,
  });
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
  totalPages
) => {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${prefix}-nav-${messageId}-first`)
      .setLabel("<< First")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage === 1 || totalPages <= 1),
    new ButtonBuilder()
      .setCustomId(`${prefix}-nav-${messageId}-prev`)
      .setLabel("< Prev")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage === 1 || totalPages <= 1),
    new ButtonBuilder()
      .setCustomId(`${prefix}-nav-${messageId}-next`)
      .setLabel("Next >")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage >= totalPages || totalPages <= 1),
    new ButtonBuilder()
      .setCustomId(`${prefix}-nav-${messageId}-last`)
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
