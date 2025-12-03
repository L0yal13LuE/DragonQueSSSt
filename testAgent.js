const fetch = require("node-fetch");
require("dotenv").config({
    path: {
        blue: ".env.blue",
        development: ".env",
        staging: ".env.staging",
        production: ".env.production",
    }[process.env.NODE_ENV || "development"],
});
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || "ERROR";
const MISTRAL_AGENT_ID = "ag_019ae3884036738bba771a89dfa76434";
async function callAgentTrustSource(t) {
    const url = "https://api.mistral.ai/v1/conversations";
    const payload = {
        agent_id: MISTRAL_AGENT_ID,
        inputs: t?.trim().toString(),
    };
    try {
        if (MISTRAL_API_KEY === "ERROR") {
            throw new Error("API_KEY is not set in environment variables.");
        }
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-KEY": MISTRAL_API_KEY
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error: ${response.status} - ${errorText}`);
        }
        const data = await response.json();
        const answer = data.outputs?.find(o => o.role === "assistant")?.content.map((s)=> s.type === 'text' && s.text).join('') || "No response from agent.";
        return answer.toString().length < 2000 ? answer.toString() : answer.toString().substring(0, 1997) + "...";
    } catch (error) {
        console.error("Failed to call API:", error.message);
        return `Error: ${error.message}`;
    }
}

module.exports = { callAgentTrustSource };