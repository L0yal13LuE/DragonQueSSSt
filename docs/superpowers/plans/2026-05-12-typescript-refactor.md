# TypeScript Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert all 42 JavaScript files in DragonQueSSSt to fully type-safe TypeScript, preserving file/folder structure.

**Architecture:** Dependency-bottom-up conversion following the project's layered architecture (providers → managers → core logic → entry points). Old JS files get `.deprecated` suffix; new `.ts` files live in the same directory. Use `tsx` as the runtime to run `.ts` directly without a build step.

**Tech Stack:** TypeScript 5.x, `tsx` (runtime), `zod` (schema validation + type inference), discord.js 14 (built-in types), @supabase/supabase-js 2.x (built-in types), Node.js 18+

---

## Architecture Decisions

### Module System
- Keep **CommonJS** output (`module: "CommonJS"` in tsconfig) to match existing `require/module.exports` pattern
- Use `import/export` syntax in `.ts` source files (TypeScript compiles to `require/module.exports`)
- `esModuleInterop: true` for default imports like `import dotenv from 'dotenv'`

### Runtime
- Use `tsx` as Node.js runtime — it loads `.ts` files directly with no pre-build step
- Update `package.json` scripts from `node foo.js` → `tsx foo.ts`

### Type Strategy
- **Zod schema-first**: All database row shapes, environment config, and game state defined as Zod schemas in `schemas.ts`. TypeScript types inferred via `z.infer<typeof schema>`.
- **Discord.js v14**: Use built-in types (`Client`, `Message`, `EmbedBuilder`, etc.) — no Zod needed for framework types
- **Supabase**: Use `SupabaseClient` from `@supabase/supabase-js`. Cast query results with Zod-inferred row types
- **Environment**: Type-safe env access via a Zod schema with `.parse()` on `process.env`
- **No `any`** anywhere. Every function has typed params + return type. Every variable has inferred or explicit type.

### File Renaming Convention
- `foo.js` → rename to `foo.deprecated.js`, create `foo.ts`
- `foo.cjs` → rename to `foo.deprecated.cjs`, create `foo.ts`
- Exception: files already in `deprecated/` folder — leave as-is

### Shared Schemas File
Create `schemas.ts` at root level — all data shapes defined as **Zod schemas** with TypeScript types inferred via `z.infer<typeof schema>`. This is the single source of truth for DB row shapes, env config, and game state.

---

## File Structure (after conversion)

```
root/
├── schemas.ts                            # NEW - Zod schemas + inferred types
├── tsconfig.json                         # NEW - TypeScript config
├── announcements.ts                      # CONVERTED
├── announcements.deprecated.js           # RENAMED
├── BotShiro.ts                           # CONVERTED
├── BotShiro.deprecated.js                # RENAMED
├── BotSaito.ts                           # CONVERTED (was .cjs)
├── BotSaito.deprecated.cjs               # RENAMED
├── BotSakura.ts                          # CONVERTED (was .cjs)
├── BotSakura.deprecated.cjs              # RENAMED
├── clear-commands.ts                     # CONVERTED
├── clear-commands.deprecated.js          # RENAMED
├── commandHandlers.ts                    # CONVERTED
├── commandHandlers.deprecated.js         # RENAMED
├── constants.ts                          # CONVERTED
├── constants.deprecated.js               # RENAMED
├── dbUtils.ts                            # CONVERTED
├── dbUtils.deprecated.js                 # RENAMED
├── deploy-commands.ts                    # CONVERTED
├── deploy-commands.deprecated.js         # RENAMED
├── deploy-pet-commands.ts                # CONVERTED
├── deploy-pet-commands.deprecated.js     # RENAMED
├── gameLogic.ts                          # CONVERTED
├── gameLogic.deprecated.js               # RENAMED
├── list-commands.ts                      # CONVERTED
├── list-commands.deprecated.js           # RENAMED
├── slashCommandHandler.ts                # CONVERTED
├── slashCommandHandler.deprecated.js     # RENAMED
├── supabaseClient.ts                     # CONVERTED
├── supabaseClient.deprecated.js          # RENAMED
│
├── managers/
│   ├── bagPaginationManager.ts           # CONVERTED + .deprecated.js
│   ├── cacheManager.ts                   # CONVERTED + .deprecated.js
│   ├── channelManager.ts                 # CONVERTED + .deprecated.js
│   ├── chatBot.ts                        # CONVERTED + .deprecated.js
│   ├── clanDonationManager.ts            # CONVERTED + .deprecated.js
│   ├── craftManager.ts                   # CONVERTED + .deprecated.js
│   ├── craftPaginationManager.ts         # CONVERTED + .deprecated.js
│   ├── embedManager.ts                   # CONVERTED + .deprecated.js
│   ├── fishingManager.ts                 # CONVERTED + .deprecated.js
│   ├── itemManager.ts                    # CONVERTED + .deprecated.js
│   ├── leaderBoardManager.ts             # CONVERTED + .deprecated.js
│   ├── materialManager.ts                # CONVERTED + .deprecated.js
│   ├── petManager.ts                     # CONVERTED + .deprecated.js
│   ├── shopManager.ts                    # CONVERTED + .deprecated.js
│   ├── shopWorkshop.ts                   # CONVERTED + .deprecated.js
│   ├── spinManager.ts                    # CONVERTED + .deprecated.js
│   ├── utilityManager.ts                 # CONVERTED + .deprecated.js
│   │
│   ├── agent/
│   │   ├── Conversation-Shiro.ts         # CONVERTED + .deprecated.js
│   │   ├── Conversation-Assistant2.ts    # CONVERTED + .deprecated.js
│   │   └── tools/
│   │       ├── SearchDecisionTool.ts     # CONVERTED + .deprecated.js
│   │       ├── SearchExaTool.ts          # CONVERTED + .deprecated.js
│   │       └── SearchGoogleTool.ts       # CONVERTED + .deprecated.js
│   │
│   ├── game/
│   │   └── assembleManager.ts            # CONVERTED + .deprecated.js
│   │
│   ├── leaderboard/
│   │   └── leaderboardManager.ts         # CONVERTED + .deprecated.js
│   │
│   └── utils/
│       └── AsyncQueue.ts                 # CONVERTED + .deprecated.js
│
└── providers/
    ├── cacheProvider.ts                  # CONVERTED + .deprecated.js
    ├── channelProvider.ts                # CONVERTED + .deprecated.js
    ├── configProvider.ts                 # CONVERTED + .deprecated.js
    ├── materialProvider.ts               # CONVERTED + .deprecated.js
    ├── monsterProvider.ts                # CONVERTED + .deprecated.js
    ├── rarityProvider.ts                 # CONVERTED + .deprecated.js
    ├── spinProvider.ts                   # CONVERTED + .deprecated.js
    └── userProvider.ts                   # CONVERTED + .deprecated.js
```

