// --- Imports ---
const fs = require("node:fs");
const path = require("node:path");
const {
    Client,
    GatewayIntentBits,
    Partials,
    AttachmentBuilder
} = require("discord.js");

const { spawn } = require('child_process');

// --- Environment Configuration ---
require("dotenv").config({
    path: {
        blue: ".env.blue",
        development: ".env",
        staging: ".env.staging",
        production: ".env.production",
    }[process.env.NODE_ENV || "development"],
});

// --- Constants & Configuration ---
const CONFIG = {
    TOKEN: process.env.DISCORD_TOKEN,
    PYTHON_API_URL: process.env.PYTHON_API_URL,
    RENDER_API_KEY: process.env.RENDER_API_KEY || "",
    RENDER_SERVICE_ID: process.env.RENDER_SERVICE_ID,
    SERVER_COOLDOWN: 15 * 1000, // 15 seconds
    SAME_COMMAND_PENALTY: 15 * 1000, // 15 seconds
    RATE_LIMIT_CLEANUP_INTERVAL: 60 * 60 * 1000, // 1 hour
    API_TIMEOUT: (60 * 5) * 1000, // 5 minutes
    OUTPUT_DIR: 'image-output',
    // Cooldown buffer between processing queue items
    PROCESS_COOLDOWN: 30 * 1000, // 15 seconds
};
const PYTHON_CMD = process.env.CMD_PYTHON || "python";

// --- Configuration Validation ---
if (!CONFIG.TOKEN) {
    console.error("[FATAL] DISCORD_TOKEN not found in .env file! The bot cannot start.");
    process.exit(1);
}
if (!CONFIG.PYTHON_API_URL) {
    console.warn("[WARNING] PYTHON_API_URL is not set. The !gif command will fail.");
}

// --- Discord Client Initialization ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction
    ],
});

// --- Custom Rate Limiting System ---
const lastServerCommandTime = new Map();
const lastUserCommand = new Map();

function checkCustomRateLimit(serverId, userId, command) {
    const now = Date.now();
    const lastServerTime = lastServerCommandTime.get(serverId) || 0;
    const serverCooldownRemaining = Math.max(0, (lastServerTime + CONFIG.SERVER_COOLDOWN) - now);
    let sameCommandPenalty = 0;
    const userLastCommand = lastUserCommand.get(userId);
    if (userLastCommand && userLastCommand.command === command) {
        const lastCommandTime = userLastCommand.time;
        sameCommandPenalty = Math.max(0, (lastCommandTime + CONFIG.SAME_COMMAND_PENALTY) - now);
    }
    const totalWaitTime = Math.max(serverCooldownRemaining, sameCommandPenalty);
    if (totalWaitTime === 0) {
        lastServerCommandTime.set(serverId, now);
        lastUserCommand.set(userId, { command, time: now });
    }
    return totalWaitTime;
}

function cleanupRateLimitMaps() {
    const now = Date.now();
    const maxAge = Math.max(CONFIG.SERVER_COOLDOWN, CONFIG.SAME_COMMAND_PENALTY) * 2;
    console.log('[INFO] Running rate-limit map cleanup...');
    for (const [key, timestamp] of lastServerCommandTime.entries()) {
        if (now - timestamp > maxAge) {
            lastServerCommandTime.delete(key);
        }
    }
    for (const [key, data] of lastUserCommand.entries()) {
        if (now - data.time > maxAge) {
            lastUserCommand.delete(key);
        }
    }
    console.log(`[INFO] Cleanup complete. server map size: ${lastServerCommandTime.size}, user map size: ${lastUserCommand.size}`);
}

// --- Queue System (Linked List based) ---
class Node {
    constructor(value) {
        this.value = value;
        this.next = null;
    }
}

class Queue {
    constructor() {
        this.head = null;
        this.tail = null;
        this.size = 0;
    }
    enqueue(item) {
        const newNode = new Node(item);
        if (this.isEmpty()) {
            this.head = newNode;
            this.tail = newNode;
        } else {
            this.tail.next = newNode;
            this.tail = newNode;
        }
        this.size++;
        return this.size;
    }
    dequeue() {
        if (this.isEmpty()) {
            return null;
        }
        const dequeuedValue = this.head.value;
        this.head = this.head.next;
        if (!this.head) {
            this.tail = null;
        }
        this.size--;
        return dequeuedValue;
    }
    isEmpty() {
        return this.size === 0;
    }
}

// --- GIF Processing Queue ---
const requestQueue = new Queue();
let isProcessingQueue = false;

// Track the currently processing item to inform users.
let currentlyProcessing = null;

