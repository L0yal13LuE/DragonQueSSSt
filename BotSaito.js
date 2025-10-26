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
const { exec } = require('child_process');
function executePythonCommand(url, startTime, endTime, outputFile) {
  return new Promise((resolve, reject) => {
    const command = `python gif.py ${url} ${startTime} ${endTime} ${outputFile}`;
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        reject(error);
        return;
      }
      console.log(`stdout: ${stdout}`);
      if (stderr) {
        console.error(`stderr: ${stderr}`);
      }
      resolve(outputFile);
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

  // Check for gif help command
  if (message.content.toLowerCase() === "gif help") {
    await message.reply(
      "Here's how to use the GIF command:\n" +
      "1. Find a Twitter/X post URL that contains a video (only support x.com domain)\n" +
      "2. Use the command: `gif [URL] [start_time] [end_time]`\n" +
      "   - [URL]: The Twitter/X post URL\n" +
      "   - [start_time]: Optional start time in MM:SS format (default: 00:00)\n" +
      "   - [end_time]: Optional end time in MM:SS format (default: entire video)\n" +
      "**Example 1:** entire video\n`gif https://x.com/user/status/123456789 00:00 00:00`\n" +
      "**Example 2:** first 5 seconds\n`gif https://x.com/user/status/123456789 00:00 00:05`\n" +
      "**Example 3:**  last 5 seconds\n`gif https://x.com/user/status/123456789 00:05 00:10`\n" +
      "\n**Note: If no time parameters are provided, the entire video will be used. also this bot can only process up to 10 seconds of video.**"
    );
    return;
  }

  // Check for gif command with URL and time parameters
  const gifCommandMatch = message.content.match(/^gif\s+(https?:\/\/(?:www\.)?x\.com\/[^\s/$.?#]+\/status\/[^\s/$.?#]+\/?)\s*((?:\d{2}:\d{2}\s*){0,2})/i);

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
      // Send confirmation message
      await message.reply(`Processing your x.com post: \n${url}\nStart: ${startTime}\nEnd: ${endTime}\nBe patient while I process your request...\n`);

      // Execute the GIF command and wait for completion
      const outputFile = await executeGifCommand(url, startTime, endTime);

      try {
        // Send the generated image back to the channel
        await message.channel.send({
          content: `Here's your processed gif.`,
          files: [outputFile]
        });
        // console.log(`Sent processed image to channel for user ${message.author.username}`);
      } catch (error) {
        console.error("Error sending gif image:", error);
        await message.reply("The gif image was generated but I couldn't send it. Please tag a member of staff to check the logs.");
      }
      // console.log(`Processed gif command for user ${message.author.username}`);
    } catch (error) {
      console.error("Error processing gif command:", error);
      await message.reply("Sorry, I encountered an error while processing your request.");
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
process.on("exit", () => console.log("Bot shutting down."));
process.on("SIGINT", () => {
  console.log("SIGINT received. Shutting down.");
  process.exit();
});
