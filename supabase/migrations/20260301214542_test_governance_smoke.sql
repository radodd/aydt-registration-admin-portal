-- Governance smoke test
-- Safe, additive, reversible

create table if not exists public._migration_smoke_test (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

comment on table public._migration_smoke_test is
  'Temporary table used to verify migration pipeline integrity.';