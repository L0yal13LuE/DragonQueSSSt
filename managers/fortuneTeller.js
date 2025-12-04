// fortuneTeller.js
const AGENT = require('./agent/0-Shiro');
const AGENT_B = require('./agent/1-Assistant');
const MCP_EXA = require('./agent/MCP-Exa');
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
    // const thinkingMessage = await message.reply("🔮 The spirits are stirring... I am consulting the digital cosmos for your fortune...");

    try {
        const userContxt = message.content;
        const getTrustAI = CONSTANTS.GET_CHANCE(100);

        if (getTrustAI) {
            console.log('[Fortune] Using Trust Agent', true);
            const mcpContext = await MCP_EXA.callAPI(userContxt);
            const responseAiResult = await AGENT_B.callAPI(mcpContext, userContxt);
            if (responseAiResult.indexOf('[callAgentTrustSource] Failed') !== -1) {
                console.log('[Fortune] Using Trust Agent : Fail -> Using Groq backup call');
                const backupResponseCall = await AGENT.callAPI(userContxt);
                await message.reply(backupResponseCall);
            } else {
                await message.reply(responseAiResult);
            }
        } else {
            console.log('[Fortune] GROQ');
            const fortune = await AGENT.callAPI(userContxt); // Pass user's message content directly
            await new Promise(resolve => setTimeout(resolve, 500)); // add some delay to prevent too fast response
            await message.reply(fortune);
            // await thinkingMessage.edit(fortune);
        }
    } catch (error) {
        console.error("[Fortune] An unexpected error occurred during queue processing:", error);
        await message.reply("A cosmic disturbance has interfered with my vision! Please try again later.");
        // await thinkingMessage.edit(fortune);
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