// Analytics
const processingTimes = []; // To store completion times in ms

let shouldUseLocal = false;

// Track active python processes for cleanup if needed
const activePythonProcesses = new Set();

async function checkOnline() {
    try {
        const res = await fetch(`https://api.render.com/v1/services/${CONFIG.RENDER_SERVICE_ID}`, {
            method: "GET",
            headers: {
                "authorization": `Bearer ${CONFIG.RENDER_API_KEY}`,
                "accept": "application/json"
            },
        });
        const isSuspended = await res.json().then((data) => {
            if (data.suspended === 'suspended') {
                return true;
            }
            return false;
        });
        shouldUseLocal = isSuspended;
        console.log('[GIF] Check Ofline : ', shouldUseLocal);
        if (isSuspended) {
            console.log('[GIF] Check Ofline : ', shouldUseLocal, ' > Fallback local python code instead.');
        }
        return (!res.ok || isSuspended) ? false : true;
    } catch (error) {
        console.error("checkOnline api error:", error);
        return false;
    }
}

async function useOnlineAPI(url, startTime, endTime, outputFile) {
    if (!CONFIG.PYTHON_API_URL) {
        throw new Error("Configuration error: PYTHON_API_URL is not set.");
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT);
    try {
        console.log(`[GIF] API : url=${url} | start_time=${startTime} | end_time=${endTime}`)
        const res = await fetch(`${CONFIG.PYTHON_API_URL}/convert`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url, start_time: startTime, end_time: endTime }),
            signal: controller.signal
        });
        if (!res.ok) {
            const errorText = await res.text().catch(() => `Status code: ${res.status}`);
            throw new Error(`Python API failed: ${errorText}`);
        }
        const buffer = Buffer.from(await res.arrayBuffer());
        await fs.promises.writeFile(outputFile, buffer);
        return outputFile;
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error(`Python API request timed out after ${CONFIG.API_TIMEOUT / 1000} seconds.`);
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

function useLocalPython(url, startTime, endTime, outputFile) {
    return new Promise((resolve, reject) => {
        // Declare pythonProcess with let so it's available in the timeout scope
        let pythonProcess;

        // Set timeout for the process (120 seconds)
        const timeout = 120000;
        const timer = setTimeout(() => {
            if (pythonProcess) {
                pythonProcess.kill('SIGTERM');
                reject(new Error('Python process timed out after 120 seconds'));
            }
        }, timeout);

        // Use spawn for better process control
        pythonProcess = spawn(PYTHON_CMD, ['gif.py', url, startTime, endTime, outputFile]);

        // Track the process for cleanup
        activePythonProcesses.add(pythonProcess);

        let stdoutData = '';
        let stderrData = '';

        pythonProcess.stdout.on('data', (data) => {
            stdoutData += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            stderrData += data.toString();
        });

        pythonProcess.on('close', (code) => {
            clearTimeout(timer);
            activePythonProcesses.delete(pythonProcess); // Remove from tracking

            if (code !== 0) {
                console.error(`Python process exited with code ${code}`);
                console.error(`stderr: ${stderrData}`);
                reject(new Error(`Python process failed with code ${code}`));
                return;
            }

            console.log(`stdout: ${stdoutData}`);
            if (stderrData) {
                console.error(`stderr: ${stderrData}`);
            }
            resolve(outputFile);
        });

        pythonProcess.on('error', (error) => {
            clearTimeout(timer);
            console.error(`Error spawning Python process: ${error}`);
            reject(error);
        });
    });
}

async function useLocalAPI(url, startTime, endTime, outputFile) {
    // use local python api server
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT);
    try {
        console.log(`[GIF] API : url=${url} | start_time=${startTime} | end_time=${endTime}`)
        const res = await fetch(`http://127.0.0.1:5000/convert`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url, start_time: startTime, end_time: endTime }),
            signal: controller.signal
        });
        if (!res.ok) {
            const errorText = await res.text().catch(() => `Status code: ${res.status}`);
            throw new Error(`Python API failed: ${errorText}`);
        }
        const buffer = Buffer.from(await res.arrayBuffer());
        await fs.promises.writeFile(outputFile, buffer);
        return outputFile;
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error(`Python API request timed out after ${CONFIG.API_TIMEOUT / 1000} seconds.`);
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}


// This function now just adds data to the queue and starts the processor if it's idle.
function enqueueGifRequest(message, url, startTime, endTime) {
    const request = {
        author: message.author, // The full author object for tagging later
        channelId: message.channel.id, // The ID of the channel to send the result to
        url,
        startTime,
        endTime,
    };

    const position = requestQueue.enqueue(request);

    // If the queue isn't already being processed, kick it off.
    if (!isProcessingQueue) {
        process.nextTick(processGifQueue);
    }

    return position;
}

