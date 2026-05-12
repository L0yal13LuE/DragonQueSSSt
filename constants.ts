export const COMMAND_PREFIX: string = '!';
export const HOURLY_CHECK_INTERVAL: number = 60 * 60 * 1000;

export const CACHE_RARITIES_PREFIX: string = 'RARITIES';
export const CACHE_RARITIES_TTL: number = 60 * 60 * 1000;

export const CACHE_CHANNEL_PREFIX: string = 'CHANNEL';
export const CACHE_CHANNEL_TTL: number = 60 * 60 * 1000;

export const CACHE_MATERIAL_CHANNEL_PREFIX: string = 'MATERIAL_CHANNEL';
export const CACHE_MATERIAL_CHANNEL_TTL_MS: number = 60 * 60 * 1000;

export const CACHE_USER_BAG_PREFIX: string = 'USER_BAG';
export const CACHE_USER_BAG_TTL_MS: number = 60 * 60 * 1000;

export const CACHE_LEADERBOARD_POINT_PREFIX: string = 'LEADERBOARD_POINT';
export const CACHE_LEADERBOARD_VALUE_TTL_MS: number = 60 * 60 * 1000;

export const CACHE_LEADERBOARD_MONSTER_KILL_PREFIX: string = 'LEADERBOARD_MONSTER_KILL';
export const CACHE_LEADERBOARD_MONSTER_KILL_TTL_MS: number = 60 * 60 * 1000;

export const CACHE_ASSEMBLE_PREFIX: string = 'ASSEMBLE';
export const CACHE_ASSEMBLE_TTL_MS: number = 60 * 60 * 1000;

export let COOLDOWN_MILLISECONDS: number = 5 * 1000;
export let EXP_PER_CHARACTER: number = 1;
export let LEVELING_FACTOR: number = 10;
export const ANNOUNCEMENT_CHANNEL_ID: number = 1366780291380678737;

export function GET_CHANCE(chancePercentage: number): boolean {
  if (typeof chancePercentage !== 'number' || chancePercentage < 0 || chancePercentage > 100) {
    console.error("Invalid input: Please provide a number between 0 and 100.");
    return false;
  }
  const probability: number = chancePercentage / 100;
  return Math.random() < probability;
}

export const catReplies: string[] = [
  "Meow?",
  "Meeeow...",
  "*tilts head* Mrrr?",
  "Purrrr... Zzzz...",
  "*nuzzles* Meow!",
  "Puuuuurrrrrrrrrrr...",
  "Meow meow!",
  "*blinks slowly*",
  "Mrow?",
  "What is it, human? Meow?",
  "Calling for meow?",
];
