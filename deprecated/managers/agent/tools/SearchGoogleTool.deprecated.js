const path = require("path");
require("dotenv").config({
    path: getEnvPath(),
});
function getEnvPath() {
    const envMap = {
        blue: ".env.blue",
        development: ".env",
        staging: ".env.staging",
        production: ".env.production",
    };
    return envMap[process.env.NODE_ENV || "development"];
}

/**
 * geminiAgent.js
 * Node.js Agent for Discord
 * Features: 
 * 1. Rate Limiting: 10 requests per minute PER SERVER (Guild).
 * 2. Non-Streaming: Uses standard generateContent.
 * 3. System Prompt: News Aggregator logic.
 */

// --- CONFIGURATION ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL_ID = "gemini-2.5-flash-lite";

// Note: Removed 'stream' from the URL
const BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent`;

// --- SYSTEM PROMPT ---
const SYSTEM_PROMPT = `
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

// --- RATE LIMIT STATE (Server Based) ---
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 Minute
const MAX_REQUESTS_PER_WINDOW = 10;  // 10 Requests per SERVER per window
const serverUsageMap = new Map();

/**
 * Checks rate limit for a specific Server (Guild).
 * @param {string} serverId - The Discord Guild ID.
 * @returns {boolean} True if allowed, False if limited.
 */
function checkRateLimit(serverId) {
    // If no serverId provided (e.g. DM), handle safely or allow
    if (!serverId) return true;

    const now = Date.now();
    let timestamps = serverUsageMap.get(serverId) || [];

    // Filter out timestamps older than the window
    timestamps = timestamps.filter(time => now - time < RATE_LIMIT_WINDOW);

    // Check limit
    if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
        return false;
    }

    // Update usage
    timestamps.push(now);
    serverUsageMap.set(serverId, timestamps);
    return true;
}

// Cleanup memory periodically
setInterval(() => {
    const now = Date.now();
    for (const [id, timestamps] of serverUsageMap.entries()) {
        const valid = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW);
        if (valid.length === 0) serverUsageMap.delete(id);
        else serverUsageMap.set(id, valid);
    }
}, RATE_LIMIT_WINDOW);


/**
 * Formats a given date to a specified UTC format.
 * @param {Date} date - The date to format.
 * @param {string} [formatType='YYYY-MM-DD'] - The desired date format.
 * @returns {string} - The formatted date string.
 */
function formatDateToUTC(date, formatType = 'YYYY-MM-DD') {
    const pad = (num) => num.toString().padStart(2, '0');

    // Date components in UTC
    const year = date.getUTCFullYear();
    const month = pad(date.getUTCMonth() + 1); // getUTCMonth is 0-indexed
    const day = pad(date.getUTCDate());

    if (formatType === 'YYYY-MM-DD') {
        return `${year}-${month}-${day}`;
    }

    // YYYY-MM-DDTHH:mm:ss format (we append 'Z' to denote UTC time)
    const hours = pad(date.getUTCHours());
    const minutes = pad(date.getUTCMinutes());
    const seconds = pad(date.getUTCSeconds());

    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}Z`;
};

/**
 * Gets a date range based on the specified period.
 * @param {string} period - The time period to calculate (e.g., 'last_7', 'last_30').
 * @param {string} [formatType='YYYY-MM-DD'] - The desired date format.
 * @returns {Object} - An object containing start_date and end_date strings.
 */
function getDateRange(period, formatType = 'YYYY-MM-DD', customDay) {
    // Use the actual current date/time
    const now = new Date();

    // 1. Determine the End Date (Always 'now')
    // We use the full format for the end date if the requested format includes time,
    // otherwise we just use the date.
    const endDate = formatDateToUTC(now, formatType);

    // 2. Calculate the Start Date
    const startDateObj = new Date(now);

    switch (period) {
        case 'last_7':
            // Subtract 7 days from the current time in milliseconds
            // 7 days * 24h * 60m * 60s * 1000ms
            const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
            startDateObj.setTime(now.getTime() - sevenDaysInMs);
            break;
        case 'last_30':
            // Subtract 30 days from the current time in milliseconds
            // 30 days * 24h * 60m * 60s * 1000ms
            const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
            startDateObj.setTime(now.getTime() - thirtyDaysInMs);
            break;

        case 'last_3_months':
            // Manipulate the month component (setMonth handles year rollovers automatically)
            startDateObj.setMonth(now.getMonth() - 3);
            break;

        case 'last_year':
            // Manipulate the year component
            startDateObj.setFullYear(now.getFullYear() - 1);
            break;

        case 'custom':
            // Subtract X days from the current time in milliseconds
            // X days * 24h * 60m * 60s * 1000ms
            const customDayInMs = customDay * 24 * 60 * 60 * 1000;
            startDateObj.setTime(now.getTime() - customDayInMs);
            break;

        default:
            console.error(`Error: Invalid period '${period}' provided. Must be 'last_30', 'last_3_months', or 'last_year'.`);
            return { start_date: 'Invalid Period', end_date: endDate };
    }

    // 3. Format the Start Date
    const startDate = formatDateToUTC(startDateObj, formatType);

    // 4. Return the result object
    return { start_date: startDate, end_date: endDate };
}

/**
 * Main Agent Function
 * @param {string} serverId - The Discord Guild ID (message.guild.id).
 * @param {string} prompt - The user input.
 * @returns {Promise<string>} The response text or "" if limited/error.
 */
async function callAPI(serverId, responseToolUse) {
    // 1. Check Rate Limit (Per Server)
    if (!checkRateLimit(serverId)) {
        console.log(`[Google] Rate limit hit for server: ${serverId}`);
        return "";
    }

    if (!GEMINI_API_KEY) {
        console.error("[Google] Missing GEMINI_API_KEY");
        return "";
    }

    // 2. Construct Payload
    const dateCustom = getDateRange('custom', 'YYYY-MM-DD', parseInt(responseToolUse.date));
    const prompt = `"${responseToolUse.suggest}" from ${dateCustom.start_date} to ${dateCustom.end_date}`;
    const payload = {
        systemInstruction: {
            parts: [{ text: SYSTEM_PROMPT }]
        },
        contents: [
            {
                role: "user",
                parts: [{ text: prompt }]
            }
        ],
        generationConfig: {
            temperature: 0.5,
            thinkingConfig: {
                thinkingBudget: 8192,
            },
        },
        tools: [
            { googleSearch: {} }
        ]
    };

    try {
        console.log("[Google] Searching...");

        // 3. REST API Call (Standard POST, no stream)
        const response = await fetch(`${BASE_URL}?key=${GEMINI_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error(`Gemini API Error ${response.status}:`, errText);
            return "";
        }

        // 4. Parse Standard JSON Response
        const data = await response.json();

        // Extract text from the first candidate
        let reponseContext = "";
        if (data.candidates &&
            data.candidates[0] &&
            data.candidates[0].content &&
            data.candidates[0].content.parts &&
            data.candidates[0].content.parts[0].text) {

            reponseContext = data.candidates[0].content.parts[0].text.trim();
        }

        // console.log("[Google] Produce Result >>", reponseContext && reponseContext !== '');

        return reponseContext;

    } catch (e) {
        console.error("[Google] Agent Execution Error:", e);
        return "";
    }
}

module.exports = { callAPI };