---

## Conversion Pattern Reference

Every JS→TS conversion follows this exact pattern. This is the standard template — tasks below reference it rather than repeating it.

### Zod Schema Declaration (schemas.ts)
All database row shapes and env config are defined as Zod schemas. Types are **inferred**, never hand-written.

```typescript
import { z } from 'zod';

// ─── Environment ──────────────────────────────────────────────────────────
export const EnvSchema = z.object({
  SUPABASE_URL: z.string(),
  SUPABASE_KEY: z.string(),
  DISCORD_TOKEN: z.string(),
  DISCORD_CLIENT_ID: z.string(),
  DISCORD_GUILD_ID: z.string(),
  GROQ_API_KEY: z.string().optional(),
  MISTRAL_API_KEY: z.string().optional(),
  EXA_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
});
export type EnvConfig = z.infer<typeof EnvSchema>;

// ─── Database Row Schemas ────────────────────────────────────────────────
export const UserRowSchema = z.object({
  id: z.string(),
  username: z.string(),
  display_name: z.string().nullable().optional(),
  level: z.number(),
  exp: z.number(),
  coin: z.number(),
  created_at: z.string().optional(),
});
export type UserRow = z.infer<typeof UserRowSchema>;

// Consumers import the TYPE (not schema) when only using for typing:
//   import type { UserRow, MaterialRow } from '../schemas';
// Import the SCHEMA when runtime validation is needed:
//   import { EnvSchema } from '../schemas';
```

### Standard Import Conversion
```typescript
// BEFORE (JS):
const { EmbedBuilder } = require('discord.js');

// AFTER (TS):
import { EmbedBuilder, type Message, type User } from 'discord.js';
```

### Standard Export Conversion
```typescript
// BEFORE (JS):
module.exports = { myFunction, myVariable };

// AFTER (TS):
export function myFunction(param: string): ReturnType { ... }
export const myVariable: Type = value;
```

### Function Signature Typing (with Zod types)
```typescript
// BEFORE (JS):
async function getUserData(userId) {
  const { data } = await supabase.from('users').select('*').eq('id', userId);
  return data;
}

// AFTER (TS):
import type { UserRow } from './schemas';

async function getUserData(userId: string): Promise<UserRow | null> {
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();
  return data as UserRow | null;
}
```

### Supabase Query Typing
```typescript
// Use `as` for row-level casting after queries
const { data, error } = await supabase
  .from('materials')
  .select('*') as { data: MaterialRow[] | null; error: PostgrestError | null };
```

### Discord Event Handler Typing
```typescript
client.on(Events.MessageCreate, async (message: Message) => {
  // message is fully typed
});
```

---

## Task Breakdown

### Task 1: Project Setup — TypeScript + tsx + Zod + tsconfig + shared schemas

**Files:**
- Create: `tsconfig.json` (root)
- Create: `schemas.ts` (root)
- Modify: `package.json`
- Run: `npm install`

- [ ] **Step 1: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": false,
    "outDir": "./dist",
    "rootDir": ".",
    "sourceMap": true,
    "types": ["node"]
  },
  "include": ["./**/*.ts"],
  "exclude": ["node_modules", "dist", "**/*.deprecated.*"]
}
```

- [ ] **Step 2: Install TypeScript + tsx**

Run: `npm install zod && npm install --save-dev typescript tsx @types/node`

- [ ] **Step 3: Create shared schemas.ts with Zod**

This file defines all data shapes as **Zod schemas** and exports **inferred TypeScript types**. Every DB row, game state, and config shape lives here.

```typescript
import { z } from 'zod';

