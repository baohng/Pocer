// Wire format between the browser and the insight endpoint.
//
// Mirrors the client-side definitions in src/utils/analytics.ts and
// src/utils/insight.ts, deliberately rather than importing them. The two sides
// are built by different toolchains -- Vite with bundler resolution for the
// app, Vercel with nodenext for the functions -- and reaching across that line
// drags the whole src tree into the function's type-check under the wrong
// module settings.
//
// Drift is contained by design: the server rebuilds every field explicitly in
// sanitizeFacts, so a field added on the client and not mirrored here is
// simply dropped before it reaches the model, rather than breaking anything.

export interface SessionResult {
  label: string;
  net: number;
  text: string;
}

export interface PlayerFacts {
  key: string;
  name: string;
  net: number;
  netText: string;
  sessions: number;
  wins: number;
  losses: number;
  best: SessionResult | null;
  worst: SessionResult | null;
  topSessions: SessionResult[];
  longestWinStreak: number;
  longestLoseStreak: number;
  currentStreak: number;
  maxDrawdown: number;
  maxDrawdownText: string;
  stdev: number;
  stdevText: string;
  avgStacks: number;
  concentration: number | null;
  curve: number[];
}

export interface MonthFacts {
  monthKey: string;
  gameCount: number;
  totalMoved: number;
  totalMovedText: string;
  players: PlayerFacts[];
}

export interface InsightSection {
  title: string;
  quote?: string;
  bullets: string[];
}

export interface Insight {
  headline: string;
  sections: InsightSection[];
}

export interface InsightRequest {
  facts: MonthFacts;
  focus: string | null;
}

export interface InsightResponse {
  insight: Insight;
  model: string;
}
