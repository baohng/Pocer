/** Display-only nicknames for the stats chart, keyed by the stored player name
 *  lowercased. Cosmetic on purpose: the stored name is the key that matches a
 *  player across games (utils/history.ts) and is what Supabase persists, so
 *  editing a player's real name breaks their history -- add a nickname here
 *  instead. An unlisted name simply renders as itself. */
export const NICKNAMES: Record<string, string> = {
  // "bảo": "Bảo Thần Bài",
};

export const CHIPS_PER_STACK = 2000;
export const VND_PER_STACK = 50_000;
export const VND_PER_CHIP = VND_PER_STACK / CHIPS_PER_STACK; // 25