// ─── Environment ──────────────────────────────────────────────────────────
export const EnvSchema = z.object({
  SUPABASE_URL: z.string(),
  SUPABASE_KEY: z.string(),
  DISCORD_TOKEN: z.string(),
  DISCORD_CLIENT_ID: z.string(),
  DISCORD_GUILD_ID: z.string(),
  GROQ_API_KEY: z.string().optional(),
  MISTRAL_API_KEY: z.string().optional(),
  EXA_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
});
export type EnvConfig = z.infer<typeof EnvSchema>;

// ─── Database Row Schemas ─────────────────────────────────────────────────
export const UserRowSchema = z.object({
  id: z.string(),
  username: z.string(),
  display_name: z.string().nullable().optional(),
  level: z.number(),
  exp: z.number(),
  coin: z.number(),
  created_at: z.string().optional(),
});
export type UserRow = z.infer<typeof UserRowSchema>;

export const MaterialRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  rarity: z.string(),
  emoji: z.string().nullable().optional(),
  area: z.string().nullable().optional(),
  base_drop_rate: z.number().nullable().optional(),
  image: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  created_at: z.string().optional(),
});
export type MaterialRow = z.infer<typeof MaterialRowSchema>;

export const UserMaterialRowSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  material_id: z.string(),
  quantity: z.number(),
  updated_at: z.string().optional(),
});
export type UserMaterialRow = z.infer<typeof UserMaterialRowSchema>;

export const MonsterRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  hp: z.number(),
  max_hp: z.number(),
  level: z.number(),
  area: z.string(),
  channel_id: z.string().nullable().optional(),
  is_event: z.boolean().nullable().optional(),
  created_at: z.string().optional(),
  image: z.string().nullable().optional(),
});
export type MonsterRow = z.infer<typeof MonsterRowSchema>;

export const RarityRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  multiplier: z.number(),
  order: z.number(),
});
export type RarityRow = z.infer<typeof RarityRowSchema>;

export const ChannelConfigRowSchema = z.object({
  id: z.string(),
  channel_id: z.string(),
  area: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  is_active: z.boolean().nullable().optional(),
});
export type ChannelConfigRow = z.infer<typeof ChannelConfigRowSchema>;

export const ConfigRowSchema = z.object({
  id: z.string(),
  key: z.string(),
  value: z.string(),
});
export type ConfigRow = z.infer<typeof ConfigRowSchema>;

export const SpinRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  pool: z.string(),
  cost: z.number(),
  items: z.array(z.string()).optional(),
});
export type SpinRow = z.infer<typeof SpinRowSchema>;

export const ClanDonationRowSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  material_id: z.string(),
  quantity: z.number(),
  claimed: z.boolean(),
  created_at: z.string().optional(),
});
export type ClanDonationRow = z.infer<typeof ClanDonationRowSchema>;

// ─── Cache Types ──────────────────────────────────────────────────────────
export interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

// ─── Game State Schemas ───────────────────────────────────────────────────
export const AssembleGameStateSchema = z.object({
  player1: z.string(),
  player2: z.string(),
  targetNumber: z.number(),
  currentTurn: z.string(),
  guesses: z.record(z.array(z.number())),
  hints: z.array(z.string()),
  startedAt: z.number(),
});
export type AssembleGameState = z.infer<typeof AssembleGameStateSchema>;

export const PetStateSchema = z.object({
  userId: z.string(),
  name: z.string(),
  type: z.string(),
  energy: z.number(),
  level: z.number(),
  exp: z.number(),
  isTraveling: z.boolean(),
  returnAt: z.number().nullable().optional(),
});
export type PetState = z.infer<typeof PetStateSchema>;

export const PaginationStateSchema = z.object({
  userId: z.string(),
  page: z.number(),
  totalPages: z.number(),
  data: z.array(z.unknown()),
  timestamp: z.number(),
});
export type PaginationState = z.infer<typeof PaginationStateSchema>;

// ─── Manager Response Types ───────────────────────────────────────────────
export interface ActionResult {
  success: boolean;
  message: string;
  data?: unknown;
  error?: string;
}
```

**Consumption pattern in other files:**
```typescript
// When only the TYPE is needed (most common):
import type { UserRow, MaterialRow } from '../schemas';

