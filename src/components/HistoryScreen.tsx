import { useState, type Dispatch } from "react";
import type { GameRecord, Action } from "../types";
import { displayName, formatVND, formatChips } from "../utils/format";
import { getResults, getTotalBuyInVND } from "../utils/results";
import { formatStamp, getSubmitStatus, SUBMIT_STATUS_LABEL } from "../utils/history";
import { useResubmit } from "../hooks/useResubmit";

interface Props {
  history: GameRecord[];
  dispatch: Dispatch<Action>;
}

export default function HistoryScreen({ history, dispatch }: Props) {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { submittingId, resubmit } = useResubmit(dispatch);

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
            const status = getSubmitStatus(g);
            return (
              <div
                key={g.id}
                className="history-row item-animated"
                style={{ animationDelay: `${i * 0.04}s` }}
              >
                <button
                  className="history-info"
                  onClick={() => dispatch({ type: "VIEW_GAME", id: g.id })}
                  aria-label={`View game from ${formatStamp(g.endTime)}`}
                >
                  <div className="history-row-head">
                    <span className="history-time">
                      {formatStamp(g.endTime)}
                    </span>
                    <span className={`history-badge badge-${status}`}>
                      {SUBMIT_STATUS_LABEL[status]}
                    </span>
                  </div>
                  <span className="player-detail">
                    Buy-in {formatChips(totalBuyIn)} VND &middot;{" "}
                    {results.length} players
                    {top && (
                      <>
                        {" "}
                        &middot; Top: {displayName(top.name)}{" "}
                        {formatVND(top.netVND)}
                      </>
                    )}
                  </span>
                </button>
                <div className="history-actions">
                  <button
                    className="btn btn-secondary"
                    onClick={() => dispatch({ type: "VIEW_GAME", id: g.id })}
                  >
                    View
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => dispatch({ type: "EDIT_GAME", id: g.id })}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => resubmit(g)}
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
