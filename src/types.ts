export interface Player {
  id: string;
  name: string;
  active: boolean;
  stacksBought: number;
  chipsReturned: number | null;
  cashedOut: boolean;
}

export type Phase = "mode" | "setup" | "playing" | "cashout" | "summary";

export interface Session {
  phase: Phase;
  mode: "fixed" | "flexible";
  players: Player[];
}

export type Action =
  | { type: "CHOOSE_MODE"; mode: "fixed" | "flexible" }
  | { type: "BACK_TO_MODE" }
  | { type: "SET_PLAYER_NAME"; playerId: string; name: string }
  | { type: "ADD_PLAYER"; name?: string }
  | { type: "REMOVE_PLAYER"; playerId: string }
  | { type: "READD_PLAYER"; playerId: string }
  | { type: "EARLY_CASHOUT"; playerId: string; chips: number }
  | { type: "UNDO_EARLY_CASHOUT"; playerId: string }
  | { type: "START_GAME" }
  | { type: "BUY_STACK"; playerId: string }
  | { type: "UNDO_BUY"; playerId: string }
  | { type: "END_GAME" }
  | { type: "SET_CHIPS_RETURNED"; playerId: string; chips: number | null }
  | { type: "CALCULATE" }
  | { type: "RESET" };