// When runtime validation is needed (e.g., env config):
import { EnvSchema } from '../schemas';
const env = EnvSchema.parse(process.env);
```

- [ ] **Step 4: Update package.json scripts**

```json
{
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1",
    "start": "tsx BotShiro.ts",
    "start:blue": "cross-env NODE_ENV=blue tsx BotShiro.ts",
    "start:staging": "cross-env NODE_ENV=staging tsx BotShiro.ts",
    "start:prod": "cross-env NODE_ENV=production tsx BotShiro.ts",
    "saito": "tsx BotSaito.ts",
    "saito:prod": "cross-env NODE_ENV=production tsx BotSaito.ts",
    "sakura": "tsx BotSakura.ts",
    "sakura:prod": "cross-env NODE_ENV=production tsx BotSakura.ts",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 5: Install dependencies and verify**

Run: `npm install`
Run: `npx tsc --noEmit` — Expected: zero errors (only `import` statements, no logic yet)

- [ ] **Step 6: Create `.gitignore` entry for deprecated files**

Append to `.gitignore`:
```
*.deprecated.*
```

---

### Task 2: Leaf Dependency Files — constants, supabaseClient, AsyncQueue, utilityManager

These files have zero internal project dependencies. Convert them first.

**Files:**
- Modify: `constants.js` → `constants.ts`
- Modify: `supabaseClient.js` → `supabaseClient.ts`
- Modify: `managers/utils/AsyncQueue.js` → `managers/utils/AsyncQueue.ts`
- Modify: `managers/utilityManager.js` → `managers/utilityManager.ts`

**Conversion pattern for each:**

- [ ] **Step 1: Rename each .js → .deprecated.js**

For every file:
```bash
# For each file in this task:
# Rename-Item -LiteralPath "path/to/foo.js" -NewName "foo.deprecated.js"
```

- [ ] **Step 2: Create constants.ts**

```typescript
export const COMMAND_PREFIX: string = '!';
export const CACHE_TTL: number = 300; // 5 minutes in seconds
export const EXP_PER_MESSAGE: number = 10;
export const EXP_PER_MONSTER_KILL: number = 50;
export const LEVEL_MULTIPLIER: number = 1.5;
export const COOLDOWN_SECONDS: number = 3;

export const CAT_REPLIES: string[] = [
  'meow~',
  'nya~',
  'purrr...',
];

export function GET_CHANCE(percent: number): boolean {
  return Math.random() * 100 < percent;
}
```

Key points:
- All numeric/string literals get `: number` / `: string` / `: string[]` annotations
- `GET_CHANCE` gets typed params and return type

- [ ] **Step 3: Create supabaseClient.ts**

```typescript
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl: string | undefined = process.env.SUPABASE_URL;
const supabaseKey: string | undefined = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL and SUPABASE_KEY must be defined in .env');
}

const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);

export default supabase;
```

- [ ] **Step 4: Create managers/utils/AsyncQueue.ts**

Full type-safe queue with generic types:
```typescript
interface QueueNode<T> {
  value: T;
  next: QueueNode<T> | null;
}

export class AsyncQueue<T> {
  private head: QueueNode<T> | null = null;
  private tail: QueueNode<T> | null = null;
  private size: number = 0;
  private worker: (item: T) => Promise<void>;

  constructor(worker: (item: T) => Promise<void>) {
    this.worker = worker;
  }

  enqueue(value: T): void { ... }
  async processNext(): Promise<void> { ... }
  getSize(): number { return this.size; }
  isEmpty(): boolean { return this.size === 0; }
}
```

- [ ] **Step 5: Create managers/utilityManager.ts**

```typescript
export function paginateArray<T>(array: T[], page: number, pageSize: number): T[] {
  const start: number = (page - 1) * pageSize;
  const end: number = start + pageSize;
  return array.slice(start, end);
}
```

- [ ] **Step 6: Run typecheck**

Run: `npx tsc --noEmit` — Expected: zero errors

---

### Task 3: Provider Layer — all 8 supabase data providers

These are thin query wrappers around Supabase, all following the same pattern. Convert as a batch.

**Files:**
- `providers/cacheProvider.ts` (note: this is file-based cache, NOT Supabase)
- `providers/channelProvider.ts`
- `providers/configProvider.ts`
- `providers/materialProvider.ts`
- `providers/monsterProvider.ts`
- `providers/rarityProvider.ts`
- `providers/spinProvider.ts`
- `providers/userProvider.ts`

- [ ] **Step 1: Rename all 8 .js → .deprecated.js**

- [ ] **Step 2: Create cacheProvider.ts**

```typescript
import fs from 'fs';
import path from 'path';

export class CacheProvider {
  private basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath ?? path.join(process.cwd(), '.cache');
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
    }
  }

  get<T>(key: string): T | null { ... }
  set<T>(key: string, value: T, ttlSeconds?: number): void { ... }
  delete(key: string): void { ... }
  clear(): void { ... }
}
```

- [ ] **Step 3: Create channelProvider.ts**

```typescript
import supabase from '../supabaseClient';
import type { ChannelConfigRow } from '../schemas';

export async function getChannelById(channelId: string): Promise<ChannelConfigRow | null> {
  const { data, error } = await supabase
    .from('channels')
    .select('*')
    .eq('channel_id', channelId)
    .single();
  if (error) return null;
  return data as ChannelConfigRow;
}

export async function getAllChannels(): Promise<ChannelConfigRow[]> {
  const { data, error } = await supabase
    .from('channels')
    .select('*');
  if (error) return [];
  return (data as ChannelConfigRow[]) ?? [];
}
```

- [ ] **Step 4: Create the remaining 6 provider files** (same pattern as above)

Each follows the exact same Supabase query pattern with typed return values.

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit` — Expected: zero errors

---

### Task 4: Embed Manager + Cache Manager + Channel Manager

**Files:**
- `managers/embedManager.ts`
- `managers/cacheManager.ts`
- `managers/channelManager.ts`

- [ ] **Step 1: Rename .js → .deprecated.js for all 3 files**

- [ ] **Step 2: Create embedManager.ts**

embedManager.js is 378 lines of embed builder functions. Key typing:

```typescript
import { EmbedBuilder, type ColorResolvable } from 'discord.js';

interface EmbedOptions {
  title?: string;
  description?: string;
  color?: ColorResolvable;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  thumbnail?: string;
  image?: string;
  footer?: string;
  timestamp?: boolean;
}

export function createBasicEmbed(options: EmbedOptions): EmbedBuilder { ... }
export function createRankEmbed(username: string, level: number, exp: number, nextLevelExp: number): EmbedBuilder { ... }
export function createBagEmbed(items: Array<{ name: string; quantity: number; emoji?: string }>, page: number): EmbedBuilder { ... }
export function createMonsterEmbed(monster: { name: string; hp: number; maxHp: number; level: number; image?: string }): EmbedBuilder { ... }
// ... all other embed functions with full type annotations
```

- [ ] **Step 3: Create cacheManager.ts**

```typescript
import type { RarityRow, ChannelConfigRow, MaterialRow } from '../schemas';
import { CACHE_TTL } from '../constants';
import * as rarityProvider from '../providers/rarityProvider';
import * as channelProvider from '../providers/channelProvider';
import * as materialProvider from '../providers/materialProvider';
import { CacheProvider } from '../providers/cacheProvider';

export class CacheManager {
  private cache: CacheProvider;
  public rarities: RarityRow[] = [];
  public channels: ChannelConfigRow[] = [];
  public materials: MaterialRow[] = [];

  constructor() {
    this.cache = new CacheProvider();
  }

  async preloadAll(): Promise<void> { ... }
  async fetchWithCache<T>(key: string, fetcher: () => Promise<T>, ttl?: number): Promise<T> { ... }
  invalidate(key: string): void { ... }
}
```

- [ ] **Step 4: Create channelManager.ts**

```typescript
import type { ChannelConfigRow } from '../schemas';
import { cacheManager } from './cacheManager';
import * as channelProvider from '../providers/channelProvider';

export async function getChannelConfig(channelId: string): Promise<ChannelConfigRow | null> {
  return cacheManager.fetchWithCache(`channel:${channelId}`, () =>
    channelProvider.getChannelById(channelId)
  );
}
```

- [ ] **Step 5: Run typecheck**

---

### Task 5: Agent Tools + Conversations + ChatBot

These files handle AI API calls (Groq, Mistral, Exa, Google Gemini). They are self-contained apart from importing `constants.ts`.

**Files (6):**
- `managers/agent/tools/SearchDecisionTool.ts`
- `managers/agent/tools/SearchExaTool.ts`
- `managers/agent/tools/SearchGoogleTool.ts`
- `managers/agent/Conversation-Shiro.ts`
- `managers/agent/Conversation-Assistant2.ts`
- `managers/chatBot.ts`

- [ ] **Step 1: Rename all 6 .js → .deprecated.js**

- [ ] **Step 2: Convert agents/tools (3 files)**

Each tool wraps an external API. Pattern:

```typescript
// SearchExaTool.ts
import dotenv from 'dotenv';
dotenv.config();

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  date?: string;
}

