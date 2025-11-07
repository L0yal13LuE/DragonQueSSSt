const fs = require("fs");

require("dotenv").config({
	path: {
		blue: ".env.blue",
		development: ".env",
		staging: ".env.staging",
		production: ".env.production",
	}[process.env.NODE_ENV || "development"],
});

const {
	Client,
	GatewayIntentBits,
	Partials,
	AttachmentBuilder
} = require("discord.js");

/*const { spawn } = require('child_process');*/

// --- Configuration ---
const TOKEN = process.env.DISCORD_TOKEN;

const PYTHON_CMD = process.env.CMD_PYTHON ? process.env.CMD_PYTHON : "python";

let PYTHON_API_ONLINE = true;
let PYTHON_API_TM = null;

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
		GatewayIntentBits.GuildMembers
	],
	partials: [
		Partials.Message,
		Partials.Channel,
		Partials.Reaction
	],
});

// --- Custom Rate Limiting System
const lastServerCommandTime = new Map(); // Tracks last command time per server
const lastUserCommand = new Map();      // Tracks last command content per user
const SERVER_COOLDOWN = 60000;          // 60 seconds between server commands
const SAME_COMMAND_PENALTY = 60000;      // Additional 60 seconds for repeated commands

// --- Custom server rate limiting function
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

// Track active Python processes for cleanup
const activePythonProcesses = new Set();

/*function useLocalPython(url, startTime, endTime, outputFile) {
	return new Promise((resolve, reject) => {
		// Declare pythonProcess with let so it's available in the timeout scope
		let pythonProcess;

		// Set timeout for the process (60 seconds)
		const timeout = 60000;
		const timer = setTimeout(() => {
			if (pythonProcess) {
				pythonProcess.kill('SIGTERM');
				reject(new Error('Python process timed out after 60 seconds'));
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
}*/

async function resumeOnlineAPI() {

	const RENDER_API_KEY = process.env.RENDER_API_KEY;
	if (!RENDER_API_KEY) throw new Error("RENDER_API_KEY not set");

	const RENDER_SERVICE_ID = process.env.RENDER_SERVICE_ID;
	if (!RENDER_SERVICE_ID) throw new Error("RENDER_SERVICE_ID not set");

	try {
		const res = await fetch(`https://api.render.com/v1/services/${RENDER_SERVICE_ID}/resume`, {
			method: "POST",
			headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RENDER_API_KEY}` }
		});
		console.log('[Saito] : resumeOnlineAPI > done', res.text())
		if (res.ok) return true;
		return false;
	} catch (error) {
		console.log('[Saito] : resumeOnlineAPI > error', error)
		return false;
	}
}

let callingAPI = true;
async function useOnlineAPI(url, startTime, endTime, outputFile) {
	try {
		const apiUrl = process.env.PYTHON_API_URL;
		if (!apiUrl) throw new Error("PYTHON_API_URL not set");

		callingAPI = true;

		const timeout = 150000;
		const timerCalling = setTimeout(() => {
			if (callingAPI) {
				clearTimeout(timerCalling);
				throw new Error('Python process timed out after 150 seconds,');
			}
		}, timeout);

		const res = await fetch(`${apiUrl}/convert`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ url, start_time: startTime, end_time: endTime }),
		});

		callingAPI = false;

		if (!res.ok) {
			const text = await res.text();
			throw new Error(`Python API failed: ${text}`);
		}

		// Stream WebP response into a local file
		const buffer = Buffer.from(await res.arrayBuffer());
		try {
			await fs.promises.writeFile(outputFile, buffer);
		} catch (writeError) {
			console.error(`Error writing file ${outputFile}:`, writeError);
			throw new Error(`Failed to save output file: ${writeError.message}`);
		}

		return outputFile;

	} catch (error) {
		console.error('[Saito] : useOnlineAPI error', error);
		return false;
	}
}

// Function to add a GIF request to the processing queue
function enqueueGifRequest(message, url, startTime, endTime) {
	requestQueue.enqueue({ message, url, startTime, endTime });
	return requestQueue.size;
}

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

	let processingError = false;

	try {
		await message.channel.sendTyping();

		// Send initial reply to acknowledge the command
		const initialReply = await message.reply({
			content: `Please wait... 😜`
		});

		console.log(`-------------- [GIF] ${message.author.tag} request started.`);
		console.log(`-------------- [GIF] ${url} processing...`);
		const outputFile = generateOutputFilename();
		// const imageOutputFile = PYTHON_API_ONLINE ? await useOnlineAPI(url, startTime, endTime, outputFile) : await useLocalPython(url, startTime, endTime, outputFile);
		const imageOutputFile = await useOnlineAPI(url, startTime, endTime, outputFile);
		if (!imageOutputFile) {
			await initialReply.edit({
				content: 'Sorry, I encountered an error while processing your request. Please try again later'
			});
			console.log(`-------------- [GIF] ${message.author.tag} request error.`);
		} else {
			const attachment = new AttachmentBuilder(imageOutputFile);
			await message.channel.send({
				content: `😉 Here's your processed gif.`,
				files: [attachment]
			});
			await initialReply.edit({
				content: `✅ Successfully processed your GIF! If you like my work give me some ❤️`
			});
			console.log(`-------------- [GIF] ${message.author.tag} request ended.`);
		}
	} catch (error) {
		processingError = true;
		console.error("Error processing GIF request:", error);

		let errorMessage = "Sorry, I encountered an error while processing your request.";
		if (error.message.includes('timed out')) {
			errorMessage = "⏱️ The processing took too long and timed out. Please try again with a shorter video segment.";
		} else if (error.message.includes('Python process failed')) {
			errorMessage = "🐍 The Python script encountered an error. Please check the URL and try again.";
		} else if (error.message.includes('ENOENT')) {
			errorMessage = "🔧 A required system component is missing. Please contact an administrator.";
		}

		try {
			// Try to edit the initial reply if it exists
			if (typeof initialReply !== 'undefined' && initialReply.edit) {
				await initialReply.edit({
					content: errorMessage
				});
			}
		} catch (editError) {
			console.error("Error editing initial reply:", editError);
		}
		console.log(`-------------- [GIF] Processing request for ${message.author.tag} error: ${errorMessage}`);
	} finally {
		await new Promise(resolve => setTimeout(resolve, 1000));
		isProcessingQueue = false;
		// Only retry if there was no error to prevent infinite loops
		if (!processingError) {
			process.nextTick(processGifQueue);
		}
	}
}

