import type { Session } from "../types";
import { CHIPS_PER_STACK, VND_PER_STACK } from "../constants";
import { formatChips } from "../utils/format";

interface Props {
  session: Session;
  /** True if the receiver already has an in-progress game that takeover would overwrite. */
  hasExistingSession: boolean;
  onTakeOver: () => void;
  onDecline: () => void;
}

export default function JoinScreen({
  session,
  hasExistingSession,
  onTakeOver,
  onDecline,
}: Props) {
  const activePlayers = session.players.filter((p) => p.active);
  const totalStacks = activePlayers.reduce((sum, p) => sum + p.stacksBought, 0);
  const totalChips = totalStacks * CHIPS_PER_STACK;
  const totalVND = totalStacks * VND_PER_STACK;

  return (
    <div className="modal-overlay">
      <div className="modal join-modal">
        <h2 className="join-title">Take over session?</h2>
        <p className="modal-message">
          Someone shared a live session with you. Load it onto this device to
          continue keeping score?
        </p>

        <div className="join-preview">
          <div className="join-stat-row">
            <span>{activePlayers.length} players</span>
            <span>{totalStacks} stacks</span>
            <span>{formatChips(totalChips)} chips</span>
            <span>{formatChips(totalVND)} VND</span>
          </div>
          <ul className="join-player-list">
            {activePlayers.map((p) => (
              <li key={p.id}>
                <span className="join-player-name">{p.name}</span>
                <span className="join-player-stacks">
                  {p.stacksBought} stack{p.stacksBought > 1 ? "s" : ""}
                  {p.cashedOut && <span className="badge-left">Left</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {hasExistingSession && (
          <p className="join-warning">
            This will replace the game currently on this device.
          </p>
        )}

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onDecline}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={onTakeOver}>
            Take over
          </button>
        </div>
      </div>
    </div>
  );
}