export async function searchExa(query: string, maxResults?: number): Promise<SearchResult[]> {
  const apiKey: string | undefined = process.env.EXA_API_KEY;
  if (!apiKey) throw new Error('EXA_API_KEY not configured');

  // ... typed fetch logic
  return results;
}
```

- [ ] **Step 3: Convert Conversation-Shiro.ts and Conversation-Assistant2.ts**

Each conversation file holds a system prompt + API call wrapper. Add types for:
- Message history (`Array<{ role: 'user' | 'assistant' | 'system'; content: string }>`)
- Response types
- Configuration params

- [ ] **Step 4: Convert chatBot.ts**

Imports from agents + tools + AsyncQueue. Typed queue management:

```typescript
import type { Message } from 'discord.js';
import { AsyncQueue } from './utils/AsyncQueue';
import { ConversationShiro } from './agent/Conversation-Shiro';
import { ConversationAssistant2 } from './agent/Conversation-Assistant2';

interface ChatJob {
  message: Message;
  prompt: string;
  conversationType: 'shiro' | 'assistant2';
}

export class ChatBot {
  private queue: AsyncQueue<ChatJob> = new AsyncQueue(this.processJob.bind(this));

  async enqueue(message: Message, prompt: string, type: 'shiro' | 'assistant2'): Promise<void> { ... }
  private async processJob(job: ChatJob): Promise<void> { ... }
}
```

- [ ] **Step 5: Run typecheck**

---

### Task 6: Core Logic — dbUtils, gameLogic, announcements

These files contain the core game mechanics. They are the most complex with the most inter-dependencies.

**Files:**
- `dbUtils.ts`
- `gameLogic.ts`
- `announcements.ts`

- [ ] **Step 1: Rename .js → .deprecated.js for all 3**

- [ ] **Step 2: Create dbUtils.ts**

All database CRUD operations. Add full typing for every query:

```typescript
import supabase from './supabaseClient';
import type { UserRow, MaterialRow, UserMaterialRow, MonsterRow, ClanDonationRow } from './schemas';

export async function getUser(userId: string): Promise<UserRow | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();
  if (error || !data) return null;
  return data as UserRow;
}

