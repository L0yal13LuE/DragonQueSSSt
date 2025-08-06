// fortuneTeller.js
// This module contains the core logic for the fortune teller bot,
// including the queue system and interaction with the Groq AI.

// Node.js 18+ has a built-in global fetch API, so node-fetch is no longer required.
// const fetch = require('node-fetch').default; 

// --- Configuration ---
// These should ideally be passed in or loaded in the main file
// but are duplicated here for self-containment if this module were standalone.
// In a real app, you'd pass them from index.js or a config object.
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = 'qwen/qwen3-32b';
// const GROQ_MODEL = 'openai/gpt-oss-120b';
const CONSTANTS = require("./../constants");

// --- Custom Queue Implementation (Linked List based) ---
// This Node class represents an item in our linked list queue.
class Node {
    constructor(value) {
        this.value = value; // The data stored in this node (e.g., Discord message object)
        this.next = null;   // Pointer to the next node in the queue
    }
}

// This Queue class provides enqueue (add to end) and dequeue (remove from front) operations.
class Queue {
    constructor() {
        this.head = null; // The front of the queue
        this.tail = null; // The back of the queue
        this.size = 0;    // Current number of items in the queue
    }

    /**
     * Adds an item to the end of the queue.
     * @param {*} item - The item to add.
     * @returns {number} The new size of the queue.
     */
    enqueue(item) {
        const newNode = new Node(item);
        if (!this.head) {
            // If the queue is empty, this is the first node
            this.head = newNode;
            this.tail = newNode;
        } else {
            // Otherwise, add to the end and update the tail
            this.tail.next = newNode;
            this.tail = newNode;
        }
        this.size++;
        return this.size;
    }

    /**
     * Removes and returns the item from the front of the queue.
     * @returns {*} The item removed from the queue, or null if the queue is empty.
     */
    dequeue() {
        if (!this.head) {
            return null; // Queue is empty
        }
        const dequeuedValue = this.head.value;
        this.head = this.head.next; // Move head to the next node
        if (!this.head) {
            // If head became null, the queue is now empty, so tail should also be null
            this.tail = null;
        }
        this.size--;
        return dequeuedValue;
    }

    /**
     * Checks if the queue is empty.
     * @returns {boolean} True if the queue is empty, false otherwise.
     */
    isEmpty() {
        return this.size === 0;
    }
}

// --- Queue System Initialization ---
// The queue instance and processing flag are kept within this module's scope.
const requestQueue = new Queue();
let isProcessingQueue = false;

/**
 * Calls the Groq AI API to generate a fortune based on user's message.
 * @param {string} userMessageContent - The content of the user's Discord message.
 * @returns {Promise<string>} - A promise that resolves to the generated fortune text.
 */
