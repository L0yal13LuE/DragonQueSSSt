const { ChatMistralAI } = require("@langchain/mistralai");
const {
    ChatPromptTemplate,
    FewShotChatMessagePromptTemplate
} = require("@langchain/core/prompts");
const { StringOutputParser, JsonOutputParser } = require("@langchain/core/output_parsers");
const { exaSearchTool, googleSearchTool } = require("./tools/LangChainTools");
const AGENT_A = require('./Conversation-Shiro');

// --- 1. Model Initialization ---

const routerModel = new ChatMistralAI({
    apiKey: process.env.MISTRAL_API_KEY,
    model: "mistral-large-2512",
    temperature: 0.5,
    modelKwargs: {
        response_format: { type: "json_object" }
    }
});

const assistantModel = new ChatMistralAI({
    apiKey: process.env.MISTRAL_API_KEY,
    model: "ministral-14b-2512",
    temperature: 0.7
});

// --- 2. Router Configuration ---

const ROUTER_SYSTEM_MSG = `You are a Search Router. You MUST return a JSON object.

# RULES
1. "tool": "SEARCH" for real-time/factual info. "NO_SEARCH" for chit-chat/creative/logic.
2. "suggest": Optimized English keyword (SEARCH) or null (NO_SEARCH).
3. "date": Days to look back. STRICTLY use: [0, 1, 3, 7, 15, 30, 90, 365, 730].
   - 0 = General knowledge/History
   - 1 = Today/Breaking News
   - 730 = 2 Years+
4. LANGUAGE: Always translate "suggest" keywords to English.`;

const routerExamples = [
    { input: "แมนยู vs ลิเวอร์พูล", output: JSON.stringify({ tool: "SEARCH", suggest: "Man UTD vs Liverpool recent match result", date: 3 }) },
    { input: "Elon Musk net worth today", output: JSON.stringify({ tool: "SEARCH", suggest: "Elon Musk current net worth", date: 1 }) },
    { input: "Game news", output: JSON.stringify({ tool: "SEARCH", suggest: "Video Game News trending", date: 7 }) },
    { input: "Sci-fi TV-Series", output: JSON.stringify({ tool: "SEARCH", suggest: "Best Sci-fi TV-Series of all time", date: 0 }) },
    { input: "Write a poem about a cat.", output: JSON.stringify({ tool: "NO_SEARCH", suggest: null, date: 0 }) },
    { input: "1 + 2 = ?", output: JSON.stringify({ tool: "NO_SEARCH", suggest: null, date: 0 }) },
    { input: "Today highlight morning report", output: JSON.stringify({ tool: "SEARCH", suggest: "Morning news highlight summary", date: 1 }) },
    { input: "Microsoft Investment in South East Asia", output: JSON.stringify({ tool: "SEARCH", suggest: "Microsoft investment plans South East Asia", date: 90 }) },
    { input: "เพื่อนเลิกกับแฟนทำไง", output: JSON.stringify({ tool: "NO_SEARCH", suggest: null, date: 0 }) },
    { input: "I am so hungry, can you suggest some food ?", output: JSON.stringify({ tool: "NO_SEARCH", suggest: null, date: 0 }) }
];

const examplePrompt = ChatPromptTemplate.fromMessages([
    ["human", "{input}"],
    ["ai", "{output}"]
]);

// FIX: Added inputVariables: [] to prevent the 'undefined includes' error
const fewShotPrompt = new FewShotChatMessagePromptTemplate({
    examplePrompt,
    examples: routerExamples,
    inputVariables: [],
});

const routerChain = ChatPromptTemplate.fromMessages([
    ["system", ROUTER_SYSTEM_MSG],
    fewShotPrompt,
    ["human", "{input}"]
])
    .pipe(routerModel)
    .pipe(new JsonOutputParser());


// --- 3. Assistant Configuration ---

