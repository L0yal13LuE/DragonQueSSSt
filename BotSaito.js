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
} = require("discord.js");
const { spawn } = require('child_process');

// Maximum number of concurrent Python processes allowed
const MAX_CONCURRENT_PROCESSES = 5;

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

// Function to execute command from gif.cjs
async function executeGifCommand(url, startTime = "00:00", endTime = "00:00") {
	if (activePythonProcesses.size >= MAX_CONCURRENT_PROCESSES) {
		throw new Error(`Concurrency limit reached: ${MAX_CONCURRENT_PROCESSES} processes are already running.`);
	}

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

// Regex pattern to match x.com URLs (captures full URL including status ID)
const xComUrlRegex = /https?:\/\/(?:www\.)?x\.com\/[^\s/$.?#]+\/status\/[^\s/$.?#]+\/?(?:[?][^\s]*)?/i;

// --- Bot Ready Event ---
client.once("ready", async () => {
	console.log(`[Saito] Logged in as ${client.user.tag}!`);
});

// --- Message Create Event ---
client.on("messageCreate", async (message) => {
	if (message.author.bot) return;

	const helpMsg = "Here's how to use the GIF command:\n" +
		"1. Find a Twitter/X post URL that contains a video (only support x.com domain)\n" +
		"2. Use the command: `!gif [URL] [start_time] [end_time]`\n" +
		"   - [URL]: The Twitter/X post URL\n" +
		"   - [start_time]: Optional start time in MM:SS format (default: 00:00)\n" +
		"   - [end_time]: Optional end time in MM:SS format (default: entire video)\n" +
		"\n**Example 1 :** entire video\n`!gif https://x.com/user/status/123456789`\n" +
		"\n**Example 2 :** first 5 seconds\n`!gif https://x.com/user/status/123456789 00:00 00:05`\n" +
		"\n**Example 3 :** last 5 seconds\n`!gif https://x.com/user/status/123456789 00:05 00:10`\n" +
		"\n**Note**:\n" +
		"- The orginal video should not be longer than 10-30 seconds (it may cause error if you try to process longer video).\n" +
		"- Bot can only process up to 10 seconds (if it take longer than 30 seconds will result in timeout).\n" +
		"- While this tool seem to be convineient and easy but the output quality is low-medium due to server limited time.";

	// Check for gif help command
	if (message.content.toLowerCase() === "!gif help") {
		await message.reply(helpMsg);
		return;
	}

	// Check for gif command with URL and time parameters
	const gifCommandMatch = message.content.match(/^!gif\s+(https?:\/\/(?:www\.)?x\.com\/[^\s/$.?#]+\/status\/[^\s/$.?#]+\/?)\s*((?:\d{2}:\d{2}\s*){0,2})/i);

	if (gifCommandMatch) {
		const url = gifCommandMatch[1];
		console.log(`Detected gif command with URL: ${url}`);

		// Extract time parameters if present
		let startTime = "00:00", endTime = "00:00";
		const timeParams = gifCommandMatch[2]?.trim();

		if (timeParams) {
			const times = timeParams.split(/\s+/);
			if (times.length >= 1) startTime = times[0];
			if (times.length >= 2) endTime = times[1];
		}

		try {
			// Send initial reply to acknowledge the command
			const initialReply = await message.reply({
				content: `Processing your x.com post: \n${url}\nStart: ${startTime}\nEnd: ${endTime}\nBe patient while I process your request...`
			});
			try {
				// Execute the GIF command and wait for completion
				const outputFile = await executeGifCommand(url, startTime, endTime);

				// Send the generated image back to the channel
				await message.channel.send({
					content: `Here's your processed gif.`,
					files: [outputFile]
				});

				// Edit the initial reply to indicate success
				await initialReply.edit({
					content: `✅ Successfully processed your GIF!\nIf you like my work give me some ❤️!`
				});
			} catch (error) {
				console.error("Error sending gif image:", error);
				await initialReply.edit({
					content: `⚠️ The GIF was generated but I couldn't send it. Error: ${error.message}`
				});
			}
		} catch (error) {
			console.error("Error processing gif command:", error);

			// Provide more detailed error messages to the user
			let errorMessage = "Sorry, I encountered an error while processing your request.";

			if (error.message.includes('Concurrency limit reached')) {
				errorMessage = `⏳ I'm currently busy processing ${MAX_CONCURRENT_PROCESSES} other requests. Please try again in a moment.`;
			} else if (error.message.includes('timed out')) {
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