export async function upsertUser(user: Partial<UserRow> & { id: string }): Promise<boolean> { ... }
export async function getUserMaterials(userId: string): Promise<UserMaterialRow[]> { ... }
export async function addUserMaterial(userId: string, materialId: string, quantity: number): Promise<boolean> { ... }
export async function deductUserMaterial(userId: string, materialId: string, quantity: number): Promise<boolean> { ... }
export async function getUserMonsterDamage(userId: string, monsterId: string): Promise<number> { ... }
// ... all other functions
```

- [ ] **Step 3: Create gameLogic.ts**

Core game mechanics with typed Discord interaction:

```typescript
import type { Message, TextChannel } from 'discord.js';
import supabase from './supabaseClient';
import * as constants from './constants';
import * as dbUtils from './dbUtils';
import * as announcements from './announcements';
import * as itemManager from './managers/itemManager';
import * as monsterProvider from './providers/monsterProvider';
import * as channelManager from './managers/channelManager';
import type { UserRow, MonsterRow } from './schemas';

export function calculateExpGain(messageLength: number, level: number): number { ... }
export function calculateLevel(exp: number): number { ... }
export function expToNextLevel(currentLevel: number): number { ... }
export async function handleMessageExp(message: Message): Promise<void> { ... }
export async function spawnMonster(channel: TextChannel): Promise<void> { ... }
export async function processMonsterDamage(userId: string, monsterId: string, damage: number): Promise<boolean> { ... }
export async function checkHourlyMonsterSpawn(): Promise<void> { ... }
```

- [ ] **Step 4: Create announcements.ts**

Typed Discord embed announcements:

```typescript
import type { TextChannel, User } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import supabase from './supabaseClient';
import * as dbUtils from './dbUtils';
import * as embedManager from './managers/embedManager';
import * as gameLogic from './gameLogic';
import type { UserRow, MonsterRow, MaterialRow } from './schemas';

export async function announceLevelUp(user: User, newLevel: number): Promise<void> { ... }
export async function announceMonsterSpawn(channel: TextChannel, monster: MonsterRow): Promise<void> { ... }
export async function announceMonsterDefeat(channel: TextChannel, monster: MonsterRow, participants: UserRow[]): Promise<void> { ... }
export async function announceItemDrop(channel: TextChannel, user: User, item: MaterialRow): Promise<void> { ... }
export async function announceItemTransfer(from: User, to: User, item: MaterialRow, quantity: number): Promise<void> { ... }
export async function announceSpinResult(channel: TextChannel, user: User, result: string): Promise<void> { ... }
```

- [ ] **Step 5: Run typecheck**

---

### Task 7: Material + Item Managers

**Files:**
- `managers/materialManager.ts`
- `managers/itemManager.ts`

- [ ] **Step 1: Rename .js → .deprecated.js**

- [ ] **Step 2: Create materialManager.ts**

```typescript
import type { MaterialRow } from '../schemas';
import { GET_CHANCE } from '../constants';
import * as cacheManager from './cacheManager';
import * as materialProvider from '../providers/materialProvider';

export async function getMaterialForChannel(channelId: string): Promise<MaterialRow | null> { ... }
export function calculateDrop(material: MaterialRow, rarityMultiplier: number): boolean { ... }
export async function addItemToUser(userId: string, materialId: string, quantity: number): Promise<boolean> { ... }
export async function deductItemFromUser(userId: string, materialId: string, quantity: number): Promise<boolean> { ... }
```

- [ ] **Step 3: Create itemManager.ts**

```typescript
import type { MaterialRow, RarityRow } from '../schemas';
import supabase from '../supabaseClient';
import * as materialManager from './materialManager';
import * as materialProvider from '../providers/materialProvider';
import * as configProvider from '../providers/configProvider';
import * as announcements from '../announcements';

export async function rollForDrop(channelId: string, area: string): Promise<MaterialRow | null> { ... }
export function calculateWeightedDrop(materials: MaterialRow[], rarities: RarityRow[]): MaterialRow { ... }
```

- [ ] **Step 4: Run typecheck**

---

### Task 8: Feature Managers Batch 1 — Craft + Bag + Clan

**Files:**
- `managers/craftManager.ts`
- `managers/craftPaginationManager.ts`
- `managers/bagPaginationManager.ts`
- `managers/clanDonationManager.ts`

**Common pattern:** All 4 handle Discord button interactions with `ActionRowBuilder`, `ButtonBuilder`, paginated menus. Key typing concern: interaction collectors, pagination state.

- [ ] **Step 1: Rename .js → .deprecated.js**

- [ ] **Step 2: Convert each file with these type patterns:**

```typescript
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Message,
  type Interaction,
  type MessageComponentInteraction,
  MessageFlags,
} from 'discord.js';

interface CraftItem {
  id: string;
  name: string;
  materials: Array<{ materialId: string; quantity: number }>;
  result: string;
}

export async function showCraftMenu(message: Message): Promise<void> {
  // Build paginated craft embed with typed state
}

export async function handleCraftInteraction(interaction: MessageComponentInteraction): Promise<void> {
  // Handle button clicks with typed interaction
}
```

- [ ] **Step 3: Run typecheck**

---

### Task 9: Feature Managers Batch 2 — Shop, Spin, Pet, Fishing, Assemble, Leaderboard

**Files:**
- `managers/shopManager.ts`
- `managers/shopWorkshop.ts`
- `managers/spinManager.ts`
- `managers/petManager.ts`
- `managers/fishingManager.ts`
- `managers/game/assembleManager.ts`
- `managers/leaderboard/leaderboardManager.ts`

- [ ] **Step 1: Rename .js → .deprecated.js**

- [ ] **Step 2: Convert shopManager.ts**

Select-menu based shop with typed items and pricing:

```typescript
import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  EmbedBuilder,
  type MessageComponentInteraction,
  type AnySelectMenuInteraction,
  MessageFlags,
} from 'discord.js';

