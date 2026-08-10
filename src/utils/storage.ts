import type { Session, Player } from "../types";

const STORAGE_KEY = "pocer_session_v4";

function migratePlayers(players: Player[]): Player[] {
  return players.map((p) => ({
    ...p,
    active: p.active ?? true,
    cashedOut: p.cashedOut ?? false,
    seat: p.seat ?? null,
  }));
}

/** Persists only the in-progress game to sessionStorage, so a reload
 *  doesn't lose it but it doesn't outlive the tab either. Finished-game
 *  history lives in Supabase (see utils/supabaseSync.ts) -- the app no
 *  longer depends on localStorage at all. */
export function saveCurrentSession(session: Session): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // sessionStorage full or unavailable - silently ignore
  }
}

export function loadCurrentSession(): Session | null {
  try {
    const data = sessionStorage.getItem(STORAGE_KEY);
    if (!data) return null;
    const session = JSON.parse(data) as Session;
    session.players = migratePlayers(session.players);
    session.buyLog = session.buyLog ?? [];
    session.undoneEntry = session.undoneEntry ?? null;
    return session;
  } catch {
    return null;
  }
}
