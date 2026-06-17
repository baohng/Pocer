export interface Player {
  id: string;
  name: string;
  active: boolean;
  stacksBought: number;
  chipsReturned: number | null;
  cashedOut: boolean;
}

export type Phase = "setup" | "playing" | "cashout" | "summary";

export interface Session {
  phase: Phase;
  players: Player[];
}

/** A finished game, snapshotted into history. */
export interface GameRecord {
  id: string;
  endTime: string; // ISO; from the cashout end-time, or finish time
  createdAt: string; // ISO; when first finished
  updatedAt: string; // ISO; bumped on each edit
  submittedAt: string | null; // last successful Sheet append, else null
  players: Player[];
}

/** Top-level persisted app state: the live game plus finished-game history. */
export interface AppState {
  current: Session;
  history: GameRecord[]; // newest first
  editingId: string | null; // non-null while editing a past record
  viewingHistory: boolean; // true while the history list is open
}

export type Action =
  | { type: "SET_PLAYER_NAME"; playerId: string; name: string }
  | { type: "ADD_PLAYER"; name?: string }
  | { type: "REMOVE_PLAYER"; playerId: string }
  | { type: "READD_PLAYER"; playerId: string }
  | { type: "EARLY_CASHOUT"; playerId: string; chips: number }
  | { type: "UNDO_EARLY_CASHOUT"; playerId: string }
  | { type: "START_GAME" }
  | { type: "BUY_STACK"; playerId: string }
  | { type: "UNDO_BUY"; playerId: string }
  | { type: "SET_STACKS_BOUGHT"; playerId: string; stacks: number }
  | { type: "END_GAME" }
  | { type: "SET_CHIPS_RETURNED"; playerId: string; chips: number | null }
  | { type: "CALCULATE" }
  | { type: "RESET" }
  // History & editing
  | { type: "FINISH_GAME"; endTime?: string }
  | { type: "OPEN_HISTORY" }
  | { type: "CLOSE_HISTORY" }
  | { type: "EDIT_GAME"; id: string }
  | { type: "SAVE_EDIT" }
  | { type: "DELETE_GAME"; id: string }
  | { type: "MARK_SUBMITTED"; id: string };
