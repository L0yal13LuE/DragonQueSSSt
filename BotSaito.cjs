// --- Imports ---
const fs = require("node:fs");
const path = require("node:path");
const {
	Client,
	GatewayIntentBits,
	Partials,
	AttachmentBuilder
} = require("discord.js");

// --- Environment Configuration ---
// Load environment variables based on the NODE_ENV
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
	RENDER_API_KEY: process.env.RENDER_API_KEY,
	RENDER_SERVICE_ID: process.env.RENDER_SERVICE_ID,
	SERVER_COOLDOWN: 60 * 1000, // 60 seconds
	SAME_COMMAND_PENALTY: 60 * 1000, // 60 seconds
	RATE_LIMIT_CLEANUP_INTERVAL: 60 * 60 * 1000, // 1 hour
	API_TIMEOUT: 300 * 1000, // 5 minutes
	OUTPUT_DIR: 'image-output'
};

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
const lastServerCommandTime = new Map(); // Tracks last command time per server
const lastUserCommand = new Map();      // Tracks last command content per user

/**
 * Checks if a command from a user in a server is rate-limited.
 * @param {string} serverId The ID of the server where the command was issued.
 * @param {string} userId The ID of the user who issued the command.
 * @param {string} command The full content of the command.
 * @returns {number} The total wait time in milliseconds required before the command can be executed. Returns 0 if allowed.
 */
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

/**
 * Periodically cleans up old entries from rate-limiting maps to prevent memory leaks.
 */
function cleanupRateLimitMaps() {
	const now = Date.now();
	const maxAge = Math.max(CONFIG.SERVER_COOLDOWN, CONFIG.SAME_COMMAND_PENALTY) * 2; // Keep entries for 2x the longest cooldown

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

/**
 * Makes a request to the online Python API to convert a video to a WebP file.
 * @param {string} url The URL of the video to process.
 * @param {string} startTime The start time in MM:SS format.
 * @param {string} endTime The end time in MM:SS format.
 * @param {string} outputFile The local path to save the resulting file.
 * @returns {Promise<string>} A promise that resolves with the output file path on success.
 * @throws {Error} Throws an error if the API request fails, times out, or returns a non-OK status.
 */
async function useOnlineAPI(url, startTime, endTime, outputFile) {
	if (!CONFIG.PYTHON_API_URL) {
		throw new Error("Configuration error: PYTHON_API_URL is not set.");
	}

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT);

	try {
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
		// Re-throw other errors (network, parsing, etc.)
		throw error;
	} finally {
		clearTimeout(timeoutId);
	}
}

/**
 * Adds a GIF request to the processing queue.
 * @param {import('discord.js').Message} message The original Discord message object.
 * @param {string} url The URL to process.
 * @param {string} startTime The start time for the GIF.
 * @param {string} endTime The end time for the GIF.
 * @returns {number} The new size of the queue.
 */
function enqueueGifRequest(message, url, startTime, endTime) {
	requestQueue.enqueue({ message, url, startTime, endTime });
	return requestQueue.size;
}

/**
 * Processes the GIF request queue one item at a time.
 * This function is self-perpetuating via process.nextTick.
 */
async function processGifQueue() {
	if (isProcessingQueue || requestQueue.isEmpty()) {
		return;
	}

	isProcessingQueue = true;
	const request = requestQueue.dequeue();
	const { message, url, startTime, endTime } = request;

	console.log(`[QUEUE] Processing request for ${message.author.tag}. Queue size: ${requestQueue.size}`);

	let initialReply = null;
	let outputFile = null;

	try {
		await message.channel.sendTyping();
		initialReply = await message.reply({ content: `Please wait... 😜` });
		outputFile = generateOutputFilename();

		console.log(`[GIF] Started processing ${url} for ${message.author.tag}.`);

		const imageOutputFile = await useOnlineAPI(url, startTime, endTime, outputFile);

		const attachment = new AttachmentBuilder(imageOutputFile);
		await message.channel.send({
			content: `😉 Here's your GIF, ${message.author.toString()}!`,
			files: [attachment]
		});

		await initialReply.edit({ content: `✅ Successfully processed your GIF! If you like my work, give me some ❤️` });
		console.log(`[GIF] Successfully finished request for ${message.author.tag}.`);

	} catch (error) {
		console.error(`[ERROR] Failed to process GIF for ${message.author.tag}:`, error);

		let errorMessage = "Sorry, an unexpected error occurred. Please try again later.";
		if (error.message.includes('timed out')) {
			errorMessage = "⏱️ The processing took too long and timed out. Please try a shorter video segment.";
		} else if (error.message.includes('Python API failed')) {
			errorMessage = `🐍 The conversion service failed. Please check the URL and try again. (${error.message})`;
		} else if (error.message.includes('ENOENT')) {
			errorMessage = "🔧 A required system component is missing. Please contact an administrator.";
		} else {
			errorMessage = `❌ Error: ${error.message}`;
		}

		try {
			const replyTarget = initialReply || message;
			const editOrReply = initialReply ? 'edit' : 'reply';
			await replyTarget[editOrReply]({ content: errorMessage });
		} catch (replyError) {
			console.error("[ERROR] Failed to send error message to user:", replyError);
		}
	} finally {
		// CRITICAL: Always clean up the generated file to prevent disk space exhaustion.
		if (outputFile) {
			try {
				await fs.promises.unlink(outputFile);
				console.log(`[CLEANUP] Deleted temporary file: ${outputFile}`);
			} catch (cleanupError) {
				// This can happen if the file was never created due to an early error.
				if (cleanupError.code !== 'ENOENT') {
					console.error(`[ERROR] Failed to delete temporary file ${outputFile}:`, cleanupError);
				}
			}
		}

		// Reset flag and trigger the next item in the queue.
		isProcessingQueue = false;
		if (!requestQueue.isEmpty()) {
			process.nextTick(processGifQueue);
		}
	}
}

