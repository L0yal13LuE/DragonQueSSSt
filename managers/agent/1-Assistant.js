const path = require("path");
require("dotenv").config({
    path: getEnvPath(),
});

// --- Configuration & Constants ---
const CONFIG = {
    API_URL: "https://api.mistral.ai/v1/conversations",
    API_KEY: process.env.MISTRAL_API_KEY,
    AGENT_ID: "ag_019ae3884036738bba771a89dfa76434",
    MAX_RESPONSE_LENGTH: 2000,
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

/**
 * Truncates text to a maximum length, adding ellipsis if necessary.
 * @param {string} text 
 * @param {number} maxLength 
 * @returns {string}
 */
const truncateText = (text, maxLength) => {
    if (!text) return "";
    const str = text.toString();
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + "...";
};

/**
 * Parses the Mistral API response to extract the assistant's answer.
 * Handles both simple text outputs and complex tool outputs.
 * @param {object} data - The JSON response from the API
 * @returns {string} - The extracted text
 */
const parseAgentResponse = (data) => {
    if (!data.outputs || !Array.isArray(data.outputs)) {
        return "No outputs received from agent.";
    }

    // Attempt to find a standard assistant message output
    const assistantOutput = data.outputs.find(
        (e) => e.role === "assistant" && e.type === "message.output"
    );

    if (!assistantOutput) return "No response from agent.";

    // Case 1: Simple string content
    if (typeof assistantOutput.content === "string") {
        return assistantOutput.content;
    }

    // Case 2: Content is an array (likely containing tool results or mixed content)
    if (Array.isArray(assistantOutput.content)) {
        return assistantOutput.content
            .filter((s) => s.type === "text" && s.text)
            .map((s) => s.text)
            .join("") || "Agent produced no text output.";
    }

    return "Unknown response format.";
};

// --- Main Function ---

/**
 * Calls the Mistral Agent API.
 * @param {string} userQuery - The text input from the user.
 * @returns {Promise<string>} - The agent's response or an error message.
 */
async function CallAgentOne(userQuery) {
    // 1. Validation
    if (!CONFIG.API_KEY || CONFIG.API_KEY === "ERROR") {
        console.error("Critical: MISTRAL_API_KEY is missing.");
        return "Error: Internal configuration issue (API Key missing).";
    }

    if (!userQuery || typeof userQuery !== "string" || !userQuery.trim()) {
        return "Error: Invalid input provided.";
    }

    // 2. Prepare Request
    const payload = {
        agent_id: CONFIG.AGENT_ID,
        inputs: userQuery.trim(),
    };

    // Note: Standard Mistral API usually uses 'Authorization: Bearer KEY'.
    // If your specific endpoint requires X-API-KEY, keep it as is.
    const headers = {
        "Content-Type": "application/json",
        "X-API-KEY": CONFIG.API_KEY, 
        // "Authorization": `Bearer ${CONFIG.API_KEY}` // Uncomment if using standard endpoints
    };

    try {
        // 3. API Call
        const response = await fetch(CONFIG.API_URL, {
            method: "POST",
            headers: headers,
            body: JSON.stringify(payload),
        });

        // 4. HTTP Error Handling
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status} - ${errorText}`);
        }

        // 5. Response Parsing
        const data = await response.json();
        const fullAnswer = parseAgentResponse(data);

        // 6. Formatting
        return truncateText(fullAnswer, CONFIG.MAX_RESPONSE_LENGTH);

    } catch (error) {
        console.error("[callAgentTrustSource] Failed:", error.message);
        // Return a clean message to the caller/user, hide internal details if needed
        return `Error: Unable to process request. ${error.message}`;
    }
}

module.exports = { CallAgentOne };