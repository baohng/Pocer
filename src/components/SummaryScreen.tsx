import { useState, type Dispatch } from "react";
import type { Player, Action } from "../types";
import { CHIPS_PER_STACK, VND_PER_CHIP } from "../constants";
import { formatVND, formatChips } from "../utils/format";
import { useCountUp } from "../hooks/useCountUp";

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

const CONFETTI_COLORS = ["#6366f1", "#8b5cf6", "#22c55e", "#eab308", "#f87171", "#818cf8"];

interface Particle {
  id: number;
  left: number;
  delay: number;
  duration: number;
  color: string;
  size: number;
  rotation: number;
  aspectRatio: number;
  isCircle: boolean;
}

function Confetti() {
  const [particles] = useState<Particle[]>(() =>
    Array.from({ length: 45 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.6,
      duration: 1.5 + Math.random() * 2,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      size: 5 + Math.random() * 7,
      rotation: Math.random() * 360,
      aspectRatio: 0.4 + Math.random() * 0.6,
      isCircle: Math.random() > 0.5,
    }))
  );

  return (
    <div className="confetti-container">
      {particles.map((p) => (
        <div
          key={p.id}
          className="confetti-particle"
          style={{
            left: `${p.left}%`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            backgroundColor: p.color,
            width: p.size,
            height: p.size * p.aspectRatio,
            borderRadius: p.isCircle ? "50%" : "2px",
            transform: `rotate(${p.rotation}deg)`,
          }}
        />
      ))}
    </div>
  );
}

function AnimatedVND({ value }: { value: number }) {
  const animated = useCountUp(value);
  return <span className="net-vnd">{formatVND(animated)}</span>;
}

function AnimatedChips({ value }: { value: number }) {
  const animated = useCountUp(value);
  return (
    <span className="net-chips">
      {animated > 0 ? "+" : ""}
      {formatChips(animated)} chips
    </span>
  );
}

export default function SummaryScreen({ players, dispatch }: Props) {
  const results = getResults(players);
  const totalNet = results.reduce((sum, r) => sum + r.netVND, 0);
  const [showConfetti] = useState(() => totalNet === 0);

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
      {showConfetti && <Confetti />}
      <h2>Results</h2>

      <div className="results-list">
        {results.map((r, i) => (
          <div
            key={r.name}
            className={`result-row item-animated ${r.netVND > 0 ? "winner" : r.netVND < 0 ? "loser" : "even"}`}
            style={{ animationDelay: `${i * 0.06}s` }}
          >
            <div className="result-player">
              <span className="player-name">{r.name}</span>
              <span className="player-detail">
                Bought: {formatChips(r.chipsBoughtIn)} &middot; Returned:{" "}
                {formatChips(r.chipsReturned)}
              </span>
            </div>
            <div className="result-amount">
              <AnimatedVND value={r.netVND} />
              <AnimatedChips value={r.netChips} />
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
