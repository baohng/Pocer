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
