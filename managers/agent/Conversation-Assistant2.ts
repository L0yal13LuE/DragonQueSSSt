import dotenv from 'dotenv';
import path from 'path';

function getEnvPath(): string {
  const envMap: Record<string, string> = {
    blue: '.env.blue',
    development: '.env',
    staging: '.env.staging',
    production: '.env.production',
  };
  return envMap[process.env.NODE_ENV || 'development'];
}

dotenv.config({ path: getEnvPath() });

const CONFIG = {
  API_URL: 'https://api.mistral.ai/v1/chat/completions',
  API_KEY: process.env.MISTRAL_API_KEY,
  AGENT_ID: 'ag_019ae7ef21b870cda5e1bfcd93b6d9d4',
  MAX_RESPONSE_LENGTH: 2000,
};

function truncateText(text: string | null | undefined, maxLength: number): string {
  if (!text) return '';
  const str = String(text);
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

function parseAgentResponse(data: any): string {
  if (!data.outputs || !Array.isArray(data.outputs)) {
    return 'No outputs received from agent.';
  }

  const assistantOutput = data.outputs.find(
    (e: any) => e.role === 'assistant' && e.type === 'message.output'
  );

  if (!assistantOutput) return 'No response from agent.';

  if (typeof assistantOutput.content === 'string') {
    return assistantOutput.content;
  }

  if (Array.isArray(assistantOutput.content)) {
    return assistantOutput.content
      .filter((s: any) => s.type === 'text' && s.text)
      .map((s: any) => s.text)
      .join('') || 'Agent produced no text output.';
  }

  return 'Unknown response format.';
}

async function callAPI(mcpContext: string, userQuery: string): Promise<string> {
  if (!CONFIG.API_KEY || CONFIG.API_KEY === 'ERROR') {
    console.error('Critical: MISTRAL_API_KEY is missing.');
    return 'Error: Internal configuration issue (API Key missing).';
  }

  if (!userQuery || typeof userQuery !== 'string' || !userQuery.trim()) {
    return 'Error: Invalid input provided.';
  }

  const userMessages: { role: string; content: string }[] = [];
  if (mcpContext && mcpContext !== '') {
    userMessages.push({
      role: 'user',
      content: `USER-PROVIDED CONTEXT:\n${mcpContext}`,
    });
  }
  userMessages.push({
    role: 'user',
    content: userQuery.replace('0 ', '').toString().trim(),
  });

  try {
    const response = await fetch('https://api.mistral.ai/v1/agents/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${CONFIG.API_KEY}`,
      },
      body: JSON.stringify({
        agent_id: CONFIG.AGENT_ID,
        messages: userMessages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    let responseTxt: string = '';
    if (Array.isArray(data.choices[0].message.content)) {
      responseTxt = data.choices[0].message.content.find((e: any) => e.type === 'text')?.text || "Sorry I can't answer that.";
    } else {
      responseTxt = data.choices[0].message.content || "Sorry I can't answer that.";
    }

    const STRIP_MARKDOWN_PATTERN = /\*\*(.*?)\*\*/g;
    const cleanedResponse = typeof responseTxt === 'string'
      ? responseTxt.replace(STRIP_MARKDOWN_PATTERN, '$1')
      : responseTxt;
    return cleanedResponse;
  } catch (error) {
    console.error('[callAgentTrustSource] Failed:', error);
    return '"Sorry I can\'t answer that."';
  }
}

export { callAPI };
