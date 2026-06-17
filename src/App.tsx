import { useReducer, useEffect } from "react";
import type { Session, Action, Player, Phase } from "./types";
import { saveSession, loadSession } from "./utils/storage";
import SetupScreen from "./components/SetupScreen";
import PlayingScreen from "./components/PlayingScreen";
import CashoutScreen from "./components/CashoutScreen";
import SummaryScreen from "./components/SummaryScreen";
import { ToastProvider } from "./components/Toast";
import "./App.css";

const DEFAULT_NAMES = [
  "Đạt", "Hải", "Bình", "Đông", "Mạnh", "Phúc", "Hiếu", "Bảo",
];

function createPlayer(name: string): Player {
  return {
    id: crypto.randomUUID(),
    name,
    active: true,
    stacksBought: 0,
    chipsReturned: null,
    cashedOut: false,
  };
}

function createInitialSession(): Session {
  return {
    phase: "setup",
    players: DEFAULT_NAMES.map((name) => createPlayer(name)),
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

    case "EARLY_CASHOUT":
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.playerId
            ? { ...p, chipsReturned: action.chips, cashedOut: true }
            : p
        ),
      };

    case "UNDO_EARLY_CASHOUT":
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.playerId
            ? { ...p, chipsReturned: null, cashedOut: false }
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
        players: state.players.map((p) =>
          p.cashedOut ? p : { ...p, chipsReturned: null }
        ),
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

function App() {
  const [session, dispatch] = useReducer(reducer, null, () => {
    const saved = loadSession();
    if (saved && saved.phase !== ("mode" as Phase) && saved.players.length > 0) {
      saved.players = saved.players.map((p) => ({
        ...p,
        active: p.active ?? true,
        cashedOut: p.cashedOut ?? false,
      }));
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
          </div>
        </main>
      </div>
    </ToastProvider>
  );
}

export default App;
