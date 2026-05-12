import * as constants from './constants';
import { getCachedData, saveCachedData, deleteCachedData } from './providers/cacheProvider';
import { getMaterial, getUserItem } from './providers/materialProvider';
import { deductItemFromUser, addItemtoUser } from './managers/materialManager';
import { announceItemTransfer } from './announcements';
import { MessageFlags } from 'discord.js';

const handleSendCommand = async (interaction: any): Promise<void> => {
  if (!interaction.isChatInputCommand()) {
    const focusedOption = interaction.options.getFocused(true);
    if (focusedOption.name === "item") {
      await fetchUserItem(interaction);
    }
  } else {
    await handleSendCommandSubmission(interaction);
  }
};

const fetchUserItem = async (interaction: any): Promise<void> => {
  try {
    const itemNameInput = interaction.options.getString("item");
    const userId = interaction.user.id;
    const userBagKey = constants.CACHE_USER_BAG_PREFIX + `_${userId}`;

    let allUserItemsData: any = null;

    if (itemNameInput === "") {
      await deleteCachedData(userBagKey);

      const result = await getUserItem({ userId: userId, amount: 1 });

      if (!result || result.length === 0) {
        console.error(
          `[Autocomplete] Error fetching bag for user ${userId} for cache:`,
          result || "No data"
        );
        await interaction.respond([]);
        return;
      }
      allUserItemsData = result;
      saveCachedData(userBagKey, allUserItemsData);
    } else {
      const cachedBag = await getCachedData(userBagKey);

      if (cachedBag) {
        allUserItemsData = cachedBag;
      } else {
        const result = await getUserItem({ userId: userId, amount: 1 });

        if (!result || result.length === 0) {
          console.error(
            `[Autocomplete] Error fetching bag for user ${userId} for cache:`,
            result || "No data"
          );
          await interaction.respond([]);
          return;
        }
        allUserItemsData = result;
        saveCachedData(userBagKey, allUserItemsData);
      }
    }

    if (!allUserItemsData || allUserItemsData.length === 0) {
      await interaction.respond([]);
      return;
    }

    const filteredItems = allUserItemsData.filter(
      (item: any) =>
        item.material &&
        item.material[0] &&
        item.material[0].name &&
        item.material[0].name.toLowerCase().includes(itemNameInput.toLowerCase())
    );

    if (filteredItems.length === 0) {
      await interaction.respond([]);
      return;
    }

    filteredItems.sort((a: any, b: any) => {
      return (a.material?.[0]?.name || '').localeCompare(b.material?.[0]?.name || '');
    });

    await interaction.respond(
      filteredItems.slice(0, 25).map((i: any) => ({
        name: `${i.material?.[0]?.rarities?.[0]?.emoji || ''} ${i.material?.[0]?.name || ''} ${i.material?.[0]?.emoji || ''} x ${i.amount}`,
        value: i.material?.[0]?.id.toString() || '',
      }))
    );
  } catch (error) {
    console.error(`[Autocomplete] Error in fetchUserItem for user ${interaction.user.id}:`, error);
    if (!interaction.responded) {
      try {
        await interaction.respond([]);
      } catch (respondError) {
        console.error("[Autocomplete] Failed to send empty error response:", respondError);
      }
    }
  }
};

const handleSendCommandSubmission = async (interaction: any): Promise<void> => {
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    } else if (interaction.replied && !interaction.ephemeral) {
      await interaction.deferUpdate().catch(console.error);
    } else if (interaction.deferred && !interaction.ephemeral) {
      await interaction.deferUpdate().catch(console.error);
    }

    const itemIdRaw = interaction.options.getString("item");
    const itemIdNum = parseInt(itemIdRaw, 10);
    const amountStr = interaction.options.getString("amount");
    const receiver = interaction.options.getUser("user");
    const sender = interaction.user;
    const userBagKey = constants.CACHE_USER_BAG_PREFIX + `_${sender.id}`;

    const amount = parseInt(amountStr, 10);
    if (isNaN(amount) || amount <= 0) {
      await interaction.editReply({
        content: "Please provide a valid positive amount.",
      });
      return;
    }

    if (sender.id === receiver.id) {
      await interaction.editReply({
        content: "You cannot send items to yourself.",
      });
      return;
    }

    const materialDetailsArray = await getMaterial({ id: itemIdNum });
    if (!materialDetailsArray || materialDetailsArray.length === 0) {
      await interaction.editReply({
        content: "Error: Could not find the item to send.",
      });
      return;
    }
    const materialToSend = materialDetailsArray[0] as any;

    if (itemIdRaw && amount && receiver) {
      const deductionSuccess = await deductItemFromUser(sender, itemIdNum, amount);
      if (!deductionSuccess) {
        await interaction.editReply({
          content: `Failed to send ${materialToSend.emoji} ${materialToSend.name}. You might not have enough or an error occurred.`,
        });
        return;
      }

      const additionSuccess = await addItemtoUser(receiver, materialToSend, amount);
      if (!additionSuccess) {
        await interaction.editReply({
          content: `Successfully deducted ${amount} ${materialToSend.emoji} **${materialToSend.name}** from you, but failed to add it to **${receiver.username}**. Attempting to return items to you...`,
        });

        console.log(
          `[Transaction Failure] Adding item to receiver ${receiver.id} failed. Attempting to roll back deduction from sender ${sender.id}.`
        );
        const rollbackSuccess = await addItemtoUser(sender, materialToSend, amount);

        if (rollbackSuccess) {
          console.log(`[Transaction Rollback] Successfully rolled back item deduction for sender ${sender.id}.`);
          await interaction.editReply({
            content: `Failed to send ${amount} ${materialToSend.emoji} **${materialToSend.name}** to **${receiver.username}**. The items have been returned to your inventory.`,
          });
        } else {
          console.error(
            `[CRITICAL TRANSACTION FAILURE] Failed to add item to receiver ${receiver.id} AND failed to roll back deduction for sender ${sender.id}. Item: ${materialToSend.id}, Amount: ${amount}. MANUAL INTERVENTION REQUIRED.`
          );
          await interaction.editReply({
            content: `A critical error occurred. Failed to send items to **${receiver.username}** AND failed to return the items to you. Please contact an admin immediately with details of this transaction (Sender: ${sender.username}, Receiver: ${receiver.username}, Item: ${materialToSend.name}, Amount: ${amount}).`,
          });
        }
        return;
      }

      announceItemTransfer(receiver, materialToSend, amount, sender);

      await interaction.editReply({
        content: `You have successfully sent x ${amount} ${materialToSend.rarity?.emoji || ''} ${materialToSend.name} ${materialToSend.emoji} to ${receiver.username}.`,
      });

      deleteCachedData(userBagKey)
        .then(() => {
          console.log(`[Cache] Cleared bag cache for sender ${sender.id} after successful send.`);
        })
        .catch((cacheErr) => {
          console.error("[Cache] Error clearing caches after send:", cacheErr);
        });
    }
  } catch (error) {
    console.error(`[Command Submission] Error in handleSendCommandSubmission for user ${interaction.user.id}:`, error);
    if (interaction.replied || interaction.deferred) {
      await interaction
        .editReply({
          content: "An unexpected error occurred while processing your command. Please try again later.",
        })
        .catch((e: any) => console.error("Failed to editReply with error message:", e));
    }
  }
};

export { handleSendCommand };
