import type { Dispatch } from "react";
import type { Action } from "../types";

interface Props {
  dispatch: Dispatch<Action>;
}

export default function ModeScreen({ dispatch }: Props) {
  return (
    <div className="screen mode-screen">
      <div className="mode-card">
        <h2>Choose Mode</h2>
        <p className="mode-description">
          Select how you want to set up the game
        </p>
        <div className="mode-options">
          <button
            className="btn btn-mode btn-mode-fixed item-animated"
            onClick={() => dispatch({ type: "CHOOSE_MODE", mode: "fixed" })}
          >
            <span className="mode-label">Fixed</span>
            <span className="mode-hint">8 players — traditional roster</span>
          </button>
          <button
            className="btn btn-mode btn-mode-flexible item-animated"
            style={{ animationDelay: "0.08s" }}
            onClick={() => dispatch({ type: "CHOOSE_MODE", mode: "flexible" })}
          >
            <span className="mode-label">Flexible</span>
            <span className="mode-hint">Add or remove players freely</span>
          </button>
        </div>
      </div>
    </div>
  );
}