function getIsGifProcessing() {
	return isProcessingQueue;
}

function generateOutputFilename() {
	// Ensure the output directory exists
	const outputDir = 'image-output';
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	const randomSuffix = Math.floor(Math.random() * 1000000);
	return `${outputDir}/${timestamp}-${randomSuffix}.webp`;
}

// --- Bot Ready Event ---
client.once("ready", async () => {
	try {
		console.log(`[Saito] Logged in as ${client.user.tag}!`);

		// const responseOnInit = await fetch('https://twitter-webp-api.onrender.com/');
		// if (responseOnInit.ok) {
		// 	console.log('[Saito] Python API init ping successful');
		// 	PYTHON_API_ONLINE = true;
		// } else {
		// 	PYTHON_API_ONLINE = false;
		// }

		// setInterval(async () => {
		// 	const controller = new AbortController();
		// 	const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 seconds timeout

		// 	try {
		// 		const response = await fetch('https://twitter-webp-api.onrender.com/', { signal: controller.signal });
		// 		clearTimeout(timeoutId);
		// 		if (response.ok) {
		// 			console.log('[Saito] Python API ping successful');
		// 			PYTHON_API_ONLINE = true;
		// 		} else {
		// 			console.log(`[Saito] Python API ping failed with status: ${response.status}`);
		// 			PYTHON_API_ONLINE = false;
		// 		}
		// 	} catch (error) {
		// 		clearTimeout(timeoutId);
		// 		if (error.name === 'AbortError') {
		// 			console.error('[Saito] Python API ping timed out after 30 seconds');
		// 		} else {
		// 			console.error('[Saito] Python API ping error:', error.message);
		// 		}
		// 		PYTHON_API_ONLINE = false;
		// 		// await resumeOnlineAPI();
		// 	}
		// }, 600000);
	} catch (error) {
		console.error("Error in ready event:", error);
	}
});

// --- Message Create Event ---
client.on("messageCreate", async (message) => {
	try {
		if (message.author.bot) return;

		// Boost Logging for premium features
		let premiumUser = false;

		// Get the guild's booster role
		const boosterRole = message.guild.roles.premiumSubscriberRole;
		// Get the member's GuildMember object
		const member = message.member;

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
			"- Bot can only process up to **5** seconds long gif (if whole process take longer than 120 seconds will result in timeout error).\n" +
			"\n**⚠️ Caution/Limit ⚠️**\n" +
			"- Server cooldown is 60 seconds between commands.\n" +
			"- User rate limit is 60 seconds between commands.";

		if (message.content.toLowerCase() === "!gif help") {
			await message.reply(helpMsg);
			return;
		}

		// Check for gif command with URL and time parameters
		const gifCommandMatch = message.content.match(/^!gif\s+(https?:\/\/(?:www\.)?x\.com\/[^\s/$.?#]+\/status\/[^\s/$.?#]+\/?)\s*((?:\d{2}:\d{2}\s*){0,2})/i);

		if (gifCommandMatch) {

			if (boosterRole) {
				console.log(`The server's booster role is: ${boosterRole.name}`);
			} else {
				console.log('This server does not have a booster role (likely has no boosts).');
			}

			// Check if they are boosting
			if (member.premiumSince) {
				const boostDate = new Date(member.premiumSince).toLocaleDateString();
				console.log(`User: ${message.author.username} : Thank you for boosting this server since ${boostDate}!`);
				premiumUser = true;
			} else {
				console.log(`User: ${message.author.username} : You are not currently boosting this server.`);
			}


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
				processGifQueue(premiumUser);
			}
		}
	} catch (error) {
		console.error("Error in messageCreate event:", error);
	}
});

// // --- Global Error Handlers ---
// process.on('uncaughtException', (error) => {
// 	console.error('Uncaught Exception:', error);
// 	// Optionally, you can choose to exit the process or continue running
// 	// process.exit(1);
// });

// process.on('unhandledRejection', (reason, promise) => {
// 	console.error('Unhandled Rejection at:', promise, 'reason:', reason);
// 	// Optionally, you can choose to exit the process or continue running
// 	// process.exit(1);
// });

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
