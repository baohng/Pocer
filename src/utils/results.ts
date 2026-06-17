import type { Player } from "../types";
import { CHIPS_PER_STACK, VND_PER_CHIP } from "../constants";

export interface PlayerResult {
  id: string;
  name: string;
  chipsBoughtIn: number;
  chipsReturned: number;
  netChips: number;
  netVND: number;
}

/** Per-player results for active players, sorted by net VND descending. */
export function getResults(players: Player[]): PlayerResult[] {
  return players
    .filter((p) => p.active)
    .map((p) => {
      const chipsBoughtIn = p.stacksBought * CHIPS_PER_STACK;
      const chipsReturned = p.chipsReturned ?? 0;
      const netChips = chipsReturned - chipsBoughtIn;
      return {
        id: p.id,
        name: p.name,
        chipsBoughtIn,
        chipsReturned,
        netChips,
        netVND: netChips * VND_PER_CHIP,
      };
    })
    .sort((a, b) => b.netVND - a.netVND);
}

/** Total chips bought in across active players. */
export function getTotalBoughtIn(players: Player[]): number {
  return players
    .filter((p) => p.active)
    .reduce((sum, p) => sum + p.stacksBought * CHIPS_PER_STACK, 0);
}

/** Total VND bought in across active players. */
export function getTotalBuyInVND(players: Player[]): number {
  return getTotalBoughtIn(players) * VND_PER_CHIP;
}
