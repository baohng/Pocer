import type { AppState, Session, Player } from "../types";

const STORAGE_KEY = "pocer_session_v3";
const LEGACY_KEY = "pocer_session_v2";

function migratePlayers(players: Player[]): Player[] {
  return players.map((p) => ({
    ...p,
    active: p.active ?? true,
    cashedOut: p.cashedOut ?? false,
    seat: p.seat ?? null,
  }));
}

export function saveAppState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage full or unavailable - silently ignore
  }
}

export function loadAppState(): AppState | null {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      const state = JSON.parse(data) as AppState;
      state.current.players = migratePlayers(state.current.players);
      state.current.buyLog = state.current.buyLog ?? [];
      state.current.undoneEntry = state.current.undoneEntry ?? null;
      state.history = (state.history ?? []).map((g) => ({
        ...g,
        players: migratePlayers(g.players),
      }));
      state.editingId = state.editingId ?? null;
      state.viewingHistory = state.viewingHistory ?? false;
      return state;
    }

    // Migrate a legacy single-session save (pocer_session_v2).
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const session = JSON.parse(legacy) as Session;
      // Pre-history saves stuck on the removed "mode" phase had no players.
      if ((session.phase as string) === "mode" || session.players.length === 0) {
        return null;
      }
      session.players = migratePlayers(session.players);
      session.buyLog = session.buyLog ?? [];
      session.undoneEntry = session.undoneEntry ?? null;
      return {
        current: session,
        history: [],
        editingId: null,
        viewingHistory: false,
      };
    }

    return null;
  } catch {
    return null;
  }
}

export function clearAppState(): void {
  localStorage.removeItem(STORAGE_KEY);
}
