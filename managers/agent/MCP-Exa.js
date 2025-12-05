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

// --- Configuration & Constants ---
const CONFIG = {
    API_URL: "https://api.exa.ai",
    API_KEY: process.env.EXA_API_KEY || "ERROR",
};

// --- Helper Functions ---

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

// --- Main Function ---

/**
 * Calls the EXA API to fetch news articles based on the provided date range and user query.
 *
 * @param {number} maxResult - The maximum number of results to return.
 * @param {string} userQuery - The user's query for the news articles.
 * @param {Object} dateParams - The date parameters for the API call.
 * @param {string} dateParams.start_date - The start date for the API call.
 * @param {string} dateParams.end_date - The end date for the API call.
 * @returns {Promise<string>} - The context of the news articles fetched from the API.
 */
async function _callByDate(maxResult, userQuery, dateParams) {
    // 1. Validation
    if (!CONFIG.API_KEY || CONFIG.API_KEY === "ERROR") {
        console.error("Critical: MISTRAL_API_KEY is missing.");
        return "";
    }

    if (!userQuery || typeof userQuery !== "string" || !userQuery.trim()) {
        return "";
    }

    try {
        const { start_date, end_date } = dateParams; // ex: getDateRange('last_30', 'YYYY-MM-DD');

        // 3. API Call
        const response = await fetch(`${CONFIG.API_URL}/search`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-api-key": `${CONFIG.API_KEY}`
            },
            body: JSON.stringify(
                {
                    "query": userQuery,
                    "category": "news",
                    "startCrawlDate": start_date,
                    "endCrawlDate": end_date,
                    "excludeDomains": ["facebook.com", "reddit.com", "tiktok.com", "instagram.com"],
                    "numResults": maxResult,
                    "startPublishedDate": start_date,
                    "endPublishedDate": end_date,
                    "type": "auto",
                    "userLocation": "TH",
                    "moderation": true,
                    "contents": {
                        "summary": {
                            "query": "Only use plain text format."
                        },
                        "context": true
                    }
                }
            ),
        });

        // 4. HTTP Error Handling
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status} - ${errorText}`);
        }

        // 5. Response Parsing
        const data = await response.json();
        return data.context || "";
    } catch (error) {
        console.error("[EXA] Failed 2:", error);
        return ``;
    }
}

/**
 * Call EXA MCP
 * @param {Object} responseToolUse - Response from agent tool use
 * @param {string} responseToolUse.tool - SEARCH or NO_SEARCH
 * @param {string} responseToolUse.suggest - Query keyword suggestion to use 
 * @param {number} responseToolUse.date - Day suggestion
 * @returns 
 */
async function callAPI(responseToolUse) {
    try {

        // console.log('[EXA] responseToolUse', responseToolUse);
        let contextCombine = [];

        if (responseToolUse.date <= 0) responseToolUse.date = 60;

        const dateCustom = getDateRange('custom', 'YYYY-MM-DD', parseInt(responseToolUse.date));
        // console.log('[EXA] dateCustom', dateCustom);
        const responseA = await _callByDate(10, responseToolUse.suggest, dateCustom);
        // console.log('[EXA] Result', responseA !== '');

        if (responseA !== "") {
            contextCombine.push(`Date: last ${responseToolUse.date} days (${dateCustom.start_date} - ${dateCustom.end_date})\nInformation:\n` + responseA);
        }
        return contextCombine.join('\n\n');
    } catch (error) {
        console.error("[EXA] Failed 1:", error);
        return ``;
    }
}

module.exports = {
    callAPI
};