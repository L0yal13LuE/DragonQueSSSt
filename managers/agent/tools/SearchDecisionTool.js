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
    API_URL: "https://api.mistral.ai/v1/agents/completions",
    API_KEY: process.env.MISTRAL_API_KEY,
    AGENT_ID: "ag_019ae92cb161734b97b57d3cc4410ae6",
    MAX_RESPONSE_LENGTH: 2000,
};

/**
 * Calls the Mistral Agent API.
 * @param {string} userQuery - The text input from the user.
 * @returns {Promise<string>} - The agent's response or an error message.
 */
async function callAPI(userQuery) {
    // 1. Validation
    if (!CONFIG.API_KEY || CONFIG.API_KEY === "ERROR") {
        console.error("Critical: MISTRAL_API_KEY is missing.");
        return "Error: Internal configuration issue (API Key missing).";
    }

    if (!userQuery || typeof userQuery !== "string" || !userQuery.trim()) {
        return "Error: Invalid input provided.";
    }

    const currentDate = new Date().toISOString().slice(0, 10); // current date in YYYY-MM-DD format
    const userMessages = [
        {
            role: "user",
            content: "Current Date: " + currentDate + "\nQuery: " + userQuery.replace('0 ', '').toString().trim()
        }
    ];

    try {
        // 3. API Call
        const response = await fetch('https://api.mistral.ai/v1/agents/completions', {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Authorization": `Bearer ${CONFIG.API_KEY}`
            },
            body: JSON.stringify({
                agent_id: CONFIG.AGENT_ID,
                messages: userMessages,
                response_format: { type: "json_object" }
            }),
        });

        // 4. HTTP Error Handling
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status} - ${errorText}`);
        }

        // 5. Response Parsing
        const data = await response.json();
        const responseTxt = data.choices[0].message.content || "";
        return JSON.parse(responseTxt) || null;
    } catch (error) {
        console.error("[Search-Decision] Failed:", error);
        return ``;
    }
}

module.exports = {
    callAPI
};