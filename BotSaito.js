require("dotenv").config({
	path: {
		blue: ".env.blue",
		development: ".env",
		staging: ".env.staging",
		production: ".env.production",
	}[process.env.NODE_ENV || "development"],
});

// Custom Rate Limiting System
const lastServerCommandTime = new Map(); // Tracks last command time per server
const lastUserCommand = new Map();      // Tracks last command content per user
const SERVER_COOLDOWN = 10000;          // 10 seconds between server commands
const SAME_COMMAND_PENALTY = 60000;      // Additional 60 seconds for repeated commands

/**
 * Custom server rate limiting function
 * @param {string} serverId - The server ID
 * @param {string} userId - The user ID
 * @param {string} command - The command being executed
 * @returns {number} Time remaining until next allowed command (0 if allowed)
 */
function checkCustomRateLimit(serverId, userId, command) {
	const now = Date.now();

	// Check server cooldown (10 seconds between commands)
	const lastServerTime = lastServerCommandTime.get(serverId) || 0;
	const serverCooldownRemaining = Math.max(0, (lastServerTime + SERVER_COOLDOWN) - now);

	// Check for repeated commands (60 second penalty)
	let sameCommandPenalty = 0;
	const userLastCommand = lastUserCommand.get(userId);

	if (userLastCommand && userLastCommand.command === command) {
		const lastCommandTime = userLastCommand.time;
		sameCommandPenalty = Math.max(0, (lastCommandTime + SAME_COMMAND_PENALTY) - now);
	}

	// Calculate total wait time needed
	const totalWaitTime = Math.max(serverCooldownRemaining, sameCommandPenalty);

	// Update tracking if command is allowed
	if (totalWaitTime === 0) {
		lastServerCommandTime.set(serverId, now);
		lastUserCommand.set(userId, { command, time: now });
	}

	return totalWaitTime;
}

const {
	Client,
	GatewayIntentBits,
	Partials,
	AttachmentBuilder
} = require("discord.js");
const { spawn } = require('child_process');

// --- Custom Queue Implementation (Linked List based) ---
class Node {
	constructor(value) {
		this.value = value; // The data stored in this node (e.g., message and parameters)
		this.next = null;   // Pointer to the next node in the queue
	}
}

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
const requestQueue = new Queue();
let isProcessingQueue = false;

// Maximum number of concurrent Python processes allowed
const MAX_CONCURRENT_PROCESSES = 1; // Changed to 1 to enforce one-at-a-time processing

// Track active Python processes for cleanup
const activePythonProcesses = new Set();

function executePythonCommand(url, startTime, endTime, outputFile) {
	return new Promise((resolve, reject) => {
		// Declare pythonProcess with let so it's available in the timeout scope
		let pythonProcess;

		// Set timeout for the process (30 seconds)
		const timeout = 30000;
		const timer = setTimeout(() => {
			if (pythonProcess) {
				pythonProcess.kill('SIGTERM');
				reject(new Error('Python process timed out after 30 seconds'));
			}
		}, timeout);

		// Use spawn for better process control
		pythonProcess = spawn('python', ['gif.py', url, startTime, endTime, outputFile]);

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

// --- Configuration ---
const TOKEN = process.env.DISCORD_TOKEN;

// --- Configuration Validation ---
if (!TOKEN) {
	console.error("FATAL ERROR: DISCORD_TOKEN not found in .env file!");
	process.exit(1);
}

// --- Initialize Discord Client ---
const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
	],
	partials: [
		Partials.Message,
		Partials.Channel,
		Partials.Reaction,
	],
});

// Function to add a GIF request to the processing queue
function enqueueGifRequest(message, url, startTime, endTime) {
	requestQueue.enqueue({ message, url, startTime, endTime });
	return requestQueue.size;
}

/**
 * Processes the GIF requests in the queue one by one.
 * This function handles the Python process execution and Discord message updates.
 */
