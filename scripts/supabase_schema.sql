-- Pocer: game history table for Supabase.
-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query).

create table if not exists game_records (
  id uuid primary key,
  end_time timestamptz not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  submitted_at timestamptz,
  players jsonb not null
);

create index if not exists game_records_end_time_idx on game_records (end_time);

-- No per-user auth in this app (fixed friend group, shared anon key).
-- RLS is enabled with a permissive policy so the anon key can read/write
-- its own history rows. Anyone holding the anon key can read/write this
-- table -- acceptable for a trusted-group scoreboard, not for sensitive data.
alter table game_records enable row level security;

create policy "anon full access" on game_records
  for all
  to anon
  using (true)
  with check (true);

-- Cache for the AI bankroll insights shown on the stats screen. One row per
-- (accounting month, scope) pair -- `key` is "8/2026|*" for the whole table or
-- "8/2026|hiếu" when a single player is soloed. `input_hash` fingerprints the
-- facts the summary was generated from, so adding or editing a game makes the
-- stored insight stop matching and the UI offers to regenerate instead of
-- showing a summary that no longer fits the chart.
create table if not exists ai_insights (
  key text primary key,
  input_hash text not null,
  content jsonb not null,
  model text not null,
  created_at timestamptz not null default now()
);

alter table ai_insights enable row level security;

create policy "anon full access" on ai_insights
  for all
  to anon
  using (true)
  with check (true);
