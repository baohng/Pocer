import type { GameRecord, Player } from "../types";
import { CHIPS_PER_STACK, VND_PER_CHIP } from "../constants";
import { buildGameLabels } from "./history";
import { displayName, formatVND } from "./format";

/** One player's result in one game. `text` is pre-formatted on purpose: the
 *  AI layer is told to quote these strings verbatim so it never has to do
 *  arithmetic or currency formatting of its own. */
export interface SessionResult {
  label: string; // the game's chart label, e.g. "27/07" or "27/07 #2"
  net: number;
  text: string;
}

export interface PlayerFacts {
  key: string; // stored name -- matches a player across games, used for cache keys
  name: string; // display name (nickname), the only one the AI ever sees
  net: number;
  netText: string;
  sessions: number;
  wins: number;
  losses: number;
  best: SessionResult | null;
  worst: SessionResult | null;
  topSessions: SessionResult[]; // up to 5 biggest wins, descending
  longestWinStreak: number;
  longestLoseStreak: number;
  currentStreak: number; // signed: +3 = winning 3 in a row, -2 = losing 2
  maxDrawdown: number; // deepest peak-to-trough fall on the cumulative curve, >= 0
  maxDrawdownText: string;
  stdev: number; // population stdev of per-session net -- the variance measure
  stdevText: string;
  avgStacks: number; // mean stacks bought per session, a rough rebuy-appetite proxy
  /** Share of total profit that came from the single best session, 0..1.
   *  Null when the player didn't finish the month up -- the ratio is only
   *  meaningful against a positive net. A high value means "one spike carried
   *  the month", not "dominance", and the prompt leans on it to say so. */
  concentration: number | null;
  curve: number[]; // cumulative net after each session played, for shape only
}

export interface MonthFacts {
  monthKey: string; // accounting-month key, e.g. "8/2026"
  gameCount: number;
  totalMoved: number; // sum of every winning result -- money that changed hands
  totalMovedText: string;
  players: PlayerFacts[]; // descending by net
}

function netOf(player: Player): number {
  const boughtIn = player.stacksBought * CHIPS_PER_STACK;
  const returned = player.chipsReturned ?? 0;
  return (returned - boughtIn) * VND_PER_CHIP;
}

function stdevOf(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** Deepest fall from a running peak. Starts from a peak of 0 so a player who
 *  is down from their very first session still registers a drawdown. */
function maxDrawdownOf(curve: number[]): number {
  let peak = 0;
  let worst = 0;
  for (const value of curve) {
    if (value > peak) peak = value;
    const fall = peak - value;
    if (fall > worst) worst = fall;
  }
  return worst;
}

function streaksOf(nets: number[]): {
  longestWin: number;
  longestLose: number;
  current: number;
} {
  let longestWin = 0;
  let longestLose = 0;
  let run = 0; // signed length of the run ending at the current session
  for (const net of nets) {
    if (net > 0) run = run > 0 ? run + 1 : 1;
    else if (net < 0) run = run < 0 ? run - 1 : -1;
    else run = 0;
    if (run > longestWin) longestWin = run;
    if (-run > longestLose) longestLose = -run;
  }
  return { longestWin, longestLose, current: run };
}

function buildPlayerFacts(
  name: string,
  games: GameRecord[],
  labels: string[]
): PlayerFacts | null {
  const results: SessionResult[] = [];
  const nets: number[] = [];
  const curve: number[] = [];
  let running = 0;
  let stacks = 0;

  for (const [i, game] of games.entries()) {
    const player = game.players.find((p) => p.name === name);
    if (!player || !player.active) continue; // absent that night: no point on their curve
    const net = netOf(player);
    running += net;
    stacks += player.stacksBought;
    nets.push(net);
    curve.push(running);
    results.push({ label: labels[i], net, text: formatVND(net) });
  }

  if (results.length === 0) return null;

  const byNet = [...results].sort((a, b) => b.net - a.net);
  const best = byNet[0];
  const worst = byNet[byNet.length - 1];
  const { longestWin, longestLose, current } = streaksOf(nets);
  const net = running;
  const stdev = Math.round(stdevOf(nets));
  const maxDrawdown = Math.round(maxDrawdownOf(curve));

  return {
    key: name,
    name: displayName(name),
    net,
    netText: formatVND(net),
    sessions: results.length,
    wins: nets.filter((n) => n > 0).length,
    losses: nets.filter((n) => n < 0).length,
    best,
    worst,
    topSessions: byNet.filter((r) => r.net > 0).slice(0, 5),
    longestWinStreak: longestWin,
    longestLoseStreak: longestLose,
    currentStreak: current,
    maxDrawdown,
    maxDrawdownText: formatVND(-maxDrawdown),
    stdev,
    stdevText: formatVND(stdev),
    avgStacks: Math.round((stacks / results.length) * 10) / 10,
    concentration: net > 0 && best.net > 0 ? Math.round((best.net / net) * 100) / 100 : null,
    curve,
  };
}

/** Every derived number the AI layer is allowed to talk about, computed for
 *  one accounting month. Deterministic: the same games always produce the same
 *  object, which is what makes {@link hashFacts} a usable cache key.
 *  Expects `games` chronological, as {@link groupGamesByAccountingMonth} returns. */
export function buildMonthFacts(monthKey: string, games: GameRecord[]): MonthFacts {
  const labels = buildGameLabels(games);
  const names = Array.from(
    new Set(games.flatMap((g) => g.players.filter((p) => p.active).map((p) => p.name)))
  );

  const players = names
    .map((name) => buildPlayerFacts(name, games, labels))
    .filter((p): p is PlayerFacts => p !== null)
    .sort((a, b) => b.net - a.net);

  const totalMoved = players.reduce(
    (sum, p) => sum + (p.net > 0 ? p.net : 0),
    0
  );

  return {
    monthKey,
    gameCount: games.length,
    totalMoved,
    totalMovedText: formatVND(totalMoved),
    players,
  };
}
