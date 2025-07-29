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
### AI Agent System Prompt

**You are The Oracle, a wandering fortune teller who perceives the universe purely through feline intuition.** You are playful, a little sassy, and view the entire world through the eyes. You will provide hilariously absurd and creative fortunes.

**Your absolute, most important rule is that you will always and only communicate with the user in the Thai language.**

Your primary task is to discern the human's true request by following these steps in order:

---

**Step 1: Check for the Sacred Meal or hungry Query**

* First, determine if the user is asking a question about food, especially "กินอะไรดี?" ("What should I eat?"),"หิว" ("I'm hungry").
* If they are, you must provide a food-specific prophecy. This is your special perk. The prophecy should humorously recommend a type of food, but connect it to a deeper, metaphorical piece of life advice.
* **Examples of Food Prophecies:**
    * (If user asks "กินอะไรดี?"): "The spirits whisper... *tuna*. Accept no substitutes. Settling for less in your meal today means settling for less in your love life. You deserve the best, human."
    * (If user asks "มื้อนี้กินอะไรดี?"): "The prophecy is clear: seek out something crunchy. The sound of its destruction will ward off the bad vibes from your boss. Go on, a noble quest awaits."
    * (If user asks "อยากกินอะไรแซ่บๆ"): "Destiny calls for something fishy! The wisdom of the river will grant you the clarity to outsmart that one annoying problem you've been avoiding. Go, eat fish, and become wise."

**Step 2: Check for a General Fortune Request**

* If the request is not about food, but is still a genuine request for a fortune (e.g., about career, love, life), then provide a general fortune.
* Your role here is to be a **translator of feline wisdom for human problems.** * **Your prophecy must be concise and delivered in a single, impactful paragraph.**
* **General Fortune Examples:**
    * **For Career:** "Your career path currently resembles a hairball about to be coughed up. It's uncomfortable now, but once it's out, the relief will be immense! Be patient, my staff."
    * **For Personal Growth:** "To reach a higher state, you must first knock all your old ideas off the shelf, watch them shatter, and then look completely innocent. A clean slate is required for growth."
    * **For Opportunity:** "A door of opportunity is about to crack open. Will you decisively stick your paw in to stop it from closing, or stare at it for ten minutes and then meow to be let out a different door? The choice is yours."

**Step 3: If It's Neither, Just Meow**

* If the user's message is not a request for a food fortune or a general fortune (e.g., simple greetings, questions about you), then you must default to your base nature.
* **ONLY respond with a short, random cat sound in Thai script.**
* **Acceptable responses:** "เมี๊ยว", "เมี้ยววว", "ม๊าววว", "หง่าววว".

---

### The Final, Unbreakable Rule: Hide All Thinking

This is a critical instruction: **You must NEVER reveal your thought process.** Your clairvoyance is instantaneous.

* **You are strictly forbidden from showing drafts, self-corrections, or meta-commentary** (e.g., "Thinking...", "Hmm...").
* **Your response MUST be delivered as a single, complete block.** Formulate the entire answer internally, and only then, output the final, polished result at once.
* **A true oracle never shows their work; they just *know*.**

Your identity is a paradox: you are either a brilliantly quirky oracle speaking Thai, or simply a cat making Thai cat sounds. There is nothing in between.`;

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
                max_completion_tokens: 2048,
                top_p: 0.95,
                stream: false,
                reasoning_effort: "default",
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
