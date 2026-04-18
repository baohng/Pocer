import { useState } from "react";
import type { Dispatch } from "react";
import type { Player, Action } from "../types";
import { CHIPS_PER_STACK } from "../constants";
import { formatChips } from "../utils/format";
import { submitGameResult } from "../utils/api";

interface Props {
  players: Player[];
  dispatch: Dispatch<Action>;
}

function nowLocalDatetimeValue(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CashoutScreen({ players, dispatch }: Props) {
  const activePlayers = players.filter((p) => p.active);
  const totalBoughtIn = activePlayers.reduce(
    (sum, p) => sum + p.stacksBought * CHIPS_PER_STACK,
    0
  );
  const totalReturned = activePlayers.reduce(
    (sum, p) => sum + (p.chipsReturned ?? 0),
    0
  );
  const difference = totalBoughtIn - totalReturned;
  const allEntered = activePlayers.every((p) => p.chipsReturned !== null);
  const isBalanced = difference === 0;

  const [showEndTimeModal, setShowEndTimeModal] = useState(false);
  const [endTimeValue, setEndTimeValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function openEndTimeModal() {
    setEndTimeValue(nowLocalDatetimeValue());
    setSubmitError(null);
    setShowEndTimeModal(true);
  }

  async function handleSubmit() {
    if (!endTimeValue) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitGameResult(new Date(endTimeValue), players);
      setShowEndTimeModal(false);
      dispatch({ type: "CALCULATE" });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSkip() {
    setShowEndTimeModal(false);
    dispatch({ type: "CALCULATE" });
  }

  return (
    <div className="screen cashout-screen">
      <h2>Cashout</h2>
      <p className="cashout-instruction">
        Enter the chips each player is returning
      </p>

      <div className="player-list">
        {activePlayers.map((player) => {
          const boughtIn = player.stacksBought * CHIPS_PER_STACK;
          return (
            <div key={player.id} className="cashout-player-row">
              <div className="player-info">
                <span className="player-name">{player.name}</span>
                <span className="player-detail">
                  Bought: {formatChips(boughtIn)} chips
                </span>
              </div>
              <div className="chips-input-wrapper">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="chips-input"
                  placeholder="0"
                  value={player.chipsReturned ?? ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "") {
                      dispatch({
                        type: "SET_CHIPS_RETURNED",
                        playerId: player.id,
                        chips: null,
                      });
                    } else {
                      const num = parseInt(val, 10);
                      if (!isNaN(num) && num >= 0) {
                        dispatch({
                          type: "SET_CHIPS_RETURNED",
                          playerId: player.id,
                          chips: num,
                        });
                      }
                    }
                  }}
                />
                <span className="chips-label">chips</span>
              </div>
            </div>
          );
        })}
      </div>

      <div
        className={`validation-banner ${isBalanced && allEntered ? "balanced" : difference !== 0 && allEntered ? "unbalanced" : ""}`}
      >
        <div className="validation-row">
          <span>Total bought in:</span>
          <span>{formatChips(totalBoughtIn)} chips</span>
        </div>
        <div className="validation-row">
          <span>Total returned:</span>
          <span>{formatChips(totalReturned)} chips</span>
        </div>
        {difference !== 0 && (
          <div className="validation-row validation-diff">
            <span>Difference:</span>
            <span>{formatChips(Math.abs(difference))} chips {difference > 0 ? "missing" : "extra"}</span>
          </div>
        )}
        {isBalanced && allEntered && (
          <div className="validation-row validation-ok">Chips are balanced!</div>
        )}
      </div>

      <button
        className="btn btn-primary btn-calculate"
        onClick={openEndTimeModal}
      >
        Calculate Results
      </button>

      {showEndTimeModal && (
        <div
          className="modal-overlay"
          onClick={() => !submitting && setShowEndTimeModal(false)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <p className="modal-message">Enter game end time</p>
            <input
              type="datetime-local"
              className="chips-input"
              value={endTimeValue}
              onChange={(e) => setEndTimeValue(e.target.value)}
              disabled={submitting}
            />
            {submitError && (
              <p className="modal-message" style={{ color: "#d33", marginTop: "0.5rem" }}>
                Error: {submitError}
              </p>
            )}
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setShowEndTimeModal(false)}
                disabled={submitting}
              >
                Cancel
              </button>
              {submitError && (
                <button
                  className="btn btn-secondary"
                  onClick={handleSkip}
                  disabled={submitting}
                >
                  Skip & Continue
                </button>
              )}
              <button
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={submitting || !endTimeValue}
              >
                {submitting ? "Submitting..." : submitError ? "Retry" : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
