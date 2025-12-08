const { DynamicStructuredTool } = require("@langchain/core/tools");
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
// --- FIX START ---
// We try to get .default (standard for ESM-to-CJS), fallback to the module itself
const ExaPkg = require("exa-js");
const Exa = ExaPkg.default || ExaPkg;
// --- FIX END ---
const { z } = require("zod");
const path = require("path");
require("dotenv").config({ path: getEnvPath() });

function getEnvPath() {
    const envMap = { blue: ".env.blue", development: ".env", staging: ".env.staging", production: ".env.production" };
    return envMap[process.env.NODE_ENV || "development"];
}

// --- Helper: Date Range Logic ---
function getDateRange(days) {
    const now = new Date();
    // 0 = No limit (Look back ~2 years for history/evergreen)
    const lookback = (days === 0) ? 730 : (days || 1);
    
    const endDate = now.toISOString().split('T')[0];
    const startDateObj = new Date(now);
    startDateObj.setDate(now.getDate() - lookback);
    const startDate = startDateObj.toISOString().split('T')[0];
    
    return { startDate, endDate };
}

// --- Tool 1: Exa Search (Native SDK) ---
// Initialize Client (Safely checks if API Key exists to prevent crash on startup)
const exaApiKey = process.env.EXA_API_KEY;
const exaClient = exaApiKey ? new Exa(exaApiKey) : null;

const exaSearchTool = new DynamicStructuredTool({
    name: "exa_search",
    description: "Search for news using Exa.ai.",
    schema: z.object({
        query: z.string().describe("Optimized search keyword"),
        days: z.number().describe("Days to look back (0, 1, 7, etc.)"),
    }),
    func: async ({ query, days }) => {
        if (!exaClient) return "Error: EXA_API_KEY is missing in .env";
        const { startDate, endDate } = getDateRange(days);
        
        try {
            console.log(`[Exa] Searching: "${query}" (${startDate} to ${endDate})`);
            const result = await exaClient.searchAndContents(query, {
                startCrawlDate: startDate,
                endCrawlDate: endDate,
                numResults: 10,
                type: "auto",
                excludeDomains: ["facebook.com", "reddit.com", "tiktok.com", "instagram.com"],
                summary: { query: "Summary relevant to query" }
            });

            if (!result.results?.length) return "No results found.";
            return result.results.map(r => `Title: ${r.title}\nSummary: ${r.summary}`).join("\n\n");
        } catch (error) {
            console.error("[Exa] Error:", error);
            return "Failed to fetch from Exa.";
        }
    },
});

// --- Tool 2: Google Search (Native Grounding) ---
const googleModel = new ChatGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY,
    model: "gemini-2.0-flash-exp", 
    temperature: 0.5,
    googleSearchRetrieval: { disableAttribution: false }, 
});

const googleSearchTool = new DynamicStructuredTool({
    name: "google_search",
    description: "Search Google for real-time news.",
    schema: z.object({
        query: z.string(),
        days: z.number(),
    }),
    func: async ({ query, days }) => {
        if (!process.env.GEMINI_API_KEY) return "Error: GEMINI_API_KEY missing.";
        const { startDate, endDate } = getDateRange(days);
        const searchPrompt = `"${query}" from ${startDate} to ${endDate}`;

        try {
            console.log(`[Google] Grounding: "${searchPrompt}"`);
            const response = await googleModel.invoke([["user", searchPrompt]]);
            return response.content || "No results found.";
        } catch (error) {
            console.error("[Google] Error:", error);
            return "Failed to fetch from Google.";
        }
    },
});

module.exports = { exaSearchTool, googleSearchTool };