async function processGifQueue() {

	// If we are already processing a request, or the queue is empty, do nothing.
	if (isProcessingQueue || requestQueue.isEmpty()) {
		return;
	}

	// Set the flag to true to signal that we've started processing.
	isProcessingQueue = true;

	// Get the next request from the front of the queue.
	const request = requestQueue.dequeue();
	const { message, url, startTime, endTime } = request;

	console.log(`[GIF] Processing request for ${message.author.tag}. Queue length: ${requestQueue.size}`);

	try {

		await message.channel.sendTyping();

		// Send initial reply to acknowledge the command
		const initialReply = await message.reply({
			content: `Processing your x.com post: \n${url}\nStart: ${startTime}\nEnd: ${endTime}\nBe patient while I process your request...`
		});

		try {
			const outputFile = generateOutputFilename();
			await executePythonCommand(url, startTime, endTime, outputFile);

			// Send the generated image back to the channel using AttachmentBuilder
			const attachment = new AttachmentBuilder(outputFile);
			await message.channel.send({
				content: `Here's your processed gif.`,
				files: [attachment]
			});

			// Edit the initial reply to indicate success
			await initialReply.edit({
				content: `✅ Successfully processed your GIF!\nIf you like my work give me some ❤️!`
			});
		} catch (error) {
			console.error("Error processing GIF command:", error);

			// Provide more detailed error messages to the user
			let errorMessage = "Sorry, I encountered an error while processing your request.";

			if (error.message.includes('timed out')) {
				errorMessage = "⏱️ The processing took too long and timed out. Please try again with a shorter video segment.";
			} else if (error.message.includes('Python process failed')) {
				errorMessage = "🐍 The Python script encountered an error. Please check the URL and try again.";
			} else if (error.message.includes('ENOENT')) {
				errorMessage = "🔧 A required system component is missing. Please contact an administrator.";
			}

			await initialReply.edit({
				content: errorMessage
			});
		}
	} catch (error) {
		console.error("Error handling GIF request:", error);
	} finally {
		await new Promise(resolve => setTimeout(resolve, 1000));
		// Reset the flag to
		//  false so the next request can be processed.
		isProcessingQueue = false;
		// Call processQueue again to check if there are more items waiting.
		process.nextTick(processGifQueue);
	}
}

/**
 * Checks if the GIF queue is currently processing a request.
 * @returns {boolean} True if a request is being processed, false otherwise.
 */
function getIsGifProcessing() {
	return isProcessingQueue;
}

/**
 * Gets the current size of the GIF request queue.
 * @returns {number} The number of requests currently in the queue.
 */
function getGifQueueSize() {
	return requestQueue.size;
}

// Function to execute command from gif.cjs (now only used internally by the queue system)
async function executeGifCommand(url, startTime = "00:00", endTime = "00:00") {
	const outputFile = generateOutputFilename();
	try {
		await executePythonCommand(url, startTime, endTime, outputFile);
		return outputFile;
	} catch (error) {
		console.error("Error executing GIF command:", error);
		throw error;
	}
}

// Function to generate a unique output filename
function generateOutputFilename() {
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	const randomSuffix = Math.floor(Math.random() * 1000000);
	return `image-output/${timestamp}-${randomSuffix}.webp`;
}

// --- Bot Ready Event ---
client.once("ready", async () => {
	console.log(`[Saito] Logged in as ${client.user.tag}!`);
});

