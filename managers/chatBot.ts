import * as constants from '../constants';
import * as AGENT_A from './agent/Conversation-Shiro';
import * as AGENT_B from './agent/Conversation-Assistant2';
import * as TOOL_EXA from './agent/tools/SearchExaTool';
import * as TOOL_SEARCH_DECISION from './agent/tools/SearchDecisionTool';
import * as TOOL_SEARCH_GOOGLE from './agent/tools/SearchGoogleTool';
import AsyncQueue from './utils/AsyncQueue';

async function handleFortuneRequest(message: any): Promise<void> {
  console.log(`[Fortune] Processing request for ${message.author.tag}.`);

  await message.channel.sendTyping();
  let thinkingMessage = await message.reply('🤔 หือ... ไปวนรอบโลกแป๊บเดี๋ยวมา... 💫');

  try {
    const userContxt = message.content;
    const getTrustAI = constants.GET_CHANCE(100);

    const responseToolUse = await TOOL_SEARCH_DECISION.callAPI(userContxt);
    console.log('[Search-Decision]', responseToolUse);

    if (getTrustAI && responseToolUse?.tool === 'SEARCH') {
      await thinkingMessage.edit('🤯 ขอค้นหาข้อมูลหน่อยนะ มีอะไรน่าสนใจบ้างหนอ');

      let mcpContext = await TOOL_EXA.callAPI(responseToolUse);
      console.log('[EXA]', mcpContext !== '');

      if (mcpContext === '') {
        const googleContext = await TOOL_SEARCH_GOOGLE.callAPI(message.guild.id, responseToolUse);
        console.log('[Google]', googleContext !== '');
        mcpContext = googleContext;
      }

      await thinkingMessage.edit('🤭 กำลังจะมาแล้ว รออีกนิ๊สสส...');
      const responseAiResult = await AGENT_B.callAPI(mcpContext, userContxt);

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
      const fortune = await AGENT_A.callAPI(userContxt);

      await new Promise(resolve => setTimeout(resolve, 300));
      await thinkingMessage.edit(fortune);
    }
  } catch (error) {
    console.error('[Fortune] Logic Error:', error);
    await thinkingMessage.edit('A cosmic disturbance has interfered with my vision! Please try again later.');
  }
}

const fortuneQueue = new AsyncQueue(handleFortuneRequest);

function enqueueRequest(message: any): number {
  console.log(`[Fortune] Added to queue. Size: ${fortuneQueue.getSize() + 1}`);
  return fortuneQueue.enqueue(message);
}

function processQueue(): void {
  // enqueue() calls process() automatically; kept for backward compatibility
}

function getIsProcessingQueue(): boolean {
  return fortuneQueue.getIsProcessing();
}

function getQueueSize(): number {
  return fortuneQueue.getSize();
}

export {
  enqueueRequest,
  processQueue,
  getIsProcessingQueue,
  getQueueSize,
};