interface ShopItem {
  id: string;
  name: string;
  price: number;
  emoji?: string;
  category: string;
}

export async function showShopMenu(interaction: AnySelectMenuInteraction | Message): Promise<void> { ... }
export async function handleShopPurchase(interaction: MessageComponentInteraction, itemId: string): Promise<void> { ... }
```

- [ ] **Step 3: Convert remaining 6 manager files**

Each follows Discord interaction patterns with typed collectors, embeds, and state management.

- [ ] **Step 4: Run typecheck**

---

### Task 10: Command Handlers — prefix and slash

**Files:**
- `commandHandlers.ts`
- `slashCommandHandler.ts`

- [ ] **Step 1: Rename .js → .deprecated.js**

- [ ] **Step 2: Create commandHandlers.ts**

Prefix command handlers (`!rank`, `!bag`, `!chat`, etc.):

```typescript
import type { Message } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import supabase from './supabaseClient';
import * as dbUtils from './dbUtils';
import * as gameLogic from './gameLogic';
import * as materialProvider from './providers/materialProvider';
import * as embedManager from './managers/embedManager';

interface CommandHandler {
  (message: Message, args: string[]): Promise<void>;
}

const commands: Record<string, CommandHandler> = {
  rank: async (message: Message, args: string[]) => { ... },
  bag: async (message: Message, args: string[]) => { ... },
  monster: async (message: Message, args: string[]) => { ... },
  chat: async (message: Message, args: string[]) => { ... },
  bag_dm: async (message: Message, args: string[]) => { ... },
};

export async function handleCommand(message: Message): Promise<void> {
  const prefix: string = '!';
  if (!message.content.startsWith(prefix)) return;

  const args: string[] = message.content.slice(prefix.length).trim().split(/\s+/);
  const command: string = args.shift()?.toLowerCase() ?? '';

  const handler = commands[command];
  if (handler) {
    await handler(message, args);
  }
}
```

- [ ] **Step 3: Create slashCommandHandler.ts**

Slash command handler (`/send` with autocomplete):

```typescript
import type { CommandInteraction, AutocompleteInteraction } from 'discord.js';
import { MessageFlags } from 'discord.js';
import * as constants from './constants';
import * as cacheProvider from './providers/cacheProvider';
import * as materialProvider from './providers/materialProvider';
import * as materialManager from './managers/materialManager';
import * as announcements from './announcements';

export async function handleSendCommand(interaction: CommandInteraction): Promise<void> { ... }
export async function handleSendAutocomplete(interaction: AutocompleteInteraction): Promise<void> { ... }
```

- [ ] **Step 4: Run typecheck**

---

### Task 11: Entry Points + Utility Scripts

**Files:**
- `BotShiro.ts` (main bot — 617 lines)
- `BotSaito.ts` (GIF bot — was .cjs)
- `BotSakura.ts` (GIF bot v2 — was .cjs)
- `deploy-commands.ts`
- `deploy-pet-commands.ts`
- `clear-commands.ts`
- `list-commands.ts`

- [ ] **Step 1: Rename .js / .cjs → .deprecated.js / .deprecated.cjs**

- [ ] **Step 2: Create BotShiro.ts**

The main bot entry point. Full Discord Client setup with typed events:

```typescript
import dotenv from 'dotenv';
dotenv.config();

import {
  Client,
  GatewayIntentBits,
  Collection,
  Events,
  Partials,
  type Message,
  type Interaction,
  type TextChannel,
} from 'discord.js';

import supabase from './supabaseClient';
import * as constants from './constants';
import * as gameLogic from './gameLogic';
import * as announcements from './announcements';
import * as commandHandlers from './commandHandlers';
import * as slashCommandHandler from './slashCommandHandler';
import { CacheManager } from './managers/cacheManager';
// ... other imports

// Type-safe client config
const client: Client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel],
});

// Typed event handlers
client.once(Events.ClientReady, async (readyClient: Client<true>) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  const cacheManager = new CacheManager();
  await cacheManager.preloadAll();
  // ...
});

client.on(Events.MessageCreate, async (message: Message) => {
  if (message.author.bot) return;
  await gameLogic.handleMessageExp(message);
  await commandHandlers.handleCommand(message);
});

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand()) return;
  await slashCommandHandler.handleSendCommand(interaction);
});

// Login with typed env check
const token: string | undefined = process.env.DISCORD_TOKEN;
if (!token) throw new Error('DISCORD_TOKEN not configured');
client.login(token);
```

- [ ] **Step 3: Create BotSaito.ts and BotSakura.ts**

GIF processing bots. These use `child_process.spawn` for Python ffmpeg subprocess. Key typings:

```typescript
import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import { Client, GatewayIntentBits, Partials, AttachmentBuilder, type Message } from 'discord.js';
import type { EnvConfig } from './schemas';

interface RateLimitEntry {
  userId: string;
  count: number;
  resetAt: number;
}

