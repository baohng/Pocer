import { useState, useEffect, useRef, type Dispatch } from "react";
import type { Player, Action } from "../types";
import { CHIPS_PER_STACK, VND_PER_STACK } from "../constants";
import { formatChips } from "../utils/format";
import { useToast } from "./Toast";

interface Props {
  players: Player[];
  dispatch: Dispatch<Action>;
  mode: "fixed" | "flexible";
}

export default function PlayingScreen({ players, dispatch }: Props) {
  const activePlayers = players.filter((p) => p.active);
  const inactivePlayers = players.filter((p) => !p.active);
  const [lastBuyId, setLastBuyId] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [addPlayerOpen, setAddPlayerOpen] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState("");
  const addInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  const totalStacks = activePlayers.reduce((sum, p) => sum + p.stacksBought, 0);
  const totalChips = totalStacks * CHIPS_PER_STACK;
  const totalVND = totalStacks * VND_PER_STACK;

  useEffect(() => {
    if (!lastBuyId) return;
    const timer = setTimeout(() => setLastBuyId(null), 4000);
    return () => clearTimeout(timer);
  }, [lastBuyId]);

  useEffect(() => {
    if (addPlayerOpen && addInputRef.current) {
      addInputRef.current.focus();
    }
  }, [addPlayerOpen]);

  function handleBuy(playerId: string) {
    dispatch({ type: "BUY_STACK", playerId });
    setLastBuyId(playerId);
  }

  function handleUndo(playerId: string, playerName: string) {
    dispatch({ type: "UNDO_BUY", playerId });
    setLastBuyId(null);
    showToast(`Undo stack of ${playerName}`, "warning");
  }

  function handleEndGame() {
    setShowConfirm(true);
  }

  function confirmEndGame() {
    setShowConfirm(false);
    dispatch({ type: "END_GAME" });
  }

  function handleAddPlayer() {
    const name = newPlayerName.trim();
    if (!name) return;
    dispatch({ type: "ADD_PLAYER", name });
    setNewPlayerName("");
    setAddPlayerOpen(false);
  }

  function handleCancelAdd() {
    setNewPlayerName("");
    setAddPlayerOpen(false);
  }

  function handleAddKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      handleAddPlayer();
    } else if (e.key === "Escape") {
      handleCancelAdd();
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
        {activePlayers.map((player, i) => {
          const chips = player.stacksBought * CHIPS_PER_STACK;
          const vnd = player.stacksBought * VND_PER_STACK;
          return (
            <div key={player.id} className="playing-player-row item-animated"
              style={{ animationDelay: `${i * 0.04}s` }}>
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
                    onClick={() => handleUndo(player.id, player.name)}
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

      {inactivePlayers.length > 0 && (
        <div className="inactive-players">
          <p className="inactive-label">Removed</p>
          <div className="player-list">
            {inactivePlayers.map((player) => (
              <div key={player.id} className="setup-player-row inactive">
                <span className="player-name-inactive">{player.name}</span>
                <button
                  className="btn-icon btn-readd"
                  onClick={() =>
                    dispatch({ type: "READD_PLAYER", playerId: player.id })
                  }
                  aria-label="Re-add player"
                >
                  +
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {addPlayerOpen ? (
        <div className="add-player-form">
          <input
            ref={addInputRef}
            type="text"
            className="player-name-input"
            value={newPlayerName}
            onChange={(e) => setNewPlayerName(e.target.value)}
            onKeyDown={handleAddKeyDown}
            placeholder="Player name"
          />
          <div className="add-player-actions">
            <button className="btn btn-secondary" onClick={handleCancelAdd}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleAddPlayer}
              disabled={!newPlayerName.trim()}
            >
              Add
            </button>
          </div>
        </div>
      ) : (
        <button
          className="btn btn-secondary btn-add-player"
          onClick={() => setAddPlayerOpen(true)}
        >
          + Add Player
        </button>
      )}

      <button className="btn btn-danger btn-end" onClick={handleEndGame}>
        End Game
      </button>

      {showConfirm && (
        <div className="modal-overlay" onClick={() => setShowConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <p className="modal-message">End the game and move to cashout?</p>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setShowConfirm(false)}
              >
                Cancel
              </button>
              <button className="btn btn-danger" onClick={confirmEndGame}>
                End Game
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
