import { useState, useEffect, type Dispatch } from "react";
import type { Player, Action } from "../types";
import { CHIPS_PER_STACK, VND_PER_STACK } from "../constants";
import { formatChips } from "../utils/format";

interface Props {
  players: Player[];
  dispatch: Dispatch<Action>;
}

export default function PlayingScreen({ players, dispatch }: Props) {
  const [lastBuyId, setLastBuyId] = useState<string | null>(null);

  const totalStacks = players.reduce((sum, p) => sum + p.stacksBought, 0);
  const totalChips = totalStacks * CHIPS_PER_STACK;
  const totalVND = totalStacks * VND_PER_STACK;

  useEffect(() => {
    if (!lastBuyId) return;
    const timer = setTimeout(() => setLastBuyId(null), 4000);
    return () => clearTimeout(timer);
  }, [lastBuyId]);

  function handleBuy(playerId: string) {
    dispatch({ type: "BUY_STACK", playerId });
    setLastBuyId(playerId);
  }

  function handleUndo(playerId: string) {
    dispatch({ type: "UNDO_BUY", playerId });
    setLastBuyId(null);
  }

  function handleEndGame() {
    if (window.confirm("End the game and move to cashout?")) {
      dispatch({ type: "END_GAME" });
    }
  }

  return (
    <div className="screen playing-screen">
      <div className="session-stats">
        <div className="stat">
          <span className="stat-label">Total Chips</span>
          <span className="stat-value">{formatChips(totalChips)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Total VND</span>
          <span className="stat-value">{formatChips(totalVND)} VND</span>
        </div>
        <div className="stat">
          <span className="stat-label">Stacks</span>
          <span className="stat-value">{totalStacks}</span>
        </div>
      </div>

      <div className="player-list">
        {players.map((player) => {
          const chips = player.stacksBought * CHIPS_PER_STACK;
          const vnd = player.stacksBought * VND_PER_STACK;
          return (
            <div key={player.id} className="playing-player-row">
              <div className="player-info">
                <span className="player-name">{player.name}</span>
                <span className="player-detail">
                  {player.stacksBought} stack{player.stacksBought > 1 ? "s" : ""}{" "}
                  &middot; {formatChips(chips)} chips &middot;{" "}
                  {formatChips(vnd)} VND
                </span>
              </div>
              <div className="player-actions">
                {lastBuyId === player.id && player.stacksBought > 1 && (
                  <button
                    className="btn btn-undo"
                    onClick={() => handleUndo(player.id)}
                  >
                    Undo
                  </button>
                )}
                <button
                  className="btn btn-buy"
                  onClick={() => handleBuy(player.id)}
                >
                  + Buy Stack
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <button className="btn btn-danger btn-end" onClick={handleEndGame}>
        End Game
      </button>
    </div>
  );
}
