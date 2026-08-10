import type { MonthFacts } from "./analytics";
import { supabase } from "../lib/supabase";

export interface InsightSection {
  title: string;
  quote?: string; // optional pull-quote rendered as a callout
  bullets: string[];
}

export interface Insight {
  headline: string;
  sections: InsightSection[];
}

/** What the client posts to /api/insight. The server builds the prompt from
 *  this -- the client never sends prompt text of its own. */
export interface InsightRequest {
  facts: MonthFacts;
  /** Stored name of the player to zoom in on, or null for the whole table.
   *  The month's full facts go up either way so the model can compare. */
  focus: string | null;
}

export interface InsightResponse {
  insight: Insight;
  model: string; // "mock" when the server has no API key configured
}

export interface CachedInsight extends InsightResponse {
  createdAt: string;
}

/** Cache row id: one insight per (month, scope) pair. */
export function insightKey(monthKey: string, focus: string | null): string {
  return `${monthKey}|${focus ?? "*"}`;
}

/** Stable fingerprint of the facts an insight was generated from. A new game,
 *  or an edit to an old one, changes it -- which is how the UI knows a cached
 *  insight has gone out of date. djb2; collisions don't matter here since a
 *  stale-but-matching hash only means one slightly old summary. */
export function hashFacts(facts: MonthFacts): string {
  const json = JSON.stringify(facts);
  let hash = 5381;
  for (let i = 0; i < json.length; i++) {
    hash = ((hash << 5) + hash + json.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

interface InsightRow {
  key: string;
  input_hash: string;
  content: Insight;
  model: string;
  created_at: string;
}

/** The stored insight for this scope, but only when it was generated from the
 *  exact same facts. A hash mismatch reads as "no cache" so the UI offers to
 *  regenerate rather than showing a summary that no longer matches the chart. */
export async function fetchCachedInsight(
  key: string,
  inputHash: string
): Promise<CachedInsight | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("ai_insights")
    .select("*")
    .eq("key", key)
    .maybeSingle();
  if (error) {
    console.error("[supabase] fetch insight failed", error);
    return null;
  }
  const row = data as InsightRow | null;
  if (!row || row.input_hash !== inputHash) return null;
  return { insight: row.content, model: row.model, createdAt: row.created_at };
}

export async function saveInsight(
  key: string,
  inputHash: string,
  response: InsightResponse
): Promise<string> {
  const createdAt = new Date().toISOString();
  if (!supabase) return createdAt;
  const { error } = await supabase.from("ai_insights").upsert({
    key,
    input_hash: inputHash,
    content: response.insight,
    model: response.model,
    created_at: createdAt,
  });
  if (error) console.error("[supabase] save insight failed", error);
  return createdAt;
}

export async function requestInsight(body: InsightRequest): Promise<InsightResponse> {
  const res = await fetch("/api/insight", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (payload && typeof payload.error === "string" && payload.error) ||
      `Máy chủ trả về ${res.status}`;
    throw new Error(message);
  }
  if (!payload?.insight?.headline) throw new Error("Phản hồi không đúng định dạng");
  return payload as InsightResponse;
}
