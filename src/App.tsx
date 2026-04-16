import { useReducer, useEffect } from "react";
import type { Session, Action, Player } from "./types";
import { CHIPS_PER_STACK } from "./constants";
import { saveSession, loadSession } from "./utils/storage";
import SetupScreen from "./components/SetupScreen";
import PlayingScreen from "./components/PlayingScreen";
import CashoutScreen from "./components/CashoutScreen";
import SummaryScreen from "./components/SummaryScreen";
import "./App.css";

function createPlayer(index: number): Player {
  return {
    id: crypto.randomUUID(),
    name: `Player ${index + 1}`,
    stacksBought: 0,
    chipsReturned: null,
  };
}

function createInitialSession(): Session {
  return {
    phase: "setup",
    players: Array.from({ length: 8 }, (_, i) => createPlayer(i)),
  };
}

function reducer(state: Session, action: Action): Session {
  switch (action.type) {
    case "SET_PLAYER_NAME":
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.playerId ? { ...p, name: action.name } : p
        ),
      };

    case "ADD_PLAYER":
      return {
        ...state,
        players: [...state.players, createPlayer(state.players.length)],
      };

    case "REMOVE_PLAYER":
      if (state.players.length <= 2) return state;
      return {
        ...state,
        players: state.players.filter((p) => p.id !== action.playerId),
      };

    case "START_GAME":
      return {
        ...state,
        phase: "playing",
        players: state.players.map((p) => ({ ...p, stacksBought: 1 })),
      };

    case "BUY_STACK":
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.playerId
            ? { ...p, stacksBought: p.stacksBought + 1 }
            : p
        ),
      };

    case "UNDO_BUY":
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.playerId && p.stacksBought > 1
            ? { ...p, stacksBought: p.stacksBought - 1 }
            : p
        ),
      };

    case "END_GAME":
      return {
        ...state,
        phase: "cashout",
        players: state.players.map((p) => ({ ...p, chipsReturned: null })),
      };

    case "SET_CHIPS_RETURNED":
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.playerId ? { ...p, chipsReturned: action.chips } : p
        ),
      };

    case "CALCULATE":
      return { ...state, phase: "summary" };

    case "RESET":
      return createInitialSession();

    default:
      return state;
  }
}

export function getTotalChipsBoughtIn(players: Player[]): number {
  return players.reduce((sum, p) => sum + p.stacksBought * CHIPS_PER_STACK, 0);
}

export function getTotalChipsReturned(players: Player[]): number {
  return players.reduce((sum, p) => sum + (p.chipsReturned ?? 0), 0);
}

function App() {
  const [session, dispatch] = useReducer(reducer, null, () => {
    const saved = loadSession();
    return saved ?? createInitialSession();
  });

  useEffect(() => {
    saveSession(session);
  }, [session]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Pocer</h1>
        <span className="app-subtitle">Poker Calculator</span>
      </header>
      <main className="app-main">
        {session.phase === "setup" && (
          <SetupScreen players={session.players} dispatch={dispatch} />
        )}
        {session.phase === "playing" && (
          <PlayingScreen players={session.players} dispatch={dispatch} />
        )}
        {session.phase === "cashout" && (
          <CashoutScreen players={session.players} dispatch={dispatch} />
        )}
        {session.phase === "summary" && (
          <SummaryScreen players={session.players} dispatch={dispatch} />
        )}
      </main>
    </div>
  );
}

export default App;
