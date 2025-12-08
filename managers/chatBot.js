const AGENT = require('./agent/LangChainProcessor');
const AsyncQueue = require('./utils/AsyncQueue');

async function handleFortuneRequest(message) {
    // 1. Send "Thinking" state
    await message.channel.sendTyping();
    let replyMsg = await message.reply("🤔 หือ... ไปวนรอบโลกแป๊บเดี๋ยวมา... 💫");

    try {

        const cleanText = message.content.replace(/<@\d+>/g, '').trim();

        // 2. Process via LangChain Agent
        const responseText = await AGENT.processUserMessage(cleanText);

        // 3. Handle Long Messages (Discord 2000 char limit)
        if (responseText.length > 2000) {
            const chunks = responseText.match(/[\s\S]{1,1900}/g) || [];

            // Edit first message with first chunk
            await replyMsg.edit(chunks[0]);

            // Send remaining chunks
            for (let i = 1; i < chunks.length; i++) {
                await message.channel.send(chunks[i]);
            }
        } else {
            await replyMsg.edit(responseText);
        }

    } catch (error) {
        console.error("Bot Error:", error);
        await replyMsg.edit("⚠️ System Error: Unable to process request.");
    }
}

const fortuneQueue = new AsyncQueue(handleFortuneRequest);

module.exports = {
    enqueueRequest: (msg) => fortuneQueue.enqueue(msg),
    processQueue: () => fortuneQueue.process(),
    getIsProcessingQueue: () => fortuneQueue.getIsProcessing(),
    getQueueSize: () => fortuneQueue.getSize(),
};