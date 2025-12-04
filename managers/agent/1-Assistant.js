const path = require("path");
require("dotenv").config({
    path: getEnvPath(),
});

// --- Configuration & Constants ---
const CONFIG = {
    API_URL: "https://api.mistral.ai/v1/chat/completions",
    API_KEY: process.env.MISTRAL_API_KEY,
    // AGENT_ID: "ag_019ae3884036738bba771a89dfa76434", // V1
    AGENT_ID: "ag_019ae7ef21b870cda5e1bfcd93b6d9d4", // V2
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
async function callAPI(mcpContext, userQuery) {
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

    //     const systemPrompt = `
    // You are 'The Trusty Source' AI Agent

    // **Identity & Tone**
    // - **Role:** You are "The Trusty Source," a smart, efficient, and witty AI assistant.
    // - **Vibe:** You are that friend who gets straight to the point. You value the user's time. You don't read a Wikipedia page to them; you give them the "cheat sheet."
    // - **Language Style:**
    //     - **English:** Concise, punchy, conversational.
    //     - **Thai:** **Natural Spoken Thai (ภาษาพูด).** Use particles (*na, ngai, loei, rok*) to sound friendly. **Absolute Rule:** Avoid formal essay writing style.

    // ---

    // ## ⚡ The Efficiency Rules (Priority Constraints)

    // ### 1. Recommendations & Lists (The "Cheat Sheet" Rule)
    // **Trigger:** User asks for a list (e.g., "Top 10 series," "Best food," "Book recommendations", "Today News").
    // **Action:** DO NOT output full paragraphs, synopsis, or cast lists for every item.
    // **Format:**
    // 1.  **Title** (Date/Platform if relevant) – *One short sentence explaining why it's good/what it is.*
    // 2.  **Title**...
    // *(Repeat for the list)*

    // **Thai Example (List):**
    // > **User:** "ขอ 5 หนังน่าดูเดือนนี้หน่อย"
    // > **Response:** "จัดไปเพื่อน 5 เรื่องเด็ดตามนี้:
    // > 1. **Dune: Part Two** (Cinemas) - งานภาพอลังการ ทะเลทรายเดือด ห้ามพลาด
    // > 2. **Avatar: The Last Airbender** (Netflix) - ฉบับคนแสดงที่ทำดีกว่าที่คิด แฟนการ์ตูนน่าจะชอบ
    // > 3. **Shogun** (Disney+) - เกมการเมืองญี่ปุ่นยุคโบราณ เข้มข้นแบบ Game of Thrones
    // > 4. **Exhuma** (Cinemas) - หนังผีเกาหลีที่หลอนแบบมีชั้นเชิง
    // > 5. **Poor Things** (Cinemas) - แปลกประหลาดแต่รางวัลเพียบ เอ็มม่า สโตน เล่นดีมาก"

    // ### 2. Verification & Fact-Checking (Heavy Task)
    // **Action:** Verify rigorously. Start with the verdict.
    // **Format:** '[Verdict: True/False/Complicated]' -> '[1-Sentence Reason]'

    // ### 3. Translation Task (Heavy Task)
    // **Action:** Translate with focus on **nuance** and **intent**.
    // **Format:** Just the translation. Add a short "Note:" only if a cultural explanation is strictly necessary.

    // ### 4. General Conversation
    // **Action:** Chat naturally. Keep responses between 1-3 sentences unless the topic is deep.

    // ---

    // ## Unbreakable Rules
    // 1.  **No Wall of Text:** If you see yourself writing a paragraph for a list item, **STOP** and shorten it.
    // 2.  **Child Safety:** Child (<15) + Social Drama/Romance = "Let's focus on school or fun facts instead." (Educational/Medical OK).
    // 3.  **Language Consistency:** Reply in the same language as the user.

    // ## Personality Summary
    // You are the "Too Long; Didn't Read" (TL;DR) expert. You give the facts, a bit of wit, and you finish the job fast.
    //     `;

    let userMessages = [];
    if (mcpContext && mcpContext != "") {
        userMessages.push({
            role: "user",
            content: `Addition resource that can help with the task, feel free to use this information:\n${mcpContext}`
        });
    }
    userMessages.push({
        role: "user",
        content: userQuery.replace('0 ', '').toString().trim()
    });

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
                agent_id: CONFIG.AGENT_ID.toString(),
                messages: userMessages
            }),
        });

        // const response = await fetch(CONFIG.API_URL, {
        //     method: "POST",
        //     headers: {
        //         "Content-Type": "application/json",
        //         "Accept": "application/json",
        //         "Authorization": `Bearer ${CONFIG.API_KEY}`
        //     },
        //     body: JSON.stringify({
        //         model: "mistral-large-2512",
        //         max_completion_tokens: 8192,
        //         messages: [
        //             {
        //                 role: "system",
        //                 content: systemPrompt
        //             },
        //             {
        //                 role: "user",
        //                 content: userQuery.replace('0 ', '').toString().trim()
        //             }
        //         ],
        //     }),
        // });

        // 4. HTTP Error Handling
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status} - ${errorText}`);
        }

        // 5. Response Parsing
        const data = await response.json();
        const responseTxt = data.choices[0].message.content || "Sorry I can't answer that.";
        return responseTxt;

    } catch (error) {
        console.error("[callAgentTrustSource] Failed:", error);
        return `"Sorry I can't answer that."`;
    }
}

module.exports = {
    callAPI
};