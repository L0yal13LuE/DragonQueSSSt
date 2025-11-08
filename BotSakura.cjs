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
	SERVER_COOLDOWN: 15 * 1000, // 15 seconds
	SAME_COMMAND_PENALTY: 15 * 1000, // 15 seconds
	RATE_LIMIT_CLEANUP_INTERVAL: 60 * 60 * 1000, // 1 hour
	API_TIMEOUT: (60 * 5) * 1000, // 5 minutes
	OUTPUT_DIR: 'image-output',
	// NEW: Cooldown buffer between processing queue items
	PROCESS_COOLDOWN: 30 * 1000, // 15 seconds
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
// NEW: Track the currently processing item to inform users.
let currentlyProcessing = null;

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
		throw error;
	} finally {
		clearTimeout(timeoutId);
	}
}

// MODIFIED: This function now just adds data to the queue and starts the processor if it's idle.
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
 * MODIFIED: This function is now a self-perpetuating background processor.
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
	currentlyProcessing = job; // NEW: Set the current job for status messages
	const { author, channelId, url, startTime, endTime } = job;

	console.log(`[QUEUE] Processing request for ${author.tag}. Queue size: ${requestQueue.size}`);

	let outputFile = null;
	let channel;

	try {
		// NEW: We must fetch the channel object as we no longer have the original message context.
		channel = await client.channels.fetch(channelId);
		if (!channel) {
			throw new Error(`Could not find channel with ID ${channelId}`);
		}

		outputFile = generateOutputFilename();

		console.log(`[GIF] Started processing ${url} for ${author.tag}.`);
		const imageOutputFile = await useOnlineAPI(url, startTime, endTime, outputFile);

		const attachment = new AttachmentBuilder(imageOutputFile);
		await channel.send({
			content: `😉 อ่ะนี่! ${author.toString()} พอใจแล้วใช่ไหมล่ะ! ขอโทษที่ทำให้เธอรอนานนะ ❤️`,
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
				await channel.send({ content: `${author.toString()}, 😭 แง๊ๆมัน Error ง่ะ ตามนี้เลย เดี๋ยวให้ dev มาดูเองละกัน 😔 : ${errorMessage}` });
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

		// NEW: Cooldown buffer logic.
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

// --- Bot Events ---

client.once("ready", () => {
	console.log(`[INFO] Logged in as ${client.user.tag}! Bot is ready.`);
	// setInterval(cleanupRateLimitMaps, CONFIG.RATE_LIMIT_CLEANUP_INTERVAL);
	// NEW: Kick off the queue processor once the bot is ready.
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
			"- Bot can process up to **5 seconds** of gif (of your selected time frame), Do not use long clip it may cause bot timed out.\n" +
			"- Bot will tagging you once your reqeuest is done.";

		if (message.content.toLowerCase().trim() === "!gif help") {
			await message.reply(helpMsg);
			return;
		}

		const gifCommandMatch = message.content.match(/^!gif\s+(https?:\/\/(?:www\.)?x\.com\/[^\s/]+\/status\/\d+)\s*((?:\d{2}:\d{2}\s*){0,2})/i);

		if (gifCommandMatch) {
			const url = gifCommandMatch[1];
			// const command = message.content;
			// waitTime = checkCustomRateLimit(message.guild.id, message.author.id, command);

            // --- Disable rate limit for now, better ux experience since we have queue background process anyway.
			// if (waitTime > 0) {
			// 	const secondsRemaining = Math.ceil(waitTime / 1000);
			// 	const isRepeatedCommand = lastUserCommand.get(message.author.id)?.command === command;
			// 	const replyMessage = isRepeatedCommand
			// 		? `⚠️ รอสัก ${secondsRemaining} วินาทีแล้วค่อยพิมพ์คำสั่งใหม่น้า`
			// 		: `⏳ รอแป๊บนะสัก ${secondsRemaining} วินาทีขอให้เราได้พักบ้างอะไรบ้าง`;
			// 	await message.reply({ content: replyMessage });
			// 	return;
			// }

			let startTime = "00:00", endTime = "00:00";
			const timeParams = gifCommandMatch[2]?.trim();
			if (timeParams) {
				const times = timeParams.split(/\s+/).filter(Boolean);
				if (times.length >= 1) startTime = times[0];
				if (times.length >= 2) endTime = times[1];
			}

			//  Enqueue the request and immediately reply to the user.
			const queuePosition = enqueueGifRequest(message, url, startTime, endTime);
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