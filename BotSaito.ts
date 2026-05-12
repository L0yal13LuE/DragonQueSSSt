import fs from 'node:fs';
import dotenv from 'dotenv';

dotenv.config({
  path: {
    blue: '.env.blue',
    development: '.env',
    staging: '.env.staging',
    production: '.env.production',
  }[process.env.NODE_ENV || 'development'],
});

import {
  Client,
  GatewayIntentBits,
  Partials,
  AttachmentBuilder,
} from 'discord.js';
import { spawn, type ChildProcess } from 'child_process';

const TOKEN = process.env.DISCORD_TOKEN;
const PYTHON_CMD = process.env.CMD_PYTHON ? process.env.CMD_PYTHON : 'python';
let PYTHON_API_ONLINE = true;
let PYTHON_API_TM: ReturnType<typeof setTimeout> | null = null;

if (!TOKEN) {
  console.error('FATAL ERROR: DISCORD_TOKEN not found in .env file!');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
  ],
});

const lastServerCommandTime = new Map<string, number>();
const lastUserCommand = new Map<string, { command: string; time: number }>();
const SERVER_COOLDOWN = 60000;
const SAME_COMMAND_PENALTY = 60000;

function checkCustomRateLimit(serverId: string, userId: string, command: string): number {
  const now = Date.now();

  const lastServerTime = lastServerCommandTime.get(serverId) || 0;
  const serverCooldownRemaining = Math.max(0, (lastServerTime + SERVER_COOLDOWN) - now);

  let sameCommandPenalty = 0;
  const userLastCommand = lastUserCommand.get(userId);

  if (userLastCommand && userLastCommand.command === command) {
    const lastCommandTime = userLastCommand.time;
    sameCommandPenalty = Math.max(0, (lastCommandTime + SAME_COMMAND_PENALTY) - now);
  }

  const totalWaitTime = Math.max(serverCooldownRemaining, sameCommandPenalty);

  if (totalWaitTime === 0) {
    lastServerCommandTime.set(serverId, now);
    lastUserCommand.set(userId, { command, time: now });
  }

  return totalWaitTime;
}

class Node<T> {
  value: T;
  next: Node<T> | null = null;

  constructor(value: T) {
    this.value = value;
  }
}

class Queue<T> {
  head: Node<T> | null = null;
  tail: Node<T> | null = null;
  size = 0;

  enqueue(item: T): number {
    const newNode = new Node(item);
    if (!this.head) {
      this.head = newNode;
      this.tail = newNode;
    } else {
      this.tail!.next = newNode;
      this.tail = newNode;
    }
    this.size++;
    return this.size;
  }

