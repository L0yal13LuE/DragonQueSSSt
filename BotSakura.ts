import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  Client,
  GatewayIntentBits,
  Partials,
  AttachmentBuilder,
} from 'discord.js';
import { spawn, type ChildProcess } from 'child_process';
import dotenv from 'dotenv';

dotenv.config({
  path: {
    blue: '.env.blue',
    development: '.env',
    staging: '.env.staging',
    production: '.env.production',
  }[process.env.NODE_ENV || 'development'],
});

const CONFIG = {
  TOKEN: process.env.DISCORD_TOKEN,
  PYTHON_API_URL: process.env.PYTHON_API_URL,
  RENDER_API_KEY: process.env.RENDER_API_KEY || '',
  RENDER_SERVICE_ID: process.env.RENDER_SERVICE_ID,
  SERVER_COOLDOWN: 15 * 1000,
  SAME_COMMAND_PENALTY: 15 * 1000,
  RATE_LIMIT_CLEANUP_INTERVAL: 60 * 60 * 1000,
  API_TIMEOUT: (60 * 5) * 1000,
  OUTPUT_DIR: 'image-output',
  PROCESS_COOLDOWN: 30 * 1000,
};
const PYTHON_CMD = process.env.CMD_PYTHON || 'python';

if (!CONFIG.TOKEN) {
  console.error('[FATAL] DISCORD_TOKEN not found in .env file! The bot cannot start.');
  process.exit(1);
}
if (!CONFIG.PYTHON_API_URL) {
  console.warn('[WARNING] PYTHON_API_URL is not set. The !gif command will fail.');
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

function checkCustomRateLimit(serverId: string, userId: string, command: string): number {
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

function cleanupRateLimitMaps(): void {
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
    if (this.isEmpty()) {
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
    if (this.isEmpty()) {
      return null;
    }
    const dequeuedValue = this.head!.value;
    this.head = this.head!.next;
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

interface GifJob {
  author: any;
  channelId: string;
  url: string;
  startTime: string;
  endTime: string;
}

const requestQueue = new Queue<GifJob>();
let isProcessingQueue = false;
let currentlyProcessing: GifJob | null = null;
const processingTimes: number[] = [];
let shouldUseLocal = false;
const activePythonProcesses = new Set<ChildProcess>();

async function checkOnline(): Promise<boolean> {
  try {
    const res = await fetch(`https://api.render.com/v1/services/${CONFIG.RENDER_SERVICE_ID}`, {
      method: 'GET',
      headers: {
        'authorization': `Bearer ${CONFIG.RENDER_API_KEY}`,
        'accept': 'application/json',
      },
    });
    const isSuspended = await res.json().then((data: any) => {
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
    console.error('checkOnline api error:', error);
    return false;
  }
}

async function useOnlineAPI(url: string, startTime: string, endTime: string, outputFile: string): Promise<string> {
  if (!CONFIG.PYTHON_API_URL) {
    throw new Error('Configuration error: PYTHON_API_URL is not set.');
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT);
  try {
    console.log(`[GIF] API : url=${url} | start_time=${startTime} | end_time=${endTime}`);
    const res = await fetch(`${CONFIG.PYTHON_API_URL}/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, start_time: startTime, end_time: endTime }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errorText = await res.text().catch(() => `Status code: ${res.status}`);
      throw new Error(`Python API failed: ${errorText}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    await fs.promises.writeFile(outputFile, buffer);
    return outputFile;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error(`Python API request timed out after ${CONFIG.API_TIMEOUT / 1000} seconds.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function useLocalPython(url: string, startTime: string, endTime: string, outputFile: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let pythonProcess: ChildProcess | undefined;

    const timeout = 120000;
    const timer = setTimeout(() => {
      if (pythonProcess) {
        pythonProcess.kill('SIGTERM');
        reject(new Error('Python process timed out after 120 seconds'));
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

async function useLocalAPI(url: string, startTime: string, endTime: string, outputFile: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT);
  try {
    console.log(`[GIF] API : url=${url} | start_time=${startTime} | end_time=${endTime}`);
    const res = await fetch('http://127.0.0.1:5000/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, start_time: startTime, end_time: endTime }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errorText = await res.text().catch(() => `Status code: ${res.status}`);
      throw new Error(`Python API failed: ${errorText}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    await fs.promises.writeFile(outputFile, buffer);
    return outputFile;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error(`Python API request timed out after ${CONFIG.API_TIMEOUT / 1000} seconds.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function enqueueGifRequest(message: any, url: string, startTime: string, endTime: string): number {
  const request: GifJob = {
    author: message.author,
    channelId: message.channel.id,
    url,
    startTime,
    endTime,
  };

  const position = requestQueue.enqueue(request);

  if (!isProcessingQueue) {
    process.nextTick(processGifQueue);
  }

  return position;
}

async function processGifQueue(): Promise<void> {
  if (requestQueue.isEmpty()) {
    console.log('[QUEUE] No queue, standing by for the next commands.');
    isProcessingQueue = false;
    currentlyProcessing = null;
    return;
  }

  isProcessingQueue = true;
  const job = requestQueue.dequeue()!;
  const processingStartTime = Date.now();
  currentlyProcessing = job;
  const { author, channelId, url, startTime, endTime } = job;

  console.log(`[QUEUE] Processing request for ${author.tag}. Queue size: ${requestQueue.size}`);

  let outputFile: string | null = null;
  let channel: any;

  try {
    channel = await client.channels.fetch(channelId);
    if (!channel) {
      throw new Error(`Could not find channel with ID ${channelId}`);
    }

    outputFile = generateOutputFilename();

    console.log(`[GIF] Started processing ${url} for ${author.tag}.`);

    const imageOutputFile = await useLocalAPI(url, startTime, endTime, outputFile);
    const attachment = new AttachmentBuilder(imageOutputFile);
    const successMessage = `${author.toString()} 👇`;
    await channel.send({
      content: successMessage,
      files: [attachment],
    });
    console.log(`[GIF] Successfully finished request for ${author.tag}.`);
  } catch (error: any) {
    console.error(`[ERROR] Failed to process GIF for ${author.tag}:`, error);

    let errorMessage = 'Sorry, an unexpected error occurred while processing your request. Please try again later.';
    if (error.message.includes('timed out')) {
      errorMessage = '⏱️ The processing took too long and timed out. Please try a shorter video segment.';
    } else if (error.message.includes('Python API failed')) {
      errorMessage = `🐍 The conversion service failed. Please check the URL and try again. (${error.message})`;
    } else {
      errorMessage = `❌ Error: ${error.message}`;
    }

    try {
      if (channel) {
        const fullErrorMessage = truncateMessage(`${author.toString()}, 😭 Error ง่ะ ตามนี้เลย เดี๋ยวให้ dev มาดูเองละกัน 😔 : ${errorMessage}`);
        await channel.send({ content: fullErrorMessage });
      }
    } catch (replyError) {
      console.error('[ERROR] Failed to send error message to user:', replyError);
    }
  } finally {
    if (outputFile) {
      try {
        await fs.promises.unlink(outputFile);
        console.log(`[CLEANUP] Deleted temporary file: ${outputFile}`);
      } catch (cleanupError: any) {
        if (cleanupError.code !== 'ENOENT') {
          console.error(`[ERROR] Failed to delete temporary file ${outputFile}:`, cleanupError);
        }
      }
    }

    const processingTime = Date.now() - processingStartTime;
    processingTimes.push(processingTime);

    if (processingTimes.length > 0) {
      const totalProcessingTime = processingTimes.reduce((acc, time) => acc + time, 0);
      const averageProcessingTime = totalProcessingTime / processingTimes.length;
      console.log(`[ANALYTICS] Job for ${author.tag} finished in ${(processingTime / 1000).toFixed(2)}s. Average processing time: ${(averageProcessingTime / 1000).toFixed(2)}s over ${processingTimes.length} jobs.`);
    }

    console.log(`[QUEUE] Finished job. Waiting for ${CONFIG.PROCESS_COOLDOWN / 1000}s cooldown.`);
    currentlyProcessing = null;

    setTimeout(() => {
      processGifQueue();
    }, CONFIG.PROCESS_COOLDOWN);
  }
}

function generateOutputFilename(): string {
  if (!fs.existsSync(CONFIG.OUTPUT_DIR)) {
    fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  return path.join(CONFIG.OUTPUT_DIR, `${timestamp}-${randomSuffix}.webp`);
}

function truncateMessage(message: string, maxLength = 1000): string {
  if (message.length <= maxLength) {
    return message;
  }
  return message.substring(0, maxLength - 3) + '...';
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

client.once('clientReady', async () => {
  console.log(`[INFO] Logged in as ${client.user!.tag}! Bot is ready.`);
  processGifQueue();
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  try {
    const helpMsg =
      'Here\'s how to use the GIF command:\n' +
      '1. Find a Twitter/X post URL that contains a video (only support x.com domain)\n' +
      '2. Use the command: `!gif [URL] [start_time] [end_time]`\n' +
      '   - `[URL]`: The Twitter/X post URL\n' +
      '   - `[start_time]`: Optional start time in `MM:SS` format (e.g., `00:10`)\n' +
      '   - `[end_time]`: Optional end time in `MM:SS` format (e.g., `00:15`)\n' +
      '\n**Example (entire video):**\n`!gif https://x.com/user/status/123456789`\n' +
      '\n**Example (from 5s to 10s):**\n`!gif https://x.com/user/status/123456789 00:05 00:10`\n' +
      '\n**Note**:\n' +
      '- Bot can process up to **5-10 seconds** of gif (of your selected time frame), Do not use long clip it may cause bot timed out.\n' +
      '- Bot will tagging you once your reqeuest is done.\n' +
      '- Rate limits may apply based on server load.';

    if (message.content.toLowerCase().trim() === '!gif help') {
      await message.reply(helpMsg);
      return;
    }

    const enhancedRegex = /^!gif\s+(https?:\/\/\S+)(?:\s+([\d:.smh]+))?(?:\s+([\d:.smh]+))?$/i;
    const match = message.content.match(enhancedRegex);

    if (match) {
      let url = match[1].trim();

      const domainsToReplace = [
        'fxtwitter.com',
        'twittpr.com',
        'fixupx.com',
        'xfixup.com',
      ];
      for (const domain of domainsToReplace) {
        const regex = new RegExp(`(https?:\/\/)(?:[a-z0-9-]+\\.)*${domain.replace('.', '\\.')}`, 'i');
        url = url.replace(regex, '$1x.com');
      }

      const timeStart = parseTime(match[2]) || '00:00';
      const timeEnd = parseTime(match[3]) || '00:00';

      enqueueGifRequest(message, url, timeStart, timeEnd);
      const responseMessage = '👌 OK รอแป๊บจ้า';
      await message.reply({ content: responseMessage });
    }
  } catch (error) {
    console.error('[ERROR] Unhandled error in messageCreate event:', error);
    try {
      await message.reply('An unexpected error occurred while handling your command. The developers have been notified.');
    } catch (e) {
      console.error('[ERROR] Failed to send final error reply:', e);
    }
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (error) => {
  console.error('[FATAL] Uncaught Exception:', error);
  process.exit(1);
});
const shutdown = (signal: string): void => {
  console.log(`[INFO] ${signal} received. Shutting down gracefully.`);
  client.destroy();
  process.exit(0);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

client.login(CONFIG.TOKEN).catch(error => {
  console.error('[FATAL] Failed to login to Discord:', error);
  process.exit(1);
});
