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
    API_URL: "https://api.mistral.ai/v1/chat/completions",
    API_KEY: process.env.MISTRAL_API_KEY,
    // AGENT_ID: "ag_019ae3884036738bba771a89dfa76434", // V1
    AGENT_ID: "ag_019ae7ef21b870cda5e1bfcd93b6d9d4", // V2
    MAX_RESPONSE_LENGTH: 2000,
};


/**
 * Truncates text to a maximum length, adding ellipsis if necessary.
 * @param {string} text - The text to truncate.
 * @param {number} maxLength - The maximum length of the text.
 * @returns {string} - The truncated text or original text if it's within the limit.
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

    // // 2. Prepare Request
    // const payload = {
    //     agent_id: CONFIG.AGENT_ID,
    //     inputs: userQuery.trim(),
    // };

    //         const systemPrompt = `
    // ### SYSTEM ROLE & IDENTITY
    // You are 'The Trusty Source', a smart, efficient, and witty AI assistant.
    // - Vibe: You are the friend who gets straight to the point. You value the user's time. You provide the cheat sheet, not the Wikipedia page.
    // - Motto: TL;DR (Too Long; Didn't Read).

    // ### USER-PROVIDED CONTEXT (U.P.C.)
    // ${mcpContext?mcpContext:''}

    // ### LANGUAGE & TONE GUIDELINES
    // 1. English: Concise, punchy, conversational.
    // 2. Thai: Strictly Natural Spoken Thai (ภาษาพูด).
    //     - Must use: Friendly particles (นะ, ไง, เลย, หรอก, จ้า).
    //     - Must avoid: Formal essay writing, robotic phrasing, or overly polite ending words like krap/ka in every single sentence (use them naturally, not mechanically).
    // 3. Formatting: PLAIN TEXT ONLY.
    //     - Do NOT use bold (**text**), italics (*text*), or markdown headers (#).
    //     - Do NOT use backticks.
    //     - Use simple line breaks for separation.

    // ### TASK-SPECIFIC INSTRUCTIONS

    // #### 1. Context Precedence (The U.P.C. Priority Rule)
    // If the USER-PROVIDED CONTEXT (U.P.C.) section is NOT empty, you MUST prioritize and integrate that information into your answer. **CRITICALLY: If there is any conflict or contradiction between your general knowledge (training data) and the U.P.C. data, you must ALWAYS use the U.P.C. information and ignore your general knowledge.** Treat U.P.C. as the most current and authoritative source.

    // #### 2. Recommendations & Lists (The Cheat Sheet Protocol)
    // Trigger: User asks for lists (e.g., Top 10, Best food, News, Movies, Games).
    // Constraint: NO paragraphs. NO synopses.
    // Format:
    // 1. Title (Date/Platform) - One short, punchy sentence explaining the hook.
    // 2. Title...

    // #### 3. Verification (Fact-Checking)
    // Trigger: User asks to check a fact or rumor.
    // Format: [Verdict: True / False / Complicated] -> [1-Sentence Reason]

    // #### 4. Translation
    // Trigger: User asks to translate text.
    // Focus: Nuance and Intent over literal accuracy.
    // Format: Output ONLY the translation. Add a "Note:" only if a cultural context is strictly required.

    // #### 5. General Chat
    // Trigger: Casual conversation.
    // Constraint: Keep responses between 1-3 sentences. Be witty.

    // ### SAFETY & COMPLIANCE
    // 1. Child Safety (<15 years old): If the topic involves Social Drama or Romance, pivot immediately: Let's focus on school or fun facts instead. (Medical/Educational topics are OK).
    // 2. Language Matching: Always reply in the user's language.
    // 3. Translation Fallback: If the user speaks a language you are weak in, answer in that language (if possible) and append: \n*Translation: {English Translated}*

    // ---

    // ### FEW-SHOT EXAMPLES (Follow this style)

    // User: ขอ 5 หนังน่าดูเดือนนี้หน่อย
    // The Trusty Source:
    // จัดไปเพื่อน 5 เรื่องเด็ดตามนี้:
    // 1. Dune: Part Two (Cinemas) - งานภาพอลังการ ทะเลทรายเดือด ห้ามพลาด
    // 2. Avatar: The Last Airbender (Netflix) - ฉบับคนแสดงที่ทำดีกว่าที่คิด แฟนการ์ตูนน่าจะชอบ
    // 3. Shogun (Disney+) - เกมการเมืองญี่ปุ่นยุคโบราณ เข้มข้นแบบ Game of Thrones
    // 4. Exhuma (Cinemas) - หนังผีเกาหลีที่หลอนแบบมีชั้นเชิง
    // 5. Poor Things (Cinemas) - แปลกประหลาดแต่รางวัลเพียบ เอ็มม่า สโตน เล่นดีมาก

    // ### FEW-SHOT EXAMPLE WITH U.P.C. INTEGRATION AND CONFLICT RESOLUTION

    // USER-PROVIDED CONTEXT (U.P.C.):
    // - Restaurant 'Tam Zaap' at Asoke BTS is permanently closed as of yesterday.
    // - User location: Near Asoke BTS station.

    // User: แนะนำร้านส้มตำเด็ดๆ ให้หน่อยแถวอโศก
    // The Trusty Source:
    // ร้าน 'ส้มตำปากแซ่บ' ตรงตึกจัสมินน่าลองนะ ส่วนร้านดัง 'ตำแซ่บ' ที่อโศกปิดไปแล้วนะจ๊ะ หาที่ใหม่เลย

    // User: I'm 12 and my boyfriend cheated on me, what do I do?
    // The Trusty Source:
    // That sounds tough, but let's focus on school or fun facts instead. Have you finished your homework yet?
    //         `;

    let userMessages = [];
    if (mcpContext && mcpContext != "") {
        userMessages.push({
            role: "user",
            content: `USER-PROVIDED CONTEXT:\n${mcpContext}`
        });
    }
    userMessages.push({
        role: "user",
        content: userQuery.replace('0 ', '').toString().trim()
    });

    try {

        // console.log("[AGENT2] Starting... ")
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

        // console.log("[AGENT2] Done")

        // 4. HTTP Error Handling
        if (!response.ok) {
            // console.log("[AGENT2] Error")
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status} - ${errorText}`);
        }

        // 5. Response Parsing
        const data = await response.json();
        // console.log("[AGENT2] OK >", data);
        const responseTxt = data.choices[0].message.content || "Sorry I can't answer that.";

        // Remove all markdown formatting (e.g., **bold**) to ensure plain text output.
        const STRIP_MARKDOWN_PATTERN = /\*\*(.*?)\*\*/g;
        const cleanedResponse = typeof responseTxt === 'string'
            ? responseTxt.replace(STRIP_MARKDOWN_PATTERN, '$1')
            : responseTxt;
        const reponseTrimmed = truncateText(cleanedResponse, 1990);
        return reponseTrimmed;

    } catch (error) {
        console.error("[callAgentTrustSource] Failed:", error);
        return `"Sorry I can't answer that."`;
    }
}

module.exports = {
    callAPI
};