// --- Message Create Event ---
client.on("messageCreate", async (message) => {
	if (message.author.bot) return;

	// Check for gif help command
	const helpMsg = "Here's how to use the GIF command:\n" +
		"1. Find a Twitter/X post URL that contains a video (only support x.com domain)\n" +
		"2. Use the command: `!gif [URL] [start_time] [end_time]`\n" +
		"   - [URL]: The Twitter/X post URL\n" +
		"   - [start_time]: Optional start time in MM:SS format (default: 00:00)\n" +
		"   - [end_time]: Optional end time in MM:SS format (default: 00:00)\n" +
		"\n**Example 1 :** entire video\n`!gif https://x.com/user/status/123456789`\n" +
		"\n**Example 2 :** first 5 seconds\n`!gif https://x.com/user/status/123456789 00:00 00:05`\n" +
		"\n**Example 3 :** last 5 seconds\n`!gif https://x.com/user/status/123456789 00:05 00:10`\n" +
		"\n**Note**:\n" +
		"- The orginal video should not be longer than 10-30 seconds (it may cause error if you try to process longer video).\n" +
		"- Bot can only process up to 10 seconds long gif (our recomendation setting is 5s long, if image-process take longer than 30 seconds will result in timeout error).\n" +
		"- Animated gif support up to smooth 60 FPS but quality is medium to low side.\n" +
		"\n**Rate Limit**:\n" +
		"- Server cooldown is 10 seconds between commands. (next person must wait 10 second to use the command again).\n" +
		"- User rate limit is 60 seconds between commands. (you must wait 60 second to use the command again).";

	if (message.content.toLowerCase() === "!gif help") {
		await message.reply(helpMsg);
		return;
	}

	// Check for gif command with URL and time parameters
	const gifCommandMatch = message.content.match(/^!gif\s+(https?:\/\/(?:www\.)?x\.com\/[^\s/$.?#]+\/status\/[^\s/$.?#]+\/?)\s*((?:\d{2}:\d{2}\s*){0,2})/i);

	if (gifCommandMatch) {
		const url = gifCommandMatch[1];
		const command = message.content; // The full command string

		// Check custom rate limit for GIF commands
		const waitTime = checkCustomRateLimit(
			message.guild?.id || "global",
			message.author.id,
			command
		);

		if (waitTime > 0) {
			// Calculate remaining time in seconds
			const secondsRemaining = Math.ceil(waitTime / 1000);

			// Check if this is a repeated command (60s penalty)
			const isRepeatedCommand = lastUserCommand.get(message.author.id)?.command === command;

			if (isRepeatedCommand) {
				await message.reply({
					content: `⚠️ You just sent the same command! Please wait ${secondsRemaining} seconds before trying again.` + " Use `!gif help` for more information."
				});
			} else {
				await message.reply({
					content: `⏳ Server is busy. Please wait ${secondsRemaining} seconds before sending another command.` + " Use `!gif help` for more information."
				});
			}
			return;
		}

		// Process the GIF command
		console.log(`Detected gif command with URL: ${url}`);

		// Extract time parameters if present
		let startTime = "00:00", endTime = "00:00";
		const timeParams = gifCommandMatch[2]?.trim();

		if (timeParams) {
			const times = timeParams.split(/\s+/);
			if (times.length >= 1) startTime = times[0];
			if (times.length >= 2) endTime = times[1];
		}

		// Add the request to the queue
		const queueSize = enqueueGifRequest(message, url, startTime, endTime);

		// Provide feedback based on queue status
		if (queueSize >= 1 && getIsGifProcessing()) {
			// If there are other requests in the queue and one is already processing
			// await message.channel.sendTyping(); // Show typing indicator
			// await new Promise(resolve => setTimeout(resolve, 5000));
			await message.reply({
				content: `⏳ I'm currently processing another GIF request. You are #${queueSize} in the queue. I'll process your request as soon as possible!`
			});
			return;
		} else {
			// Start processing the queue if not already processing
			processGifQueue();
		}
	}
});

// --- Login to Discord ---
if (TOKEN) {
	client.login(TOKEN);
} else {
	console.error("FATAL: Bot cannot login without DISCORD_TOKEN!");
}


// --- Handle Process Exit ---
process.on("exit", () => {
	console.log("Bot shutting down.");
	// Terminate any active Python processes
	activePythonProcesses.forEach(process => {
		try {
			process.kill('SIGTERM');
		} catch (err) {
			console.error(`Error terminating Python process: ${err}`);
		}
	});
});

process.on("SIGINT", () => {
	console.log("SIGINT received. Shutting down.");
	// Terminate any active Python processes
	activePythonProcesses.forEach(process => {
		try {
			process.kill('SIGTERM');
		} catch (err) {
			console.error(`Error terminating Python process: ${err}`);
		}
	});
	process.exit();
});