/**
 * Generates a unique filename for the output WebP file.
 * @returns {string} The full path for the new file.
 */
function generateOutputFilename() {
	if (!fs.existsSync(CONFIG.OUTPUT_DIR)) {
		fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
	}
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	const randomSuffix = Math.random().toString(36).substring(2, 8);
	return path.join(CONFIG.OUTPUT_DIR, `${timestamp}-${randomSuffix}.webp`);
}

// --- Bot Events ---

client.once("ready", () => {
	console.log(`[INFO] Logged in as ${client.user.tag}! Bot is ready.`);
	// Start the periodic cleanup of rate-limiting maps
	setInterval(cleanupRateLimitMaps, CONFIG.RATE_LIMIT_CLEANUP_INTERVAL);
});

client.on("messageCreate", async (message) => {
	if (message.author.bot || !message.guild) return; // Ignore bots and DMs

	try {
		// --- !gif help command ---
		const helpMsg = "Here's how to use the GIF command:\n" +
			"1. Find a Twitter/X post URL that contains a video (only support x.com domain)\n" +
			"2. Use the command: `!gif [URL] [start_time] [end_time]`\n" +
			"   - `[URL]`: The Twitter/X post URL\n" +
			"   - `[start_time]`: Optional start time in `MM:SS` format (e.g., `00:10`)\n" +
			"   - `[end_time]`: Optional end time in `MM:SS` format (e.g., `00:15`)\n" +
			"\n**Example (entire video):**\n`!gif https://x.com/user/status/123456789`\n" +
			"\n**Example (from 5s to 10s):**\n`!gif https://x.com/user/status/123456789 00:05 00:10`\n" +
			"\n**Note**:\n" +
			"- The bot can process up to **5 seconds** of video. Longer requests may time out.\n" +
			"- There is a **60-second cooldown** per server and per user for repeated commands.";

		if (message.content.toLowerCase().trim() === "!gif help") {
			await message.reply(helpMsg);
			return;
		}

		// --- !gif main command ---
		// Regex to capture URL and optional time parameters
		const gifCommandMatch = message.content.match(/^!gif\s+(https?:\/\/(?:www\.)?x\.com\/[^\s/]+\/status\/\d+)\s*((?:\d{2}:\d{2}\s*){0,2})/i);

		if (gifCommandMatch) {
			// NOTE: The original code had logic to check for server boosters.
			// This could be used to grant perks like a shorter cooldown or priority queue access.
			// Example: const isPremium = message.member?.premiumSince;

			const url = gifCommandMatch[1];
			const command = message.content; // The full command for rate-limiting

			const waitTime = checkCustomRateLimit(message.guild.id, message.author.id, command);

			if (waitTime > 0) {
				const secondsRemaining = Math.ceil(waitTime / 1000);
				const isRepeatedCommand = lastUserCommand.get(message.author.id)?.command === command;
				const replyMessage = isRepeatedCommand
					? `⚠️ You just sent the same command! Please wait ${secondsRemaining}s.`
					: `⏳ Server is busy. Please wait ${secondsRemaining}s before sending another command.`;
				await message.reply({ content: replyMessage });
				return;
			}

			// Extract time parameters if present
			let startTime = "00:00", endTime = "00:00";
			const timeParams = gifCommandMatch[2]?.trim();
			if (timeParams) {
				const times = timeParams.split(/\s+/).filter(Boolean); // filter(Boolean) removes empty strings
				if (times.length >= 1) startTime = times[0];
				if (times.length >= 2) endTime = times[1];
			}

			// Add the request to the queue
			const queuePosition = enqueueGifRequest(message, url, startTime, endTime);

			if (isProcessingQueue) {
				await message.reply({ content: `⏳ Your request has been added to the queue at position #${queuePosition}. I'll get to it shortly!` });
			} else {
				// Start processing immediately if the queue was empty
				processGifQueue();
			}
		}
	} catch (error) {
		console.error("[ERROR] Unhandled error in messageCreate event:", error);
		// Optionally send a generic error message to the user
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
	// It's often recommended to exit after an uncaught exception,
	// as the application state might be corrupted.
	process.exit(1);
});

const shutdown = (signal) => {
	console.log(`[INFO] ${signal} received. Shutting down gracefully.`);
	client.destroy(); // Close Discord connection
	// In a real-world scenario, you might want to wait for pending operations to finish
	process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));


// --- Login ---
client.login(CONFIG.TOKEN).catch(error => {
	console.error("[FATAL] Failed to login to Discord:", error);
	process.exit(1);
});