const path = require("path");
require("dotenv").config({
    path: getEnvPath(),
});

// --- Configuration & Constants ---
const CONFIG = {
    API_URL: "https://api.exa.ai/search",
    API_KEY: process.env.EXA_API_KEY || "ERROR",
};

// --- Helper Functions ---

/**
 * Determines the correct .env file path based on NODE_ENV.
 */
function getEnvPath() {
    const envMap = {
        blue: ".env.blue",
        development: ".env",
        staging: ".env.staging",
        production: ".env.production",
    };
    return envMap[process.env.NODE_ENV || "development"];
}

// --- Main Function ---

/**
 * Calls the Mistral Agent API.
 * @param {string} userQuery - The text input from the user.
 * @returns {Promise<string>} - The agent's response or an error message.
 */
async function callAPI(userQuery) {
    // 1. Validation
    if (!CONFIG.API_KEY || CONFIG.API_KEY === "ERROR") {
        console.error("Critical: MISTRAL_API_KEY is missing.");
        return "";
    }

    if (!userQuery || typeof userQuery !== "string" || !userQuery.trim()) {
        return "";
    }

    try {
        // 3. API Call
        const response = await fetch(CONFIG.API_URL, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-api-key": `${CONFIG.API_KEY}`
            },
            body: JSON.stringify(
                {
                    "query": userQuery.trim(),
                    "numResults": 5,
                    "type": "deep",
                    "userLocation": "TH",
                    "contents": {
                        "context": true,
                        "livecrawl": "fallback"
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
        return data.context;

    } catch (error) {
        console.error("[EXA] Failed:", error);
        return ``;
    }
}

module.exports = {
    callAPI
};