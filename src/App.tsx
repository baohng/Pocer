import { useReducer, useEffect } from "react";
import type { Session, Action, Player, AppState, GameRecord } from "./types";
import { saveAppState, loadAppState } from "./utils/storage";
import SetupScreen from "./components/SetupScreen";
import PlayingScreen from "./components/PlayingScreen";
import CashoutScreen from "./components/CashoutScreen";
import SummaryScreen from "./components/SummaryScreen";
import HistoryScreen from "./components/HistoryScreen";
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

function createInitialAppState(): AppState {
  return {
    current: createInitialSession(),
    history: [],
    editingId: null,
    viewingHistory: false,
  };
}

/** Reducer for the in-progress game (and the editing snapshot). */
function gameReducer(state: Session, action: Action): Session {
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

    case "SET_STACKS_BOUGHT":
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.playerId
            ? { ...p, stacksBought: Math.max(0, action.stacks) }
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

/** Top-level reducer over AppState: game actions delegate to gameReducer,
 *  history/editing actions operate on the history list. */
function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "FINISH_GAME": {
      const now = new Date().toISOString();
      const record: GameRecord = {
        id: crypto.randomUUID(),
        endTime: action.endTime ?? now,
        createdAt: now,
        updatedAt: now,
        submittedAt: null,
        players: state.current.players,
      };
      return {
        ...state,
        current: createInitialSession(),
        history: [record, ...state.history],
      };
    }

    case "OPEN_HISTORY":
      return { ...state, viewingHistory: true };

    case "CLOSE_HISTORY":
      return { ...state, viewingHistory: false, editingId: null };

    case "EDIT_GAME": {
      const record = state.history.find((g) => g.id === action.id);
      if (!record) return state;
      return {
        ...state,
        editingId: action.id,
        current: { phase: "cashout", players: record.players },
      };
    }

    case "SAVE_EDIT": {
      if (!state.editingId) return state;
      const now = new Date().toISOString();
      return {
        ...state,
        editingId: null,
        history: state.history.map((g) =>
          g.id === state.editingId
            ? { ...g, players: state.current.players, updatedAt: now }
            : g
        ),
        current: createInitialSession(),
      };
    }

    case "DELETE_GAME":
      return {
        ...state,
        history: state.history.filter((g) => g.id !== action.id),
      };

    case "MARK_SUBMITTED":
      return {
        ...state,
        history: state.history.map((g) =>
          g.id === action.id
            ? { ...g, submittedAt: new Date().toISOString() }
            : g
        ),
      };

    default:
      return { ...state, current: gameReducer(state.current, action) };
  }
}

function App() {
  const [state, dispatch] = useReducer(
    appReducer,
    null,
    () => loadAppState() ?? createInitialAppState()
  );

  useEffect(() => {
    saveAppState(state);
  }, [state]);

  const { current: session, history, editingId, viewingHistory } = state;
  const editingRecord = editingId
    ? history.find((g) => g.id === editingId) ?? null
    : null;

  // Render key so the entry-animation re-runs when the view changes.
  const viewKey = editingId
    ? `edit-${editingId}`
    : viewingHistory
      ? "history"
      : session.phase;

  return (
    <ToastProvider>
      <div className="app">
        <header className="app-header">
          <h1>Pocer</h1>
          <span className="app-subtitle">Poker Calculator</span>
        </header>
        <main className="app-main">
          <div className="screen-wrapper" key={viewKey}>
            {editingId ? (
              <CashoutScreen
                players={session.players}
                dispatch={dispatch}
                editing
                submittedAt={editingRecord?.submittedAt ?? null}
              />
            ) : viewingHistory ? (
              <HistoryScreen history={history} dispatch={dispatch} />
            ) : (
              <>
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
              </>
            )}
          </div>
        </main>
      </div>
    </ToastProvider>
  );
}

export default App;
