import { useState, type Dispatch } from "react";
import type { GameRecord, Action } from "../types";
import { CHIPS_PER_STACK } from "../constants";
import { displayName, formatVND, formatChips } from "../utils/format";
import { getResults, getTotalBuyInVND } from "../utils/results";
import {
  formatStamp,
  getSubmitStatus,
  SUBMIT_STATUS_LABEL,
  getAccountingMonthKey,
} from "../utils/history";
import { useResubmit } from "../hooks/useResubmit";

interface Props {
  record: GameRecord;
  dispatch: Dispatch<Action>;
}

/** Read-only detail of one finished game: who played, what everyone bought
 *  in and returned, and the record's submit state. Edits go through
 *  EDIT_GAME, which reopens the cashout screen in editing mode. */
export default function GameDetailScreen({ record, dispatch }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { submittingId, resubmit } = useResubmit(dispatch);

  const results = getResults(record.players);
  const totalBuyIn = getTotalBuyInVND(record.players);
  const totalNet = results.reduce((sum, r) => sum + r.netVND, 0);
  const status = getSubmitStatus(record);
  const sitters = record.players.filter((p) => !p.active);
  const submitting = submittingId === record.id;

  return (
    <div className="screen game-detail-screen">
      <div className="section-header">
        <button
          className="btn-back"
          onClick={() => dispatch({ type: "CLOSE_GAME_VIEW" })}
          aria-label="Back to history"
        >
          ← Back
        </button>
        <h2>Game Details</h2>
        <span className={`history-badge badge-${status}`}>
          {SUBMIT_STATUS_LABEL[status]}
        </span>
      </div>

      <div className="detail-meta">
        <div className="detail-meta-row">
          <span>Ended</span>
          <span>{formatStamp(record.endTime)}</span>
        </div>
        <div className="detail-meta-row">
          <span>Sheet month</span>
          <span>{getAccountingMonthKey(record.endTime)}</span>
        </div>
        <div className="detail-meta-row">
          <span>Total buy-in</span>
          <span>{formatChips(totalBuyIn)} VND</span>
        </div>
        <div className="detail-meta-row">
          <span>Players</span>
          <span>{results.length}</span>
        </div>
        <div className="detail-meta-row">
          <span>Last edited</span>
          <span>{formatStamp(record.updatedAt)}</span>
        </div>
        <div className="detail-meta-row">
          <span>Last submitted</span>
          <span>
            {record.submittedAt ? formatStamp(record.submittedAt) : "Never"}
          </span>
        </div>
      </div>

      <div className="results-list">
        {results.map((r, i) => (
          <div
            key={r.id}
            className={`result-row item-animated ${r.netVND > 0 ? "winner" : r.netVND < 0 ? "loser" : "even"}`}
            style={{ animationDelay: `${i * 0.04}s` }}
          >
            <div className="result-player">
              <span className="player-name">{displayName(r.name)}</span>
              <span className="player-detail">
                {r.chipsBoughtIn / CHIPS_PER_STACK} stacks &middot; Bought:{" "}
                {formatChips(r.chipsBoughtIn)} &middot; Returned:{" "}
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

      {sitters.length > 0 && (
        <div className="inactive-players">
          <p className="inactive-label">Sat out</p>
          <span className="player-detail">
            {sitters.map((p) => displayName(p.name)).join(", ")}
          </span>
        </div>
      )}

      <div className="detail-actions">
        <button
          className="btn btn-secondary"
          onClick={() => dispatch({ type: "EDIT_GAME", id: record.id })}
        >
          Edit
        </button>
        <button
          className="btn btn-primary"
          onClick={() => resubmit(record)}
          disabled={submitting || status === "submitted"}
        >
          {submitting ? "Sending..." : "Re-submit"}
        </button>
        <button
          className="btn-icon btn-remove"
          onClick={() => setConfirmDelete(true)}
          aria-label="Delete game"
        >
          &times;
        </button>
      </div>

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <p className="modal-message">Delete this game from history?</p>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={() => dispatch({ type: "DELETE_GAME", id: record.id })}
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