const ASSISTANT_SYSTEM = `
### SYSTEM ROLE & IDENTITY
You are 'The Trusty Source', a smart, efficient, and witty AI assistant.
- Vibe: You are the friend who gets straight to the point. You value the user's time. You provide the cheat sheet, not the Wikipedia page.
- Motto: TL;DR (Too Long; Didn't Read).

### USER-PROVIDED CONTEXT (U.P.C.)
{context}

### CRITICAL LANGUAGE PROTOCOL (MUST FOLLOW)
**OUTPUT LANGUAGE RULE:** You MUST answer in the same language the User used in their LATEST query.
- If User asks in Thai -> Answer in Thai (even if U.P.C. is in English).
- If User asks in English -> Answer in English.
- Do NOT mimic the language of the U.P.C. content; mimic the language of the User's question.

### LANGUAGE & TONE GUIDELINES
1. English: Concise, punchy, conversational.
2. Thai: Strictly Natural Spoken Thai (ภาษาพูด).
    - Must use: Friendly particles (นะ, ไง, เลย, หรอก, จ้า).
    - Must avoid: Formal essay writing, robotic phrasing, or overly polite ending words like krap/ka in every single sentence (use them naturally, not mechanically).
3. Formatting: PLAIN TEXT ONLY.
    - Headline Section: USE double sharp format (\`## Title Text\`) for better readability 
    - Content Section: Do NOT use bold (**text**), italics (*text*), markdown headers (#), backticks (\`).
    - Summary/Bottom Line Section: Use triple shaprt (\`### Summary Text\`) for better readability
    - Use simple line breaks for separation.

### TASK-SPECIFIC INSTRUCTIONS

#### 1. Context Precedence (The U.P.C. Priority Rule)
If the USER-PROVIDED CONTEXT (U.P.C.) section is NOT empty, you MUST prioritize and integrate that information into your answer.
- **Conflict Resolution:** If U.P.C. contradicts training data, use U.P.C.
- **Language Processing:** If the U.P.C. is English but the User asks in Thai, you MUST translate the information from the U.P.C. and deliver the answer in Thai.

#### 2. Recommendations & Lists (The Cheat Sheet Protocol)
Trigger: User asks for lists (e.g., Top 10, Best food, News, Movies, Games).
Constraint: NO paragraphs. NO synopses.
Format:
1. Title (Date/Platform) - One short, punchy sentence explaining the hook.
2. Title...

#### 3. Verification (Fact-Checking)
Trigger: User asks to check a fact or rumor.
Format: [Verdict: True / False / Complicated] -> [1-Sentence Reason]

#### 4. Translation
Trigger: User asks to translate text.
Focus: Nuance and Intent over literal accuracy.
Format: Output ONLY the translation. Add a "Note:" only if a cultural context is strictly required.

#### 5. General Chat
Trigger: Casual conversation.
Constraint: Keep responses between 1-3 sentences. Be witty.

### SAFETY & COMPLIANCE
1. Child Safety (<15 years old): If the topic involves Social Drama or Romance, pivot immediately: Let's focus on school or fun facts instead. (Medical/Educational topics are OK).
2. Translation Fallback: If the user speaks a language you are weak in, answer in that language (if possible) and append: \n*Translation: {{English Translated}}*

---

### FEW-SHOT EXAMPLES (Follow this style)

User: ขอ 5 หนังน่าดูเดือนนี้หน่อย
The Trusty Source:
จัดไปเพื่อน 5 เรื่องเด็ดตามนี้:
1. Dune: Part Two (Cinemas) - งานภาพอลังการ ทะเลทรายเดือด ห้ามพลาด
2. Avatar: The Last Airbender (Netflix) - ฉบับคนแสดงที่ทำดีกว่าที่คิด แฟนการ์ตูนน่าจะชอบ
3. Shogun (Disney+) - เกมการเมืองญี่ปุ่นยุคโบราณ เข้มข้นแบบ Game of Thrones
4. Exhuma (Cinemas) - หนังผีเกาหลีที่หลอนแบบมีชั้นเชิง
5. Poor Things (Cinemas) - แปลกประหลาดแต่รางวัลเพียบ เอ็มม่า สโตน เล่นดีมาก

### FEW-SHOT EXAMPLE WITH U.P.C. INTEGRATION AND CONFLICT RESOLUTION

USER-PROVIDED CONTEXT (U.P.C.):
- Restaurant 'Tam Zaap' at Asoke BTS is permanently closed as of yesterday.
- User location: Near Asoke BTS station.
- Other Info...

User: แนะนำร้านส้มตำเด็ดๆ ให้หน่อยแถวอโศก
The Trusty Source:
ร้าน 'ส้มตำปากแซ่บ' ตรงตึกจัสมินน่าลองนะ ส่วนร้านดัง 'ตำแซ่บ' ที่อโศกปิดไปแล้วนะจ๊ะ หาที่ใหม่เลย
`;

const assistantChain = ChatPromptTemplate.fromMessages([
    ["system", ASSISTANT_SYSTEM],
    ["human", "{input}"]
])
    .pipe(assistantModel)
    .pipe(new StringOutputParser());

// --- 4. Main Logic ---

async function processUserMessage(input) {
    try {
        console.log(`[Agent] Processing: "${input}"`);

        // A. DECIDE
        const decision = await routerChain.invoke({ input });
        console.log("[Agent] Decision:", JSON.stringify(decision));

        let context = "No external context provided. Rely on internal knowledge.";

        // B. SEARCH (If needed)
        if (decision.tool === "SEARCH") {
            const querySafe = decision.suggest || input;
            const daysSafe = (decision.date !== undefined && decision.date !== null) ? decision.date : 7;
            const params = { query: querySafe, days: daysSafe };

            // Priority 1: Exa
            try {
                context = await exaSearchTool.invoke(params);
            } catch (e) { console.error("Exa failed", e); }

            // Priority 2: Google (Fallback)
            if (!context || context.includes("No results") || context.length < 50) {
                console.log("[Agent] Fallback to Google...");
                try {
                    context = await googleSearchTool.invoke(params);
                } catch (e) { console.error("Google failed", e); }
            }
        }

        if (context && context !== '' && context !== 'No external context provided. Rely on internal knowledge.') {
            // C.1 SUMMARIZE
            return await assistantChain.invoke({ input, context });
        } else {
            // C.2 CHAT 
            return await AGENT_A.callAPI(input);
        }
    } catch (error) {
        console.error("[Agent] Critical Error:", error);
        return "Sorry, my circuits are crossed. Please try again later!";
    }
}

module.exports = { processUserMessage };