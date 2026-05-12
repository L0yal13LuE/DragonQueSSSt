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

const CONFIG = {
  API_URL: 'https://api.exa.ai',
  API_KEY: process.env.EXA_API_KEY || 'ERROR',
};

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

async function _callByDate(maxResult: number, userQuery: string, dateParams: DateRange): Promise<string> {
  if (!CONFIG.API_KEY || CONFIG.API_KEY === 'ERROR') {
    console.error('[EXA] Critical: EXA KEY is missing.');
    return '';
  }

  if (!userQuery || typeof userQuery !== 'string' || !userQuery.trim()) {
    console.error('[EXA] Query is empty.');
    return '';
  }

  try {
    const { start_date, end_date } = dateParams;
    console.log('[EXA] Searching...');
    const response = await fetch(`${CONFIG.API_URL}/search`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': `${CONFIG.API_KEY}`,
      },
      body: JSON.stringify({
        query: userQuery,
        startCrawlDate: start_date,
        endCrawlDate: end_date,
        excludeDomains: ['facebook.com', 'reddit.com', 'tiktok.com', 'instagram.com'],
        numResults: maxResult,
        startPublishedDate: start_date,
        endPublishedDate: end_date,
        type: 'auto',
        moderation: true,
        contents: {
          summary: {
            query: '# Task\n- Summary the context without other properties\n- Translate the summary If not English\n- Proceed with restrict rules\n\n# Output Format\n{ short to middle summary or key takeaway (must maintain the core important information) }\n\n# Rules (Must follow)\n- Straight to the point without explaining  the website business or what they do.\n- Use English with nutral languange explanation as much as possible. \n- IF source is not English language, must translate the source to English with nutral tone explantion according to source language, becareful to not over-doing this.\n- Use only plain text format no bold, markdown just pure text with simple lines breaking.',
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const responseContext: string = data.results?.map((e: any) => e.summary).join('\n\n') || '';
    return responseContext;
  } catch (error) {
    console.error('[EXA] Failed 2:', error);
    return '';
  }
}

async function callAPI(responseToolUse: SearchDecisionResult): Promise<string> {
  try {
    const contextCombine: string[] = [];
    if (responseToolUse.date <= 0) responseToolUse.date = 60;
    const dateCustom = getDateRange('custom', 'YYYY-MM-DD', parseInt(String(responseToolUse.date)));
    const responseText = await _callByDate(10, responseToolUse.suggest, dateCustom);
    if (responseText !== '') {
      contextCombine.push(`Date: last ${responseToolUse.date} days (${dateCustom.start_date} - ${dateCustom.end_date})\nInformation:\n${responseText}`);
    }
    return contextCombine.join('\n\n');
  } catch (error) {
    console.error('[EXA] Failed 1:', error);
    return '';
  }
}

export { callAPI };
