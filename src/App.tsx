import { useReducer, useEffect } from "react";
import type { Session, Action, Player } from "./types";
import { saveSession, loadSession } from "./utils/storage";
import ModeScreen from "./components/ModeScreen";
import SetupScreen from "./components/SetupScreen";
import PlayingScreen from "./components/PlayingScreen";
import CashoutScreen from "./components/CashoutScreen";
import SummaryScreen from "./components/SummaryScreen";
import { ToastProvider } from "./components/Toast";
import "./App.css";

const DEFAULT_NAMES = [
  "Đạt", "Hải", "Minh", "Đông", "Mạnh", "Phúc", "Hiếu", "Bảo",
];

function createPlayer(name: string): Player {
  return {
    id: crypto.randomUUID(),
    name,
    active: true,
    stacksBought: 0,
    chipsReturned: null,
  };
}

function createInitialSession(): Session {
  return {
    phase: "mode",
    mode: "fixed",
    players: [],
  };
}

function reducer(state: Session, action: Action): Session {
  switch (action.type) {
    case "CHOOSE_MODE":
      return {
        ...state,
        phase: "setup",
        mode: action.mode,
        players: DEFAULT_NAMES.map((name) => createPlayer(name)),
      };

    case "BACK_TO_MODE":
      return { phase: "mode", mode: state.mode, players: [] };

    case "SET_PLAYER_NAME":
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.playerId ? { ...p, name: action.name } : p
        ),
      };

    case "ADD_PLAYER": {
      const name = action.name ?? `Player ${state.players.length + 1}`;
      const player = createPlayer(name);
      if (state.phase === "playing") {
        player.stacksBought = 1;
      }
      return {
        ...state,
        players: [...state.players, player],
      };
    }

    case "REMOVE_PLAYER": {
      const activeCount = state.players.filter((p) => p.active).length;
      if (activeCount <= 2) return state;
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.playerId ? { ...p, active: false } : p
        ),
      };
    }

    case "READD_PLAYER":
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.playerId
            ? {
                ...p,
                active: true,
                stacksBought:
                  state.phase === "playing"
                    ? Math.max(1, p.stacksBought)
                    : p.stacksBought,
              }
            : p
        ),
      };

    case "START_GAME":
      return {
        ...state,
        phase: "playing",
        players: state.players.map((p) =>
          p.active ? { ...p, stacksBought: 1 } : p
        ),
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
      return {
        phase: "mode",
        mode: state.mode,
        players: [],
      };

    default:
      return state;
  }
}

function App() {
  const [session, dispatch] = useReducer(reducer, null, () => {
    const saved = loadSession();
    if (saved) {
      saved.players = saved.players.map((p) => ({
        ...p,
        active: p.active ?? true,
      }));
      saved.mode = saved.mode ?? "fixed";
      return saved;
    }
    return createInitialSession();
  });

  useEffect(() => {
    saveSession(session);
  }, [session]);

  return (
    <ToastProvider>
      <div className="app">
        <header className="app-header">
          <h1>Pocer</h1>
          <span className="app-subtitle">Poker Calculator</span>
        </header>
        <main className="app-main">
          <div className="screen-wrapper" key={session.phase}>
            {session.phase === "mode" && (
              <ModeScreen dispatch={dispatch} />
            )}
            {session.phase === "setup" && (
              <SetupScreen players={session.players} dispatch={dispatch} mode={session.mode} />
            )}
            {session.phase === "playing" && (
              <PlayingScreen players={session.players} dispatch={dispatch} mode={session.mode} />
            )}
            {session.phase === "cashout" && (
              <CashoutScreen players={session.players} dispatch={dispatch} mode={session.mode} />
            )}
            {session.phase === "summary" && (
              <SummaryScreen players={session.players} dispatch={dispatch} />
            )}
          </div>
        </main>
      </div>
    </ToastProvider>
  );
}

export default App;
