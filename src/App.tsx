import { useReducer, useEffect, useRef, useState } from "react";
import type { Session, Action, Player, AppState, GameRecord, BuyEntry } from "./types";
import { saveCurrentSession, loadCurrentSession } from "./utils/storage";
import { readJoinTokenFromUrl, decodeSession, clearJoinTokenFromUrl } from "./utils/share";
import {
  fetchRemoteHistory,
  upsertRemoteGameRecord,
  deleteRemoteGameRecord,
} from "./utils/supabaseSync";
import SetupScreen from "./components/SetupScreen";
import PlayingScreen from "./components/PlayingScreen";
import CashoutScreen from "./components/CashoutScreen";
import SummaryScreen from "./components/SummaryScreen";
import HistoryScreen from "./components/HistoryScreen";
import StatsScreen from "./components/StatsScreen";
import JoinScreen from "./components/JoinScreen";
import ShareSheet from "./components/ShareSheet";
import { ToastProvider } from "./components/Toast";
import "./App.css";

const DEFAULT_NAMES = [
  "Đạt", "Hải", "Bình", "Đông", "bé Đào", "Phúc", "Hiếu", "Bảo", "Tuấn Anh",
];

/** Stats/Sheets match players by name across sessions (ids are re-created
 *  each game), so two active players sharing a name silently collapse into
 *  one -- reject the add instead of letting that happen. */
function nameTaken(players: Player[], name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return players.some((p) => p.active && p.name.trim().toLowerCase() === normalized);
}

function createPlayer(name: string): Player {
  return {
    id: crypto.randomUUID(),
    name,
    active: true,
    stacksBought: 0,
    chipsReturned: null,
    cashedOut: false,
    seat: null,
  };
}

/** Assign random 1-based seats to the active players; inactive get null. */
function assignRandomSeats(players: Player[]): Player[] {
  const activeIds = players.filter((p) => p.active).map((p) => p.id);
  // Fisher–Yates shuffle of the active ids → seat order.
  for (let i = activeIds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [activeIds[i], activeIds[j]] = [activeIds[j], activeIds[i]];
  }
  const seatById = new Map(activeIds.map((id, i) => [id, i + 1]));
  return players.map((p) => ({ ...p, seat: seatById.get(p.id) ?? null }));
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
    viewingStats: false,
  };
}

/** Merge remote rows into local history by id; newer updatedAt wins.
 *  Result is sorted newest-first by endTime, matching history's invariant. */
function mergeHistories(local: GameRecord[], remote: GameRecord[]): GameRecord[] {
  const byId = new Map<string, GameRecord>();
  for (const g of local) byId.set(g.id, g);
  for (const g of remote) {
    const existing = byId.get(g.id);
    if (
      !existing ||
      new Date(g.updatedAt).getTime() > new Date(existing.updatedAt).getTime()
    ) {
      byId.set(g.id, g);
    }
  }
  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.endTime).getTime() - new Date(a.endTime).getTime()
  );
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
      if (nameTaken(state.players, name)) return state;
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
        players: assignRandomSeats(activePlayers),
        buyLog: initialLog,
        undoneEntry: null,
      };
    }

    case "SHUFFLE_SEATS":
      return { ...state, players: assignRandomSeats(state.players) };

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
    // Persist the finished game into history (and, via the sync effect in
    // App, up to Supabase) as soon as cashout is calculated -- not deferred
    // until "New Game" is clicked, which the user can skip entirely after
    // just checking the results.
    case "CALCULATE": {
      const now = new Date().toISOString();
      const record: GameRecord = {
        id: crypto.randomUUID(),
        endTime: action.endTime ?? now,
        createdAt: now,
        updatedAt: now,
        submittedAt: action.submitted ? now : null,
        players: state.current.players,
      };
      return {
        ...state,
        current: { ...state.current, phase: "summary" },
        history: [record, ...state.history],
      };
    }

    case "FINISH_GAME":
      return { ...state, current: createInitialSession() };

    case "OPEN_HISTORY":
      return { ...state, viewingHistory: true };

    case "CLOSE_HISTORY":
      return { ...state, viewingHistory: false, editingId: null };

    case "OPEN_STATS":
      return { ...state, viewingStats: true };

    case "CLOSE_STATS":
      return { ...state, viewingStats: false };

    case "MERGE_REMOTE_HISTORY":
      return { ...state, history: mergeHistories(state.history, action.remote) };

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
        viewingStats: false,
      };

    default:
      return { ...state, current: gameReducer(state.current, action) };
  }
}

function App() {
  const [state, dispatch] = useReducer(appReducer, null, () => {
    const restored = loadCurrentSession();
    const initial = createInitialAppState();
    return restored ? { ...initial, current: restored } : initial;
  });

  // A session shared via #join= link, awaiting the user's "Take over" confirm.
  const [pendingShare, setPendingShare] = useState<Session | null>(null);
  // Captured once on mount: was there a join token in the URL? Drives the
  // initial "decoding…" state without a synchronous setState in an effect.
  const [hadJoinToken] = useState(() => readJoinTokenFromUrl() !== null);
  const [decodingShare, setDecodingShare] = useState(hadJoinToken);
  // True if a join token was present but failed verification/shape.
  const [shareError, setShareError] = useState(false);

  useEffect(() => {
    saveCurrentSession(state.current);
  }, [state]);

  // On mount, pull remote history from Supabase and merge it in (no-op if
  // Supabase isn't configured). Runs once; subsequent local changes are
  // pushed up by the diff effect below.
  useEffect(() => {
    fetchRemoteHistory().then((remote) => {
      if (remote.length > 0) {
        dispatch({ type: "MERGE_REMOTE_HISTORY", remote });
      }
    });
  }, []);

  // Mirror local history edits to Supabase: push changed/new records,
  // delete ones removed locally. No-op if Supabase isn't configured.
  const prevHistoryRef = useRef<GameRecord[]>(state.history);
  useEffect(() => {
    const prev = prevHistoryRef.current;
    const prevById = new Map(prev.map((g) => [g.id, g]));
    const nextById = new Map(state.history.map((g) => [g.id, g]));
    for (const g of state.history) {
      const before = prevById.get(g.id);
      if (!before || before.updatedAt !== g.updatedAt) {
        upsertRemoteGameRecord(g);
      }
    }
    for (const id of prevById.keys()) {
      if (!nextById.has(id)) {
        deleteRemoteGameRecord(id);
      }
    }
    prevHistoryRef.current = state.history;
  }, [state.history]);

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

  const { current: session, history, editingId, viewingHistory, viewingStats } = state;
  const canShare =
    !editingId && !viewingHistory && !viewingStats &&
    (session.phase === "playing" || session.phase === "cashout");
  const editingRecord = editingId
    ? history.find((g) => g.id === editingId) ?? null
    : null;

  // The stats chart is the one screen that benefits from a wide viewport, so it
  // opts out of the app-wide 480px cap (see the .wide-view rules in App.css).
  useEffect(() => {
    document.body.classList.toggle("wide-view", viewingStats);
    return () => document.body.classList.remove("wide-view");
  }, [viewingStats]);

  // Render key so the entry-animation re-runs when the view changes.
  const viewKey = editingId
    ? `edit-${editingId}`
    : viewingStats
      ? "stats"
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
            ) : viewingStats ? (
              <StatsScreen history={history} dispatch={dispatch} />
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
