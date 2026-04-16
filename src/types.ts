export interface Player {
  id: string;
  name: string;
  stacksBought: number;
  chipsReturned: number | null;
}

export type Phase = "setup" | "playing" | "cashout" | "summary";

export interface Session {
  phase: Phase;
  players: Player[];
}

export type Action =
  | { type: "SET_PLAYER_NAME"; playerId: string; name: string }
  | { type: "ADD_PLAYER" }
  | { type: "REMOVE_PLAYER"; playerId: string }
  | { type: "START_GAME" }
  | { type: "BUY_STACK"; playerId: string }
  | { type: "UNDO_BUY"; playerId: string }
  | { type: "END_GAME" }
  | { type: "SET_CHIPS_RETURNED"; playerId: string; chips: number | null }
  | { type: "CALCULATE" }
  | { type: "RESET" };
