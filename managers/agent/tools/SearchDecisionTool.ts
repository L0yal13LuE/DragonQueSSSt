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

interface SearchDecisionResult {
  tool: 'SEARCH' | 'NO_SEARCH';
  suggest: string;
  date: number;
}

const CONFIG = {
  API_URL: 'https://api.mistral.ai/v1/agents/completions',
  API_KEY: process.env.MISTRAL_API_KEY,
  AGENT_ID: 'ag_019ae92cb161734b97b57d3cc4410ae6',
  MAX_RESPONSE_LENGTH: 2000,
};

async function callAPI(userQuery: string): Promise<SearchDecisionResult | null> {
  if (!CONFIG.API_KEY || CONFIG.API_KEY === 'ERROR') {
    console.error('Critical: MISTRAL_API_KEY is missing.');
    return null;
  }

  if (!userQuery || typeof userQuery !== 'string' || !userQuery.trim()) {
    return null;
  }

  const currentDate = new Date().toISOString().slice(0, 10);
  const userMessages = [
    {
      role: 'user',
      content: 'Current Date: ' + currentDate + '\nQuery: ' + userQuery.replace('0 ', '').toString().trim(),
    },
  ];

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
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const responseTxt = data.choices[0].message.content || '';
    return JSON.parse(responseTxt) as SearchDecisionResult;
  } catch (error) {
    console.error('[Search-Decision] Failed:', error);
    return null;
  }
}

export { callAPI };