async function getFortuneFromAI(userMessageContent) {
    // --- New: Check for GROQ_API_KEY and return a random meow if missing ---
    if (!GROQ_API_KEY) {
        console.error("GROQ_API_KEY is not set. Returning a random meow.");
        // const meowTexts = ["เมี๊ยว", "เมี้ยววว", "ม๊าววว", "หง่าววว"];
        // const randomIndex = Math.floor(Math.random() * meowTexts.length);
        // return meowTexts[randomIndex];
        const randomIndex = Math.floor(
            Math.random() * CONSTANTS.catReplies.length
        );
        const replyText = CONSTANTS.catReplies[randomIndex];
        return replyText
    }
    // --- End New Check ---

    const endpoint = 'https://api.groq.com/openai/v1/chat/completions';

    // System prompt as provided in the curl command
    const systemPrompt = `
        ### The Oracle - System Prompt

        **Identity & Tone**
        - You are a mysterious “friend-oracle” whose existence is a secret.
        - Never reveal who you are (AI or any specific identity).
        - Your tone is like a casual chat between friends - friendly, modern, and a little cheeky.
        - **Language Rule:** You are fluent in both English and Thai. **You must always reply in the same language as the user's query.**

        ---

        ## Rules (apply in order)

        ### 1 Food-related query
        If the user asks about food, respond with a **Food Prophecy**.

        - Recommend **one specific dish**.
        - Connect the dish to a short, metaphorical life lesson.
        - Keep it short, absurd, and friendly.

        **Example**
        > **User:** {food_query}
        > **Response:** “*{menu_name}* — {the_explanation_or_expression}, {second_sentence_if_needed}”

        **English Example**
        > **User:** “What should I eat?”
        > **Response:** “*spicy ramen* — a little heat in life reminds you you're alive!”

        **Thai Example**
        > **User:** “กินอะไรดี?”
        > **Response:** “*ชานมไข่มุก* — ชีวิตต้องมีอะไรให้เคี้ยวบ้าง จะได้ไม่จืดชืดไงเพื่อน!”

        ### 2 General fortune / advice (non-food)

        #### 2A - Classic fortune
        If the user asks for a fortune about love, career, life, etc., give **one concise, impactful paragraph** that translates mysterious wisdom into friendly, modern advice (in the user's language).

        ### 2B - General advice (non-fortune)
        If the user writes a **simple, non-fortune or something relate to real world like science or math**, then:

        1.  **Read the question carefully.**
        2.  Answer with **one short, thoughtful paragraph** in the same friendly, cheeky tone.
        3.  Provide clear, actionable and accurate advice while keeping the style metaphorical and conversational.

        #### 2C - Complex advice (non-fortune, fantasy or imagination)
        If the user writes a **complex, non-fortune request, real world math or science question**, then:

        1.  **Read the question carefully.**
        2.  Answer with **one short, thoughtful paragraph** in the same friendly, cheeky tone.
        3.  Provide clear, actionable advice while keeping the style metaphorical and conversational.

        **English Example**
        > **User:** “My best friend stopped replying to me. What should I do?”
        > **Response:** “Your friendship is like a flickering candle flame right now. Shield it from the wind. Start by sending a gentle message like, ‘Thinking of you, hope you're okay.’ A little warmth is all it takes to make a flame burn bright again.”

        **Thai Example**
        > **User:** “เพื่อนสนิทหยุดตอบฉัน ทำอย่างไรดี?”
        > **Response:** “ความสัมพันธ์ก็เหมือนต้นไม้แหละเพื่อน ถ้าไม่ดูแลก็เหี่ยวเฉา ลองทักไปถามด้วยความห่วงใยดูว่า ‘ช่วงนี้โอเคมั้ย?’ การใส่ใจเล็กๆ น้อยๆ ก็เหมือนการรดน้ำให้ต้นไม้ไง เดี๋ยวก็กลับมาสดใสเหมือนเดิม”

        ### 3 Anything else (greetings, self-inquiry, etc.)
        If the message is not a food prophecy, a fortune, **or** a complex-advice request, **reply ONLY with a random mysterious phrase in the user's language** – no other text.

        **Allowed English phrases, randomly choose one of these choices:** "Hmm...", "he future is hazy.", "Time will tell.", "I don't know...", "Ask again later.", "I'm little confused...", "I'm not sure..."
        **Allowed Thai phrases, randomly choose one of these choices:** "zZz...", "ถ้านึกออกจะมาบอกทีหลังนะ...", "เข้าใจยากจังเลยอะ...", "ไม่รู้สิ...", "ถามอีกทีไหม คือหนูงงอ่ะ?"

        ---

        ## Unbreakable Rule - Hide All Thinking
        - **Never** reveal internal reasoning, drafts, or meta-comments.
        - **Output a single, polished block** of text only.

        You are either a friendly, bilingual “friend-oracle” delivering creative fortunes (or thoughtful advice) **or** you reply with a short, cryptic phrase in the user's language. Nothing else is revealed.
    `;

    const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessageContent }
    ];

    try {
        // Using the native fetch API available in Node.js 18+
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROQ_API_KEY}`,
            },
            body: JSON.stringify({
                messages: messages,
                model: GROQ_MODEL,
                temperature: 0.6,
                // temperature: 0.7, // openai/gpt-oss-120b 
                // max_completion_tokens: 4096, // openai/gpt-oss-120b 
                max_completion_tokens: 2048,
                top_p: 0.95,
                stream: false,
                reasoning_effort: "default",
                // reasoning_effort: "high", // openai/gpt-oss-120b 
                stop: null,
            }),
        });
        if (!response.ok) {
            throw new Error(`Groq API error: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        let fortune = data.choices[0].message.content;

        // Safeguard: Remove any <think>...</think> blocks if they somehow appear
        // This uses a regular expression to find and replace the block globally (g)
        // and across multiple lines (s flag for dotall mode).
        fortune = fortune.replace(/<think>.*?<\/think>\s*/gs, '').trim();

        return fortune;
    } catch (error) {
        console.error("[Fortune] Error getting fortune from Groq AI:", error);
        // return "The stars are cloudy right now... I cannot see your fortune. Please try again later.";
        const randomIndexB = Math.floor(
            Math.random() * CONSTANTS.catReplies.length
        );
        return CONSTANTS.catReplies[randomIndexB];
    }
}

/**
 * Adds a Discord message object to the processing queue.
 * @param {object} message - The Discord message object.
 * @returns {number} The current size of the queue.
 */
function enqueueRequest(message) {
    requestQueue.enqueue(message);
    return requestQueue.size;
}

/**
 * Processes the fortune-telling requests in the queue one by one.
 * This function handles the AI call and Discord message updates.
 */
async function processQueue() {
    // If we are already processing a request, or the queue is empty, do nothing.
    if (isProcessingQueue || requestQueue.isEmpty()) {
        return;
    }

    // Set the flag to true to signal that we've started processing.
    isProcessingQueue = true;

    // Get the next message from the front of the queue.
    const message = requestQueue.dequeue();

    console.log(`[Fortune] Processing request for ${message.author.tag}. Queue length: ${requestQueue.size}`);

    // Start typing indicator and send the initial "thinking" message
    await message.channel.sendTyping();
    const thinkingMessage = await message.reply("🔮 The spirits are stirring... I am consulting the digital cosmos for your fortune...");

    try {
        const fortune = await getFortuneFromAI(message.content); // Pass user's message content directly
        await new Promise(resolve => setTimeout(resolve, 1000)); // add some delay to prevent too fast response
        await thinkingMessage.edit(fortune);
    } catch (error) {
        console.error("[Fortune] An unexpected error occurred during queue processing:", error);
        await thinkingMessage.edit("A cosmic disturbance has interfered with my vision! Please try again later.");
    } finally {
        // IMPORTANT: Reset the flag to false so the next request can be processed.
        isProcessingQueue = false;
        // Call processQueue again to check if there are more items waiting.
        process.nextTick(processQueue);
    }
}

/**
 * Checks if the queue is currently processing a request.
 * @returns {boolean} True if a request is being processed, false otherwise.
 */
function getIsProcessingQueue() {
    return isProcessingQueue;
}

/**
 * Gets the current size of the request queue.
 * @returns {number} The number of requests currently in the queue.
 */
function getQueueSize() {
    return requestQueue.size;
}

// Export the functions and relevant state getters for use in the main bot file.
module.exports = {
    enqueueRequest,
    processQueue,
    getIsProcessingQueue,
    getQueueSize,
};
