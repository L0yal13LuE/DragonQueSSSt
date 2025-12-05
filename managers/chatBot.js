const CONSTANTS = require("../constants");
const AGENT = require('./agent/Conversation-Shiro');
const AGENT_B = require('./agent/Conversation-Assistant2');
const MCP_EXA = require('./agent/MCP-Exa');
const SEARCH_DECISION = require('./agent/Search-Decision');
const SEARCH_GOOGLE = require('./agent/Search-Google');
const AsyncQueue = require('./utils/AsyncQueue'); // Ensure you have the file created in previous step

// --- Worker Function ---
// This contains the specific Fortune Telling logic
async function handleFortuneRequest(message) {
    console.log(`[Fortune] Processing request for ${message.author.tag}.`);

    // 1. Initial Discord UI Feedback
    await message.channel.sendTyping();
    let thinkingMessage = await message.reply("🤔 หือ... ไปวนรอบโลกแป๊บเดี๋ยวมา... 💫");

    try {
        const userContxt = message.content;
        const getTrustAI = CONSTANTS.GET_CHANCE(100);

        // 2. Decision Logic
        const responseToolUse = await SEARCH_DECISION.callAPI(userContxt);
        console.log("[Search-Decision]", responseToolUse);


        if (getTrustAI && responseToolUse.tool === 'SEARCH') {
            await thinkingMessage.edit("🤯 ขอค้นหาข้อมูลหน่อยนะ มีอะไรน่าสนใจบ้างหนอ");

            // TYPE 1 : EXA FIRST
            // Priority 1
            // let mcpContext = await MCP_EXA.callAPI(responseToolUse);
            // console.log("[EXA]", mcpContext !== '');

            // // Priority 2 Only trigger google if EXA MCP fail
            // if (mcpContext == "") {
            //     const googleContext = await SEARCH_GOOGLE.callAPI(message.guild.id, responseToolUse);
            //     console.log("[Google]", googleContext !== '');
            //     mcpContext = googleContext;
            // }

            // TYPE 2 : GOOGLE FIRST
            // Priority 1
            let mcpContext = await SEARCH_GOOGLE.callAPI(message.guild.id, responseToolUse);
            console.log("[Google]", mcpContext !== '');

            // Priority 2 Only trigger google if EXA MCP fail
            if (mcpContext == "") {
                const exaContext = await MCP_EXA.callAPI(responseToolUse);
                console.log("[EXA]", exaContext !== '');
                mcpContext = exaContext;
            }

            await thinkingMessage.edit("🤭 กำลังจะมาแล้ว รออีกนิ๊สสส...");
            const responseAiResult = await AGENT_B.callAPI(mcpContext, userContxt);

            // Check length for Discord limit
            if (responseAiResult.length > 2000) {
                await thinkingMessage.edit('นี่จ้า... 👇');
                const chunks = responseAiResult.match(/[\s\S]{1,1900}/g) || [];
                for (const chunk of chunks) {
                    await message.reply(chunk);
                }
            } else {
                await thinkingMessage.edit(responseAiResult);
            }
        } else {
            console.log('[Fortune] GROQ');
            const fortune = await AGENT.callAPI(userContxt);

            // Artificial delay
            await new Promise(resolve => setTimeout(resolve, 300));
            await thinkingMessage.edit(fortune);
        }
    } catch (error) {
        console.error("[Fortune] Logic Error:", error);
        await thinkingMessage.edit("A cosmic disturbance has interfered with my vision! Please try again later.");
    }
}

// --- Initialization ---
const fortuneQueue = new AsyncQueue(handleFortuneRequest);

// --- Interface Functions ---

function enqueueRequest(message) {
    console.log(`[Fortune] Added to queue. Size: ${fortuneQueue.getSize() + 1}`);
    return fortuneQueue.enqueue(message);
}

/**
 * Manually trigger the queue processing.
 * Note: In the new system, enqueue() calls this automatically, 
 * but we keep this exported for backward compatibility with your bot.js
 */
function processQueue() {
    return fortuneQueue.process();
}

function getIsProcessingQueue() {
    return fortuneQueue.getIsProcessing();
}

function getQueueSize() {
    return fortuneQueue.getSize();
}

// Export everything including processQueue
module.exports = {
    enqueueRequest,
    processQueue,
    getIsProcessingQueue,
    getQueueSize,
};