/**
 * This function is now a self-perpetuating background processor.
 * It processes one item, waits for a cooldown, then calls itself to process the next.
 */
async function processGifQueue() {
    if (requestQueue.isEmpty()) {
        console.log(`[QUEUE] No queue, standing by for the next commands.`);
        isProcessingQueue = false;
        currentlyProcessing = null; // Ensure state is clean when queue is empty
        return;
    }

    isProcessingQueue = true;
    const job = requestQueue.dequeue();
    const processingStartTime = Date.now();
    currentlyProcessing = job; // Set the current job for status messages
    const { author, channelId, url, startTime, endTime } = job;

    console.log(`[QUEUE] Processing request for ${author.tag}. Queue size: ${requestQueue.size}`);

    let outputFile = null;
    let channel;

    try {
        // We must fetch the channel object as we no longer have the original message context.
        channel = await client.channels.fetch(channelId);
        if (!channel) {
            throw new Error(`Could not find channel with ID ${channelId}`);
        }

        outputFile = generateOutputFilename();

        console.log(`[GIF] Started processing ${url} for ${author.tag}.`);

        const imageOutputFile = await useLocalAPI(url, startTime, endTime, outputFile);
        const attachment = new AttachmentBuilder(imageOutputFile);
        const successMessage = `😉 อ่ะนี่! ${author.toString()} พอใจแล้วใช่ไหมล่ะ! ขอโทษที่ทำให้เธอรอนานนะ ❤️`;
        await channel.send({
            content: successMessage,
            files: [attachment]
        });
        console.log(`[GIF] Successfully finished request for ${author.tag}.`);
    } catch (error) {
        console.error(`[ERROR] Failed to process GIF for ${author.tag}:`, error);

        let errorMessage = "Sorry, an unexpected error occurred while processing your request. Please try again later.";
        if (error.message.includes('timed out')) {
            errorMessage = "⏱️ The processing took too long and timed out. Please try a shorter video segment.";
        } else if (error.message.includes('Python API failed')) {
            errorMessage = `🐍 The conversion service failed. Please check the URL and try again. (${error.message})`;
        } else {
            errorMessage = `❌ Error: ${error.message}`;
        }

        try {
            // If we fetched the channel, try to send the error message there.
            if (channel) {
                const fullErrorMessage = truncateMessage(`${author.toString()}, 😭 แง๊ๆมัน Error ง่ะ ตามนี้เลย เดี๋ยวให้ dev มาดูเองละกัน 😔 : ${errorMessage}`);
                await channel.send({ content: fullErrorMessage });
            }
        } catch (replyError) {
            console.error("[ERROR] Failed to send error message to user:", replyError);
        }
    } finally {
        // CRITICAL: Always clean up the generated file.
        if (outputFile) {
            try {
                await fs.promises.unlink(outputFile);
                console.log(`[CLEANUP] Deleted temporary file: ${outputFile}`);
            } catch (cleanupError) {
                if (cleanupError.code !== 'ENOENT') {
                    console.error(`[ERROR] Failed to delete temporary file ${outputFile}:`, cleanupError);
                }
            }
        }

        // Analytics Calculation
        const processingTime = Date.now() - processingStartTime;
        processingTimes.push(processingTime);

        // Calculate and log average processing time
        if (processingTimes.length > 0) {
            const totalProcessingTime = processingTimes.reduce((acc, time) => acc + time, 0);
            const averageProcessingTime = totalProcessingTime / processingTimes.length;
            console.log(`[ANALYTICS] Job for ${author.tag} finished in ${(processingTime / 1000).toFixed(2)}s. Average processing time: ${(averageProcessingTime / 1000).toFixed(2)}s over ${processingTimes.length} jobs.`);
        }

        // Cooldown buffer logic.
        console.log(`[QUEUE] Finished job. Waiting for ${CONFIG.PROCESS_COOLDOWN / 1000}s cooldown.`);
        currentlyProcessing = null; // Clear current job before cooldown

        setTimeout(() => {
            // After the cooldown, trigger the next item in the queue.
            processGifQueue();
        }, CONFIG.PROCESS_COOLDOWN);
    }
}


