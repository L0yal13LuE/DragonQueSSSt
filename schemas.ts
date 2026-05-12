import { z } from 'zod';

// ─── Environment ──────────────────────────────────────────────────────────
export const EnvSchema = z.object({
  SUPABASE_URL: z.string(),
  SUPABASE_KEY: z.string(),
  DISCORD_TOKEN: z.string(),
  DISCORD_CLIENT_ID: z.string().optional(),
  DISCORD_GUILD_ID: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  MISTRAL_API_KEY: z.string().optional(),
  EXA_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  ANNOUNCEMENT_CHANNEL_ID: z.string().optional(),
  ITEM_DROP_CHANNEL_ID: z.string().optional(),
  DAMAGE_LOG_CHANNEL_ID: z.string().optional(),
  LEVEL_CHANNEL_ID: z.string().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  CLIENT_ID: z.string().optional(),
  GUILD_ID: z.string().optional(),
  NODE_ENV: z.string().optional(),
  CMD_PYTHON: z.string().optional(),
  PYTHON_API_URL: z.string().optional(),
  RENDER_API_KEY: z.string().optional(),
  RENDER_SERVICE_ID: z.string().optional(),
});
export type EnvConfig = z.infer<typeof EnvSchema>;

// ─── Database Row Schemas ──────────────────────────────────────────────────
export const UserRowSchema = z.object({
  id: z.string(),
  username: z.string(),
  display_name: z.string().nullable().optional(),
  level: z.number(),
  current_exp: z.number(),
  coin: z.number().optional(),
  last_online_timestamp: z.string().nullable().optional(),
  created_at: z.string().optional(),
});
export type UserRow = z.infer<typeof UserRowSchema>;

export const MaterialRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable().optional(),
  rarity_id: z.number().nullable().optional(),
  emoji: z.string().nullable().optional(),
  area: z.string().nullable().optional(),
  base_drop_rate: z.number().nullable().optional(),
  image: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  default_points: z.number().nullable().optional(),
  is_active: z.boolean().nullable().optional(),
  created_at: z.string().optional(),
});
export type MaterialRow = z.infer<typeof MaterialRowSchema>;

export const UserMaterialRowSchema = z.object({
  id: z.number(),
  user_id: z.string(),
  material_id: z.number(),
  amount: z.number(),
  updated_at: z.string().optional(),
});
export type UserMaterialRow = z.infer<typeof UserMaterialRowSchema>;

export const MonsterRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  hp: z.number().optional(),
  max_hp: z.number(),
  base_hp: z.number().optional(),
  level: z.number().optional(),
  area: z.string().optional(),
  channel_id: z.string().nullable().optional(),
  is_event: z.boolean().nullable().optional(),
  is_active: z.boolean().nullable().optional(),
  created_at: z.string().optional(),
  image: z.string().nullable().optional(),
  spawn_date: z.string().optional(),
  current_hp: z.number().optional(),
  is_alive: z.boolean().optional(),
  is_reward_announced: z.boolean().optional(),
  killed_by_user_id: z.string().nullable().optional(),
  killed_at_timestamp: z.string().nullable().optional(),
});
export type MonsterRow = z.infer<typeof MonsterRowSchema>;

export const RarityRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  color: z.string().optional(),
  drop_rate: z.number().optional(),
  emoji: z.string().optional(),
  value: z.number().optional(),
  order: z.number().optional(),
});
export type RarityRow = z.infer<typeof RarityRowSchema>;

export const ChannelConfigRowSchema = z.object({
  id: z.string(),
  channel_id: z.string().optional(),
  name: z.string().optional(),
  is_active: z.boolean().nullable().optional(),
  area: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
});
export type ChannelConfigRow = z.infer<typeof ChannelConfigRowSchema>;

export const ConfigRowSchema = z.object({
  id: z.string().optional(),
  key: z.string(),
  value: z.string(),
  is_active: z.boolean().nullable().optional(),
});
export type ConfigRow = z.infer<typeof ConfigRowSchema>;

export const SpinRowSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  required_material_id: z.number().optional(),
  pool: z.array(z.unknown()).optional(),
  cost: z.number().optional(),
  items: z.array(z.string()).optional(),
});
export type SpinRow = z.infer<typeof SpinRowSchema>;

export const ClanDonationRowSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  material_id: z.number(),
  quantity: z.number(),
  claimed: z.boolean().optional(),
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
