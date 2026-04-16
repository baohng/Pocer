import type { Dispatch } from "react";
import type { Player, Action } from "../types";

interface Props {
  players: Player[];
  dispatch: Dispatch<Action>;
}

export default function SetupScreen({ players, dispatch }: Props) {
  return (
    <div className="screen setup-screen">
      <div className="section-header">
        <h2>Players</h2>
        <span className="player-count">{players.length} players</span>
      </div>

      <div className="player-list">
        {players.map((player, index) => (
          <div key={player.id} className="setup-player-row">
            <span className="player-number">{index + 1}</span>
            <input
              type="text"
              className="player-name-input"
              value={player.name}
              onChange={(e) =>
                dispatch({
                  type: "SET_PLAYER_NAME",
                  playerId: player.id,
                  name: e.target.value,
                })
              }
              placeholder={`Player ${index + 1}`}
            />
            {players.length > 2 && (
              <button
                className="btn-icon btn-remove"
                onClick={() =>
                  dispatch({ type: "REMOVE_PLAYER", playerId: player.id })
                }
                aria-label="Remove player"
              >
                &times;
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        className="btn btn-secondary btn-add-player"
        onClick={() => dispatch({ type: "ADD_PLAYER" })}
      >
        + Add Player
      </button>

      <div className="setup-info">
        <p>Each player buys in 1 stack (2,000 chips = 50.000 VND)</p>
      </div>

      <button
        className="btn btn-primary btn-start"
        onClick={() => dispatch({ type: "START_GAME" })}
        disabled={players.length < 2}
      >
        Start Game
      </button>
    </div>
  );
}