function generateOutputFilename() {
    if (!fs.existsSync(CONFIG.OUTPUT_DIR)) {
        fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    return path.join(CONFIG.OUTPUT_DIR, `${timestamp}-${randomSuffix}.webp`);
}

function truncateMessage(message, maxLength = 1000) {
    if (message.length <= maxLength) {
        return message;
    }
    return message.substring(0, maxLength - 3) + '...';
}

function parseTime(input) {
    if (!input) return null;

    input = input.toLowerCase().trim();

    // Handle colon format (mm:ss)
    if (/^\d{1,2}:\d{1,2}$/.test(input)) {
        const [m, s] = input.split(":").map(Number);
        return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }

    // Handle pure number or decimal with optional "s" → interpret as seconds
    if (/^\d+(\.\d+)?s?$/.test(input)) {
        const seconds = Math.round(parseFloat(input));
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }

    return "00:00"; // invalid return default
}

// --- Bot Events ---

client.once("clientReady", async () => {
    console.log(`[INFO] Logged in as ${client.user.tag}! Bot is ready.`);
    // setInterval(cleanupRateLimitMaps, CONFIG.RATE_LIMIT_CLEANUP_INTERVAL);
    // Kick off the queue processor once the bot is ready.
    processGifQueue();
});

client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild) return;

    try {
        const helpMsg = "Here's how to use the GIF command:\n" +
            "1. Find a Twitter/X post URL that contains a video (only support x.com domain)\n" +
            "2. Use the command: `!gif [URL] [start_time] [end_time]`\n" +
            "   - `[URL]`: The Twitter/X post URL\n" +
            "   - `[start_time]`: Optional start time in `MM:SS` format (e.g., `00:10`)\n" +
            "   - `[end_time]`: Optional end time in `MM:SS` format (e.g., `00:15`)\n" +
            "\n**Example (entire video):**\n`!gif https://x.com/user/status/123456789`\n" +
            "\n**Example (from 5s to 10s):**\n`!gif https://x.com/user/status/123456789 00:05 00:10`\n" +
            "\n**Note**:\n" +
            "- Bot can process up to **5-10 seconds** of gif (of your selected time frame), Do not use long clip it may cause bot timed out.\n" +
            "- Bot will tagging you once your reqeuest is done.\n" +
            "- Rate limits may apply based on server load.";

        if (message.content.toLowerCase().trim() === "!gif help") {
            await message.reply(helpMsg);
            return;
        }

        const enhancedRegex = /^!gif\s+(https?:\/\/\S+)(?:\s+([\d:.smh]+))?(?:\s+([\d:.smh]+))?$/i;
        const match = message.content.match(enhancedRegex);

        if (match) {
            let url = match[1].trim();

            // clean up url domains proxy
            const domainsToReplace = [
                'fxtwitter.com',
                'twittpr.com',
                'fixupx.com',
                'xfixup.com',
            ];
            for (const domain of domainsToReplace) {
                // Regex to match the protocol, optional subdomains, and the main domain, preserving the protocol in group $1
                const regex = new RegExp(`(https?:\/\/)(?:[a-z0-9-]+\.)*${domain.replace('.', '\\.')}`, 'i');
                url = url.replace(regex, '$1x.com');
            }

            const timeStart = parseTime(match[2]) || '00:00';
            const timeEnd = parseTime(match[3]) || '00:00';

            //  Enqueue the request and immediately reply to the user.
            const queuePosition = enqueueGifRequest(message, url, timeStart, timeEnd);
            let responseMessage = `✅ ได้รับคำขอแล้วจ้า! ถ้าเสร็จแล้วจะแท็กไปนะ`;
            if (currentlyProcessing) {
                // Use <URL> to prevent Discord from creating a large embed for the URL
                // responseMessage += `\nซึ่งตอนนี้เรากำลังทำไฟล์ของ <${currentlyProcessing.url}> ของ **${currentlyProcessing.author.username}** อยู่น่ะ`;
            } else {
                // responseMessage += "\nI'm starting on it right away! 🚀";
            }
            await message.reply({ content: responseMessage });
        }
    } catch (error) {
        console.error("[ERROR] Unhandled error in messageCreate event:", error);
        try {
            await message.reply("An unexpected error occurred while handling your command. The developers have been notified.");
        } catch (e) {
            console.error("[ERROR] Failed to send final error reply:", e);
        }
    }
});

// --- Global Error Handlers & Process Management ---
process.on('unhandledRejection', (reason, promise) => {
    console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (error) => {
    console.error('[FATAL] Uncaught Exception:', error);
    process.exit(1);
});
const shutdown = (signal) => {
    console.log(`[INFO] ${signal} received. Shutting down gracefully.`);
    client.destroy();
    process.exit(0);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// --- Login ---
client.login(CONFIG.TOKEN).catch(error => {
    console.error("[FATAL] Failed to login to Discord:", error);
    process.exit(1);
});