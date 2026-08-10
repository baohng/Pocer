import { useState, type Dispatch } from "react";
import type { GameRecord, Action } from "../types";
import { formatVND, formatChips } from "../utils/format";
import { getResults, getTotalBuyInVND } from "../utils/results";
import { submitGameResult } from "../utils/api";
import { useToast } from "./Toast";

interface Props {
  history: GameRecord[];
  dispatch: Dispatch<Action>;
}

function formatStamp(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function submitStatus(g: GameRecord): "never" | "edited" | "submitted" {
  if (!g.submittedAt) return "never";
  if (new Date(g.updatedAt).getTime() > new Date(g.submittedAt).getTime())
    return "edited";
  return "submitted";
}

export default function HistoryScreen({ history, dispatch }: Props) {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const { showToast } = useToast();

  async function handleResubmit(g: GameRecord) {
    setSubmittingId(g.id);
    try {
      await submitGameResult(new Date(g.endTime), g.players);
      dispatch({ type: "MARK_SUBMITTED", id: g.id });
      showToast("Corrected row submitted", "success");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Submit failed",
        "warning"
      );
    } finally {
      setSubmittingId(null);
    }
  }

  return (
    <div className="screen history-screen">
      <div className="section-header">
        <button
          className="btn-back"
          onClick={() => dispatch({ type: "CLOSE_HISTORY" })}
          aria-label="Back"
        >
          ← Back
        </button>
        <h2>History</h2>
        <div className="section-header-actions">
          <button
            className="btn-back"
            onClick={() => dispatch({ type: "OPEN_STATS" })}
          >
            Stats
          </button>
          <span className="player-count">{history.length} games</span>
        </div>
      </div>

      {history.length === 0 ? (
        <p className="history-empty">No finished games yet.</p>
      ) : (
        <div className="history-list">
          {history.map((g, i) => {
            const results = getResults(g.players);
            const totalBuyIn = getTotalBuyInVND(g.players);
            const top = results[0];
            const status = submitStatus(g);
            return (
              <div
                key={g.id}
                className="history-row item-animated"
                style={{ animationDelay: `${i * 0.04}s` }}
              >
                <div className="history-info">
                  <div className="history-row-head">
                    <span className="history-time">
                      {formatStamp(g.endTime)}
                    </span>
                    <span className={`history-badge badge-${status}`}>
                      {status === "submitted"
                        ? "Submitted"
                        : status === "edited"
                          ? "Edited since"
                          : "Not submitted"}
                    </span>
                  </div>
                  <span className="player-detail">
                    Buy-in {formatChips(totalBuyIn)} VND &middot;{" "}
                    {results.length} players
                    {top && (
                      <>
                        {" "}
                        &middot; Top: {top.name} {formatVND(top.netVND)}
                      </>
                    )}
                  </span>
                </div>
                <div className="history-actions">
                  <button
                    className="btn btn-secondary"
                    onClick={() => dispatch({ type: "EDIT_GAME", id: g.id })}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => handleResubmit(g)}
                    disabled={submittingId === g.id || status === "submitted"}
                  >
                    {submittingId === g.id ? "Sending..." : "Re-submit"}
                  </button>
                  <button
                    className="btn-icon btn-remove"
                    onClick={() => setDeleteId(g.id)}
                    aria-label="Delete game"
                  >
                    &times;
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {deleteId && (
        <div className="modal-overlay" onClick={() => setDeleteId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <p className="modal-message">Delete this game from history?</p>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setDeleteId(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  dispatch({ type: "DELETE_GAME", id: deleteId });
                  setDeleteId(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
