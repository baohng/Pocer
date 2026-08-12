import { useState, type Dispatch } from "react";
import type { Action, GameRecord } from "../types";
import { submitGameResult } from "../utils/api";
import { useToast } from "../components/Toast";

/** Re-sends a finished game's row to the Sheet and, on success, records the
 *  submission (which the history sync effect mirrors up to Supabase).
 *  Shared by the history list and the read-only game view. */
export function useResubmit(dispatch: Dispatch<Action>) {
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const { showToast } = useToast();

  async function resubmit(g: GameRecord) {
    setSubmittingId(g.id);
    try {
      await submitGameResult(new Date(g.endTime), g.players);
      dispatch({ type: "MARK_SUBMITTED", id: g.id });
      showToast("Corrected row submitted", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Submit failed", "warning");
    } finally {
      setSubmittingId(null);
    }
  }

  return { submittingId, resubmit };
}
