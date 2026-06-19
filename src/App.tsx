import { useReducer, useEffect, useState } from "react";
import type { Session, Action, Player, AppState, GameRecord, BuyEntry } from "./types";
import { saveAppState, loadAppState } from "./utils/storage";
import { readJoinTokenFromUrl, decodeSession, clearJoinTokenFromUrl } from "./utils/share";
import SetupScreen from "./components/SetupScreen";
import PlayingScreen from "./components/PlayingScreen";
import CashoutScreen from "./components/CashoutScreen";
import SummaryScreen from "./components/SummaryScreen";
import HistoryScreen from "./components/HistoryScreen";
import JoinScreen from "./components/JoinScreen";
import ShareSheet from "./components/ShareSheet";
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
    buyLog: [],
    undoneEntry: null,
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

    case "START_GAME": {
      const activePlayers = state.players.map((p) =>
        p.active ? { ...p, stacksBought: 1 } : p
      );
      const initialLog: BuyEntry[] = activePlayers
        .filter((p) => p.active)
        .map((p) => ({ playerId: p.id, playerName: p.name }));
      return {
        ...state,
        phase: "playing",
        players: activePlayers,
        buyLog: initialLog,
        undoneEntry: null,
      };
    }

    case "BUY_STACK": {
      const buyingPlayer = state.players.find((p) => p.id === action.playerId);
      if (!buyingPlayer) return state;
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.playerId
            ? { ...p, stacksBought: p.stacksBought + 1 }
            : p
        ),
        buyLog: [
          ...state.buyLog,
          { playerId: buyingPlayer.id, playerName: buyingPlayer.name },
        ],
        undoneEntry: null,
      };
    }

    case "UNDO_BUY":
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.playerId && p.stacksBought > 1
            ? { ...p, stacksBought: p.stacksBought - 1 }
            : p
        ),
      };

    case "UNDO_LAST_BUY": {
      if (state.buyLog.length === 0) return state;
      const last = state.buyLog[state.buyLog.length - 1];
      const targetPlayer = state.players.find((p) => p.id === last.playerId);
      if (!targetPlayer || targetPlayer.stacksBought <= 1) return state;
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === last.playerId
            ? { ...p, stacksBought: p.stacksBought - 1 }
            : p
        ),
        buyLog: state.buyLog.slice(0, -1),
        undoneEntry: last,
      };
    }

    case "REDO_LAST_BUY": {
      if (!state.undoneEntry) return state;
      const entry = state.undoneEntry;
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === entry.playerId
            ? { ...p, stacksBought: p.stacksBought + 1 }
            : p
        ),
        buyLog: [...state.buyLog, entry],
        undoneEntry: null,
      };
    }

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
        current: { phase: "cashout", players: record.players, buyLog: [], undoneEntry: null },
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

    case "LOAD_SHARED_SESSION":
      // Take over a session shared via link. Replaces the current session;
      // history is preserved on the receiver's device (only current session
      // travels in the link). Close any open history/edit views.
      return {
        ...state,
        current: action.session,
        editingId: null,
        viewingHistory: false,
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

  // A session shared via #join= link, awaiting the user's "Take over" confirm.
  const [pendingShare, setPendingShare] = useState<Session | null>(null);
  // Captured once on mount: was there a join token in the URL? Drives the
  // initial "decoding…" state without a synchronous setState in an effect.
  const [hadJoinToken] = useState(() => readJoinTokenFromUrl() !== null);
  const [decodingShare, setDecodingShare] = useState(hadJoinToken);
  // True if a join token was present but failed verification/shape.
  const [shareError, setShareError] = useState(false);

  useEffect(() => {
    saveAppState(state);
  }, [state]);

  // On mount, check for a shared-session token in the URL fragment.
  useEffect(() => {
    if (!hadJoinToken) return;
    const token = readJoinTokenFromUrl();
    if (!token) return;
    let cancelled = false;
    decodeSession(token).then((session) => {
      if (cancelled) return;
      setDecodingShare(false);
      if (session) {
        setPendingShare(session);
      } else {
        setShareError(true);
        clearJoinTokenFromUrl();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [hadJoinToken]);

  function handleTakeOver() {
    if (pendingShare) {
      dispatch({ type: "LOAD_SHARED_SESSION", session: pendingShare });
      setPendingShare(null);
      clearJoinTokenFromUrl();
    }
  }

  function handleDeclineShare() {
    setPendingShare(null);
    clearJoinTokenFromUrl();
  }

  function handleDismissShareError() {
    setShareError(false);
  }

  const [showShare, setShowShare] = useState(false);

  const { current: session, history, editingId, viewingHistory } = state;
  const canShare =
    !editingId && !viewingHistory && (session.phase === "playing" || session.phase === "cashout");
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
          {canShare && (
            <button
              className="btn btn-secondary btn-share"
              onClick={() => setShowShare(true)}
              aria-label="Share session"
            >
              Share
            </button>
          )}
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
                  <PlayingScreen players={session.players} buyLog={session.buyLog} undoneEntry={session.undoneEntry} dispatch={dispatch} />
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

        {decodingShare && (
          <div className="modal-overlay">
            <div className="modal">
              <p className="modal-message">Loading shared session…</p>
            </div>
          </div>
        )}

        {shareError && (
          <div className="modal-overlay" onClick={handleDismissShareError}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <p className="modal-message">
                This share link is invalid or has been tampered with.
              </p>
              <div className="modal-actions">
                <button className="btn btn-primary" onClick={handleDismissShareError}>
                  OK
                </button>
              </div>
            </div>
          </div>
        )}

        {pendingShare && (
          <JoinScreen
            session={pendingShare}
            hasExistingSession={session.phase !== "setup" || session.players.some((p) => p.stacksBought > 0)}
            onTakeOver={handleTakeOver}
            onDecline={handleDeclineShare}
          />
        )}

        {showShare && (
          <ShareSheet session={session} onClose={() => setShowShare(false)} />
        )}
      </div>
    </ToastProvider>
  );
}

export default App;
