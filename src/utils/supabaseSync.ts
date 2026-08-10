import type { GameRecord, Player } from "../types";
import { supabase } from "../lib/supabase";

interface GameRecordRow {
  id: string;
  end_time: string;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  players: Player[];
}

function rowToRecord(row: GameRecordRow): GameRecord {
  return {
    id: row.id,
    endTime: row.end_time,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    submittedAt: row.submitted_at,
    players: row.players,
  };
}

function recordToRow(record: GameRecord): GameRecordRow {
  return {
    id: record.id,
    end_time: record.endTime,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    submitted_at: record.submittedAt,
    players: record.players,
  };
}

/** All game history rows from Supabase, newest first. Empty when Supabase
 *  isn't configured or the request fails -- callers fall back to local. */
export async function fetchRemoteHistory(): Promise<GameRecord[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("game_records")
    .select("*")
    .order("end_time", { ascending: false });
  if (error || !data) return [];
  return (data as GameRecordRow[]).map(rowToRecord);
}

export async function upsertRemoteGameRecord(record: GameRecord): Promise<void> {
  if (!supabase) return;
  await supabase.from("game_records").upsert(recordToRow(record));
}

export async function deleteRemoteGameRecord(id: string): Promise<void> {
  if (!supabase) return;
  await supabase.from("game_records").delete().eq("id", id);
}
