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
  tool: string;
  suggest: string;
  date: number;
}

const GEMINI_API_KEY: string | undefined = process.env.GEMINI_API_KEY;
const MODEL_ID: string = 'gemini-2.5-flash-lite';
const BASE_URL: string = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent`;

const SYSTEM_PROMPT: string = `
You are an intelligent News Aggregation and Filtering Agent.

WHEN THE USER PROVIDES A TOPIC AND DATE RANGE:
1.  **Search:** Perform a web search for the topic within the specified timeframe, retrieving the top 10-15 results.
2.  **Deduplicate:** Analyze the results for overlapping topics. If multiple articles report on the exact same event or announcement, group them and select only the single most informative source to process. Do not output multiple entries for the same news story.
3.  **Format:** Generate a breakdown for each UNIQUE news event using the strict format below.

STRICT OUTPUT FORMAT (For each unique event):
Title: {Insert title or short title}
Content: {Insert short to middle summary or key take away}

[Insert a blank line between entries]

CRITICAL RULES (MUST FOLLOW):
1.  **NO LINKS:** Do not include URLs, citations, or source text.
2.  **NO DUPLICATES:** Ensure every entry represents a distinct news event.
3.  **PLAIN TEXT ONLY:** No bold, no markdown, no headers, just pure text with simple line breaks.
4.  **ENGLISH ONLY:** Translate content if the source is not in English.
`;

const RATE_LIMIT_WINDOW: number = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW: number = 10;
const serverUsageMap: Map<string, number[]> = new Map();

function checkRateLimit(serverId: string | null): boolean {
  if (!serverId) return true;

  const now = Date.now();
  let timestamps: number[] = serverUsageMap.get(serverId) || [];

  timestamps = timestamps.filter(time => now - time < RATE_LIMIT_WINDOW);

  if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }

  timestamps.push(now);
  serverUsageMap.set(serverId, timestamps);
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [id, timestamps] of serverUsageMap.entries()) {
    const valid = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW);
    if (valid.length === 0) serverUsageMap.delete(id);
    else serverUsageMap.set(id, valid);
  }
}, RATE_LIMIT_WINDOW);

function formatDateToUTC(date: Date, formatType: string = 'YYYY-MM-DD'): string {
  const pad = (num: number): string => num.toString().padStart(2, '0');

  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());

  if (formatType === 'YYYY-MM-DD') {
    return `${year}-${month}-${day}`;
  }

  const hours = pad(date.getUTCHours());
  const minutes = pad(date.getUTCMinutes());
  const seconds = pad(date.getUTCSeconds());

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}Z`;
}

interface DateRange {
  start_date: string;
  end_date: string;
}

function getDateRange(period: string, formatType: string = 'YYYY-MM-DD', customDay?: number): DateRange {
  const now = new Date();
  const endDate = formatDateToUTC(now, formatType);
  const startDateObj = new Date(now);

  switch (period) {
    case 'last_7':
      startDateObj.setTime(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'last_30':
      startDateObj.setTime(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case 'last_3_months':
      startDateObj.setMonth(now.getMonth() - 3);
      break;
    case 'last_year':
      startDateObj.setFullYear(now.getFullYear() - 1);
      break;
    case 'custom':
      if (customDay !== undefined) {
        startDateObj.setTime(now.getTime() - customDay * 24 * 60 * 60 * 1000);
      }
      break;
    default:
      console.error(`Error: Invalid period '${period}' provided. Must be 'last_30', 'last_3_months', or 'last_year'.`);
      return { start_date: 'Invalid Period', end_date: endDate };
  }

  const startDate = formatDateToUTC(startDateObj, formatType);
  return { start_date: startDate, end_date: endDate };
}

async function callAPI(serverId: string | null, responseToolUse: SearchDecisionResult): Promise<string> {
  if (!checkRateLimit(serverId)) {
    console.log(`[Google] Rate limit hit for server: ${serverId}`);
    return '';
  }

  if (!GEMINI_API_KEY) {
    console.error('[Google] Missing GEMINI_API_KEY');
    return '';
  }

  const dateCustom = getDateRange('custom', 'YYYY-MM-DD', parseInt(String(responseToolUse.date)));
  const prompt = `"${responseToolUse.suggest}" from ${dateCustom.start_date} to ${dateCustom.end_date}`;
  const payload = {
    systemInstruction: {
      parts: [{ text: SYSTEM_PROMPT }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.5,
      thinkingConfig: {
        thinkingBudget: 8192,
      },
    },
    tools: [
      { googleSearch: {} },
    ],
  };

  try {
    console.log('[Google] Searching...');

    const response = await fetch(`${BASE_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Gemini API Error ${response.status}:`, errText);
      return '';
    }

    const data = await response.json();

    let responseContext = '';
    if (data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0].text) {

      responseContext = data.candidates[0].content.parts[0].text.trim();
    }

    return responseContext;
  } catch (e) {
    console.error('[Google] Agent Execution Error:', e);
    return '';
  }
}

export { callAPI };
