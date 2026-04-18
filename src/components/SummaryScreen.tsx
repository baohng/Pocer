import type { Dispatch } from "react";
import type { Player, Action } from "../types";
import { CHIPS_PER_STACK, VND_PER_CHIP } from "../constants";
import { formatVND, formatChips } from "../utils/format";

interface Props {
  players: Player[];
  dispatch: Dispatch<Action>;
}

interface PlayerResult {
  name: string;
  chipsBoughtIn: number;
  chipsReturned: number;
  netChips: number;
  netVND: number;
}

function getResults(players: Player[]): PlayerResult[] {
  return players
    .filter((p) => p.active)
    .map((p) => {
      const chipsBoughtIn = p.stacksBought * CHIPS_PER_STACK;
      const chipsReturned = p.chipsReturned ?? 0;
      const netChips = chipsReturned - chipsBoughtIn;
      const netVND = netChips * VND_PER_CHIP;
      return {
        name: p.name,
        chipsBoughtIn,
        chipsReturned,
        netChips,
        netVND,
      };
    })
    .sort((a, b) => b.netVND - a.netVND);
}

export default function SummaryScreen({ players, dispatch }: Props) {
  const results = getResults(players);
  const totalNet = results.reduce((sum, r) => sum + r.netVND, 0);

  function handleCopy() {
    const lines = results.map(
      (r) =>
        `${r.name}: ${formatVND(r.netVND)}`
    );
    const text = `Pocer Results\n${"=".repeat(30)}\n${lines.join("\n")}\n${"=".repeat(30)}\nTotal: ${formatVND(totalNet)}`;
    navigator.clipboard.writeText(text);
  }

  return (
    <div className="screen summary-screen">
      <h2>Results</h2>

      <div className="results-list">
        {results.map((r) => (
          <div
            key={r.name}
            className={`result-row ${r.netVND > 0 ? "winner" : r.netVND < 0 ? "loser" : "even"}`}
          >
            <div className="result-player">
              <span className="player-name">{r.name}</span>
              <span className="player-detail">
                Bought: {formatChips(r.chipsBoughtIn)} &middot; Returned:{" "}
                {formatChips(r.chipsReturned)}
              </span>
            </div>
            <div className="result-amount">
              <span className="net-vnd">{formatVND(r.netVND)}</span>
              <span className="net-chips">
                {r.netChips > 0 ? "+" : ""}
                {formatChips(r.netChips)} chips
              </span>
            </div>
          </div>
        ))}
      </div>

      {totalNet !== 0 && (
        <div className="sanity-warning">
          Warning: Total net is {formatVND(totalNet)} (should be 0 VND)
        </div>
      )}

      <div className="summary-actions">
        <button className="btn btn-secondary" onClick={handleCopy}>
          Copy Results
        </button>
        <button
          className="btn btn-primary"
          onClick={() => dispatch({ type: "RESET" })}
        >
          New Game
        </button>
      </div>
    </div>
  );
}