export class SaitoBot {
  private client: Client;
  private rateLimits: Map<string, RateLimitEntry> = new Map();
  private activeProcesses: Map<string, ChildProcess> = new Map();

  constructor() { ... }
  async start(): Promise<void> { ... }
  private async handleGifRequest(message: Message): Promise<void> { ... }
  private async processVideo(url: string, messageId: string): Promise<Buffer | null> { ... }
  private checkRateLimit(userId: string): boolean { ... }
}
```

- [ ] **Step 4: Create utility scripts (deploy-commands.ts, etc.)**

All use `REST` and `Routes` from discord.js with full typing:

```typescript
import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

const token: string | undefined = process.env.DISCORD_TOKEN;
const clientId: string | undefined = process.env.DISCORD_CLIENT_ID;

if (!token || !clientId) {
  throw new Error('DISCORD_TOKEN and DISCORD_CLIENT_ID required');
}

const commands: SlashCommandBuilder[] = [
  new SlashCommandBuilder()
    .setName('send')
    .setDescription('Send items to another user')
    .addStringOption(option =>
      option.setName('item').setDescription('Item to send').setRequired(true).setAutocomplete(true)
    )
    .addUserOption(option =>
      option.setName('user').setDescription('Recipient').setRequired(true)
    ),
  // ... more commands
];

const rest: REST = new REST({ version: '10' }).setToken(token);

export async function deployCommands(): Promise<void> {
  try {
    await rest.put(Routes.applicationCommands(clientId), {
      body: commands.map(cmd => cmd.toJSON()),
    });
    console.log('Commands deployed successfully');
  } catch (error) {
    console.error('Failed to deploy commands:', error);
  }
}

deployCommands();
```

- [ ] **Step 5: Run typecheck**

---

### Task 12: Legacy Leaderboard Manager

**File:** `managers/leaderBoardManager.ts` (deprecated, used only by deprecated BotCoco)

This is a low-priority convert since the only consumer is already in `deprecated/`. Convert it to prevent import errors in the TS build.

- [ ] **Step 1: Rename .js → .deprecated.js**

- [ ] **Step 2: Create leaderBoardManager.ts** following the same pattern as other provider-wrapping managers

- [ ] **Step 3: Run typecheck**

---

### Task 13: Final Verification

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit` — Expected: zero errors

- [ ] **Step 2: Test bot startup**

Run: `npm run start` — observe console output for 30 seconds, verify bot connects

- [ ] **Step 3: Test Saito/Sakura startup**

Run: `npm run saito` — verify Python subprocess pipeline works
Run: `npm run sakura` — verify same

- [ ] **Step 4: Test utility scripts**

Run: `tsx list-commands.ts` — verify slash commands listed
Run: `tsx clear-commands.ts` — verify commands cleared
Run: `tsx deploy-commands.ts` — verify commands re-deployed

- [ ] **Step 5: Final status**

Verify directory structure — all `.ts` files present, all old files have `.deprecated` suffix.

---

## Dependency Order Validation

```
                   ┌──────────────┐
                   │  schemas.ts  │ (no deps — Zod + z.infer)
                   │  constants   │ (no deps)
                   │  supabase    │ (no deps)
                   └──────┬───────┘
                          │
              ┌───────────┴───────────┐
              │                       │
     ┌────────▼────────┐    ┌────────▼────────┐
     │   providers/    │    │  AsyncQueue     │
     │   (8 files)     │    │  utilityManager │
     └────────┬────────┘    └────────┬────────┘
              │                      │
     ┌────────▼────────┐            │
     │  cacheManager   │            │
     │  embedManager   │            │
     └────────┬────────┘            │
              │                     │
     ┌────────▼────────┐            │
     │  channelManager │            │
     │  materialManager│            │
     └────────┬────────┘            │
              │                     │
     ┌────────▼────────┐  ┌────────▼────────┐
     │  itemManager    │  │  agent tools    │
     │  dbUtils        │  │  conversations  │
     │  gameLogic      │  │  chatBot        │
     │  announcements  │  └─────────────────┘
     └────────┬────────┘
              │
     ┌────────▼────────┐
     │  feature mgrs   │
     │  (craft, shop,  │
     │   pet, spin...) │
     └────────┬────────┘
              │
     ┌────────▼────────┐
     │  commandHandlers│
     │  slashCmdHandler│
     └────────┬────────┘
              │
     ┌────────▼────────┐
     │  BotShiro       │
     │  BotSaito       │
     │  BotSakura      │
     └─────────────────┘
```

Conversion order follows leaf-to-root: tasks 2→3→4→5→6→7→8→9→10→11. Each task only depends on files from previous tasks.

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Original JS lost after rename | Deprecated suffix is reversible (`git mv`). Git preserves history |
| Type errors in Supabase queries | Use explicit `as Type[]` casts (where Type is a Zod-inferred type) after `select('*')` |
| Discord.js type mismatch | discord.js 14.24.2 ships its own types — pin exact version |
| Environment var undefined at runtime | Throw explicitly in supabaseClient.ts if missing |
| Big Bang integration failure | Run `tsc --noEmit` after EVERY task. Never advance past a failing task |
| `.cjs` → `.ts` module issues | `tsx` handles mixed module systems — test immediately after conversion |