  dequeue(): T | null {
    if (!this.head) {
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

  isEmpty(): boolean {
    return this.size === 0;
  }
}

const requestQueue = new Queue<{ message: any; url: string; startTime: string; endTime: string }>();
let isProcessingQueue = false;

const activePythonProcesses = new Set<ChildProcess>();

function useLocalPython(url: string, startTime: string, endTime: string, outputFile: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let pythonProcess: ChildProcess | undefined;

    const timeout = 60000;
    const timer = setTimeout(() => {
      if (pythonProcess) {
        pythonProcess.kill('SIGTERM');
        reject(new Error('Python process timed out after 60 seconds'));
      }
    }, timeout);

    pythonProcess = spawn(PYTHON_CMD, ['gif.py', url, startTime, endTime, outputFile]);

    activePythonProcesses.add(pythonProcess);

    let stdoutData = '';
    let stderrData = '';

    pythonProcess.stdout!.on('data', (data: Buffer) => {
      stdoutData += data.toString();
    });

    pythonProcess.stderr!.on('data', (data: Buffer) => {
      stderrData += data.toString();
    });

    pythonProcess.on('close', (code) => {
      clearTimeout(timer);
      activePythonProcesses.delete(pythonProcess!);

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

async function resumeOnlineAPI(): Promise<boolean> {
  const RENDER_API_KEY = process.env.RENDER_API_KEY;
  if (!RENDER_API_KEY) throw new Error('RENDER_API_KEY not set');

  const RENDER_SERVICE_ID = process.env.RENDER_SERVICE_ID;
  if (!RENDER_SERVICE_ID) throw new Error('RENDER_SERVICE_ID not set');

  try {
    const res = await fetch(`https://api.render.com/v1/services/${RENDER_SERVICE_ID}/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RENDER_API_KEY}` },
    });
    console.log('[Saito] : resumeOnlineAPI > done', res.text());
    if (res.ok) return true;
    return false;
  } catch (error) {
    console.log('[Saito] : resumeOnlineAPI > error', error);
    return false;
  }
}

let callingAPI = true;
async function useOnlineAPI(url: string, startTime: string, endTime: string, outputFile: string): Promise<string> {
  const apiUrl = process.env.PYTHON_API_URL;
  if (!apiUrl) throw new Error('PYTHON_API_URL not set');

  callingAPI = true;

  const timeout = 120000;
  const timerCalling = setTimeout(() => {
    if (callingAPI) {
      clearTimeout(timerCalling);
      throw new Error('Python process timed out after 120 seconds,');
    }
  }, timeout);

  const res = await fetch(`${apiUrl}/convert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, start_time: startTime, end_time: endTime }),
  });

  callingAPI = false;

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Python API failed: ${text}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.promises.writeFile(outputFile, buffer);

  return outputFile;
}

function parseTime(input?: string): string | null {
  if (!input) return null;

  input = input.toLowerCase().trim();

  if (/^\d{1,2}:\d{1,2}$/.test(input)) {
    const [m, s] = input.split(':').map(Number);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  if (/^\d+(\.\d+)?s?$/.test(input)) {
    const seconds = Math.round(parseFloat(input));
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  return '00:00';
}

function enqueueGifRequest(message: any, url: string, startTime: string, endTime: string): number {
  requestQueue.enqueue({ message, url, startTime, endTime });
  return requestQueue.size;
}

async function processGifQueue(): Promise<void> {
  if (isProcessingQueue || requestQueue.isEmpty()) {
    return;
  }

  isProcessingQueue = true;

  const request = requestQueue.dequeue()!;
  const { message, url, startTime, endTime } = request;

  console.log(`[GIF] Processing request for ${message.author.tag}. Queue length: ${requestQueue.size}`);

  try {
    await message.channel.sendTyping();

    const initialReply = await message.reply({
      content: 'Please wait... 😜',
    });

    try {
      console.log(`-------------- [GIF] Processing request for ${message.author.tag} statrted.`);
      const outputFile = generateOutputFilename();
      const imageOutputFile = await useLocalPython(url, startTime, endTime, outputFile);
      const attachment = new AttachmentBuilder(imageOutputFile);
      await message.channel.send({
        content: '😉 Here\'s your processed gif.',
        files: [attachment],
      });
      await initialReply.edit({
        content: '✅ Successfully processed your GIF! If you like my work give me some ❤️',
      });
      console.log(`-------------- [GIF] Processing request for ${message.author.tag} ended.`);
    } catch (error: any) {
      console.error('Error processing GIF command:', error);

      let errorMessage = 'Sorry, I encountered an error while processing your request.';
      if (error.message.includes('timed out')) {
        errorMessage = '⏱️ The processing took too long and timed out. Please try again with a shorter video segment.';
      } else if (error.message.includes('Python process failed')) {
        errorMessage = '🐍 The Python script encountered an error. Please check the URL and try again.';
      } else if (error.message.includes('ENOENT')) {
        errorMessage = '🔧 A required system component is missing. Please contact an administrator.';
      }

      await initialReply.edit({
        content: errorMessage,
      });
      console.log(`-------------- [GIF] Processing request for ${message.author.tag} error: ${errorMessage}`);
    }
  } catch (error) {
    console.error('Error handling GIF request:', error);
  } finally {
    await new Promise(resolve => setTimeout(resolve, 500));
    isProcessingQueue = false;
    process.nextTick(processGifQueue);
  }
}

function getIsGifProcessing(): boolean {
  return isProcessingQueue;
}

function generateOutputFilename(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const randomSuffix = Math.floor(Math.random() * 1000000);
  return `image-output/${timestamp}-${randomSuffix}.webp`;
}

client.once('ready', async () => {
  console.log(`[Saito] Logged in as ${client.user!.tag}!`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  let premiumUser = false;

  const boosterRole = message.guild.roles.premiumSubscriberRole;
  const member = message.member;

  const helpMsg =
    'Here\'s how to use the GIF command:\n' +
    '1. Find a Twitter/X post URL that contains a video (only support x.com domain)\n' +
    '2. Use the command: `!gif [URL] [start_time] [end_time]`\n' +
    '   - [URL]: The Twitter/X post URL\n' +
    '   - [start_time]: Optional start time in MM:SS format (default: 00:00)\n' +
    '   - [end_time]: Optional end time in MM:SS format (default: 00:00)\n' +
    '\n**Example 1 :** entire video\n`!gif https://x.com/user/status/123456789`\n' +
    '\n**Example 2 :** first 5 seconds\n`!gif https://x.com/user/status/123456789 00:00 00:05`\n' +
    '\n**Example 3 :** last 5 seconds\n`!gif https://x.com/user/status/123456789 00:05 00:10`\n' +
    '\n**Note**:\n' +
    '- The orginal video should not be longer than 10-30 seconds (it may cause error if you try to process longer video).\n' +
    '- Bot can only process up to **5** seconds long gif (if whole process take longer than 120 seconds will result in timeout error).\n' +
    '\n**⚠️ Caution/Limit ⚠️**\n' +
    '- Server cooldown is 60 seconds between commands.\n' +
    '- User rate limit is 60 seconds between commands.';

  if (message.content.toLowerCase() === '!gif help') {
    await message.reply(helpMsg);
    return;
  }

  const gifCommandMatch = message.content.match(/^!gif\s+(https?:\/\/(?:www\.)?x\.com\/[^\s/$.?#]+\/status\/[^\s/$.?#]+\/?)\s*((?:\d{2}:\d{2}\s*){0,2})/i);
  if (gifCommandMatch) {
    if (boosterRole) {
      console.log(`The server's booster role is: ${boosterRole.name}`);
    } else {
      console.log('This server does not have a booster role (likely has no boosts).');
    }

    if (member?.premiumSince) {
      const boostDate = new Date(member.premiumSince).toLocaleDateString();
      console.log(`User: ${message.author.username} : Thank you for boosting this server since ${boostDate}!`);
      premiumUser = true;
    } else {
      console.log(`User: ${message.author.username} : You are not currently boosting this server.`);
    }

    const url = gifCommandMatch[1];
    const command = message.content;

    const waitTime = checkCustomRateLimit(
      message.guild?.id || 'global',
      message.author.id,
      command
    );

    if (waitTime > 0) {
      const secondsRemaining = Math.ceil(waitTime / 1000);
      const isRepeatedCommand = lastUserCommand.get(message.author.id)?.command === command;
      if (isRepeatedCommand) {
        await message.reply({
          content: '⚠️ You just sent the same command! Please wait ' + secondsRemaining + ' seconds before trying again.' + ' Use `!gif help` for more information.',
        });
      } else {
        await message.reply({
          content: '⏳ Server is busy. Please wait ' + secondsRemaining + ' seconds before sending another command.' + ' Use `!gif help` for more information.',
        });
      }
      return;
    }

    const startTime = parseTime(gifCommandMatch[2]) || '00:00';
    const endTime = parseTime(gifCommandMatch[3]) || '00:00';
    const queueSize = enqueueGifRequest(message, url, startTime, endTime);
    if (queueSize >= 1 && getIsGifProcessing()) {
      await message.reply({
        content: '⏳ I\'m currently processing another GIF request. You are #' + queueSize + ' in the queue. I\'ll process your request as soon as possible!',
      });
      return;
    } else {
      processGifQueue();
    }
  }
});

if (TOKEN) {
  client.login(TOKEN);
} else {
  console.error('FATAL: Bot cannot login without DISCORD_TOKEN!');
}

process.on('exit', () => {
  console.log('Bot shutting down.');
  activePythonProcesses.forEach((proc) => {
    try {
      proc.kill('SIGTERM');
    } catch (err) {
      console.error(`Error terminating Python process: ${err}`);
    }
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down.');
  activePythonProcesses.forEach((proc) => {
    try {
      proc.kill('SIGTERM');
    } catch (err) {
      console.error(`Error terminating Python process: ${err}`);
    }
  });
  process.exit();
});
