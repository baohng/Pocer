import type { GameRecord } from "../types";
import { CHIPS_PER_STACK, VND_PER_CHIP } from "../constants";

export interface NetWorthPoint {
  label: string; // e.g. "27/07" or "27/07 #2" for a same-day rematch
  gameId: string;
  cumulative: number; // running net VND up to and including this game
}

export interface PlayerNetWorthSeries {
  name: string;
  points: NetWorthPoint[];
}

function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

/** Disambiguates repeated same-day labels: "27/07", "27/07 #2", "27/07 #3". */
function buildLabels(games: GameRecord[]): string[] {
  const seen = new Map<string, number>();
  return games.map((g) => {
    const day = formatDayLabel(g.endTime);
    const count = (seen.get(day) ?? 0) + 1;
    seen.set(day, count);
    return count === 1 ? day : `${day} #${count}`;
  });
}

/** One cumulative-net-VND line per player name across finished games, in
 *  chronological order -- mirrors the running-balance chart the group
 *  already tracks by hand in a spreadsheet. Players are matched by name
 *  (not id, since each session re-creates player ids); a player absent or
 *  inactive in a given game contributes 0 to that game's step, carrying
 *  their running total forward flat. */
export function buildNetWorthSeries(history: GameRecord[]): PlayerNetWorthSeries[] {
  const games = [...history].sort(
    (a, b) => new Date(a.endTime).getTime() - new Date(b.endTime).getTime()
  );
  if (games.length === 0) return [];

  const labels = buildLabels(games);
  const names = Array.from(
    new Set(games.flatMap((g) => g.players.filter((p) => p.active).map((p) => p.name)))
  );

  return names.map((name) => {
    let running = 0;
    const points: NetWorthPoint[] = games.map((g, i) => {
      const player = g.players.find((p) => p.name === name);
      if (player && player.active) {
        const boughtIn = player.stacksBought * CHIPS_PER_STACK;
        const returned = player.chipsReturned ?? 0;
        running += (returned - boughtIn) * VND_PER_CHIP;
      }
      return { label: labels[i], gameId: g.id, cumulative: running };
    });
    return { name, points };
  });
}
