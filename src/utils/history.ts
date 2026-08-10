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

const VNT_OFFSET_MS = 7 * 60 * 60 * 1000; // Vietnam time is UTC+7, no DST

/** The friend group's accounting month rolls over at 2pm VNT on the 25th
 *  (mirrors the sheet-naming rule in utils/api.ts, but computed precisely
 *  from the UTC instant rather than the device's local clock). Returns a
 *  "M/YYYY" key, e.g. games from 25/07 14:00 VNT through 25/08 13:59 VNT
 *  both key to "8/2026". */
export function getAccountingMonthKey(iso: string): string {
  const vnt = new Date(new Date(iso).getTime() + VNT_OFFSET_MS);
  let month = vnt.getUTCMonth();
  let year = vnt.getUTCFullYear();
  const day = vnt.getUTCDate();
  const hour = vnt.getUTCHours();
  if (day > 25 || (day === 25 && hour >= 14)) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return `${month + 1}/${year}`;
}

function monthKeySortValue(key: string): number {
  const [m, y] = key.split("/").map(Number);
  return y * 12 + m;
}

/** Groups finished games into accounting-month buckets, keyed by
 *  {@link getAccountingMonthKey}, with games in chronological order
 *  within each bucket and buckets returned oldest-first. */
export function groupGamesByAccountingMonth(
  history: GameRecord[]
): { key: string; games: GameRecord[] }[] {
  const games = [...history].sort(
    (a, b) => new Date(a.endTime).getTime() - new Date(b.endTime).getTime()
  );
  const map = new Map<string, GameRecord[]>();
  for (const g of games) {
    const key = getAccountingMonthKey(g.endTime);
    const arr = map.get(key);
    if (arr) arr.push(g);
    else map.set(key, [g]);
  }
  return Array.from(map.entries())
    .map(([key, games]) => ({ key, games }))
    .sort((a, b) => monthKeySortValue(a.key) - monthKeySortValue(b.key));
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
