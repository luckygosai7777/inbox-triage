-- Migration 002 — background sync and daily digest.
-- Safe to run on a database that already has schema.sql applied.

alter table public.profiles
  add column if not exists timezone        text    not null default 'UTC',
  add column if not exists digest_enabled  boolean not null default true,
  add column if not exists digest_hour     smallint not null default 8
    check (digest_hour between 0 and 23),
  add column if not exists last_digest_at  timestamptz,
  add column if not exists sync_enabled    boolean not null default true,
  -- Set when sync fails repeatedly, so a broken account stops being retried
  -- every hour forever. Cleared on the next successful sync.
  add column if not exists sync_failures   smallint not null default 0;

-- The cron picks the stalest accounts first; this makes that ordering cheap.
create index if not exists profiles_sync_due_idx
  on public.profiles (last_synced_at nulls first)
  where sync_enabled;

create index if not exists profiles_digest_due_idx
  on public.profiles (digest_hour, last_digest_at)
  where digest_enabled;
