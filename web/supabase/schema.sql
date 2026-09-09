-- Inbox Triage — Supabase schema
--
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- You never write SQL after this; the app queries through the Supabase client's
-- query builder, which is typed JavaScript, not SQL strings.
--
-- SECURITY MODEL
-- --------------
-- Every table carries user_id and has Row Level Security ON with policies that
-- compare user_id to auth.uid(). This is the load-bearing control: even if an
-- API route forgets a filter, or an attacker gets hold of the public anon key,
-- Postgres itself refuses to return another user's rows. Application-level
-- checks are the second layer, not the only one.
--
-- The service-role key bypasses RLS by design, so it is used ONLY in server-side
-- code that has already established who the user is, and is never sent to the
-- browser.

-- ---------------------------------------------------------------- extensions
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------------ profiles
-- Mirrors auth.users so we can attach app data without touching Supabase's
-- managed auth schema.
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text default '',
  created_at  timestamptz not null default now(),
  last_synced_at timestamptz,
  -- Google refresh token, AES-256-GCM encrypted by the app before it ever
  -- reaches the database. Postgres only ever sees ciphertext.
  google_refresh_token_enc text,
  google_scopes text[] default '{}',

  -- Background sync and digest (see 002_background.sql for existing databases)
  timezone       text     not null default 'UTC',
  digest_enabled boolean  not null default true,
  digest_hour    smallint not null default 8 check (digest_hour between 0 and 23),
  last_digest_at timestamptz,
  sync_enabled   boolean  not null default true,
  sync_failures  smallint not null default 0
);

-- ------------------------------------------------------------------- threads
create table if not exists public.threads (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  gmail_thread_id   text not null,
  subject           text default '',
  latest_at         timestamptz not null default now(),
  is_open           boolean not null default true,

  -- Parsed VIP brief. brief_due_at is populated ONLY when a real date parser
  -- matched; at low confidence the UI shows the evidence and refuses a date.
  brief_ask         text default '',
  brief_why         text default '',
  brief_evidence    text default '',
  brief_due_at      timestamptz,
  brief_due_text    text default '',
  brief_confidence  text check (brief_confidence in ('high', 'low')),
  brief_parsed_at   timestamptz,
  brief_dismissed   boolean not null default false,

  created_at        timestamptz not null default now(),
  unique (user_id, gmail_thread_id)
);

-- ------------------------------------------------------------------ messages
create table if not exists public.messages (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  thread_id        uuid not null references public.threads(id) on delete cascade,
  gmail_message_id text not null,

  from_email       text not null default '',
  from_name        text default '',
  to_emails        text[] default '{}',
  subject          text default '',
  preview          text default '',
  sent_at          timestamptz not null,

  is_unread        boolean not null default true,
  is_archived      boolean not null default false,
  is_outbound      boolean not null default false,  -- from the user's SENT mail
  has_attachment   boolean not null default false,

  -- LLM-derived triage
  category         text default '',
  priority         smallint not null default 2 check (priority between 0 and 2),
  needs_reply      boolean not null default false,
  effort_minutes   smallint not null default 4 check (effort_minutes between 1 and 120),
  due_at           timestamptz,
  topics           text default '',
  classified_at    timestamptz,

  created_at       timestamptz not null default now(),
  unique (user_id, gmail_message_id)
);

-- --------------------------------------------------------------- commitments
-- The Commitment Ledger: promises the user made in their own sent mail, and
-- inbound asks they have not answered. Every row keeps the sentence it came
-- from, so a claim can always be checked against the source.
create table if not exists public.commitments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  thread_id      uuid references public.threads(id) on delete cascade,
  message_id     uuid references public.messages(id) on delete set null,

  -- 'owed'    = the user promised something (extracted from SENT mail)
  -- 'awaiting'= someone asked and the user never replied (inbound, unanswered)
  direction      text not null check (direction in ('owed', 'awaiting')),

  what           text not null,
  counterparty   text not null default '',
  counterparty_email text not null default '',
  evidence       text not null default '',
  due_at         timestamptz,
  due_text       text default '',
  confidence     text not null default 'low' check (confidence in ('high', 'low')),

  status         text not null default 'open' check (status in ('open', 'done', 'dropped')),
  resolved_at    timestamptz,
  -- Set when a later message in the thread appears to settle it, so the UI can
  -- suggest closing without deciding on the user's behalf.
  auto_resolved_hint boolean not null default false,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ------------------------------------------------------------ subscriptions
create table if not exists public.subscriptions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  sender_email      text not null,
  sender_name       text default '',
  list_unsubscribe  text default '',

  opens_count       integer not null default 0,
  clicks_count      integer not null default 0,
  dismissals_count  integer not null default 0,
  messages_per_month integer not null default 0,
  -- {"30":[opens,clicks,dismissals],"90":[...],"180":[...]}
  window_stats      jsonb not null default '{}'::jsonb,

  status            text not null default 'active'
                    check (status in ('active', 'unsubscribed', 'muted')),
  muted_at          timestamptz,
  last_activity_at  timestamptz,
  created_at        timestamptz not null default now(),
  unique (user_id, sender_email)
);

-- ------------------------------------------------------------- vip senders
create table if not exists public.vip_senders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  email      text not null,
  created_at timestamptz not null default now(),
  unique (user_id, email)
);

-- ----------------------------------------------------------- calendar slots
create table if not exists public.calendar_slots (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  external_id text default '',
  day         date not null,
  start_min   smallint not null check (start_min between 0 and 1440),
  end_min     smallint not null check (end_min between 0 and 1440),
  title       text default '',
  is_busy     boolean not null default true,
  created_at  timestamptz not null default now()
);

-- --------------------------------------------------------- slot assignments
create table if not exists public.slot_assignments (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  day        date not null,
  slot_key   text not null,
  created_at timestamptz not null default now(),
  unique (user_id, message_id, day)
);

-- ----------------------------------------------------------------- campaigns
create table if not exists public.campaigns (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  name              text not null default 'Untitled campaign',
  list_name         text default '',
  step              smallint not null default 1 check (step between 1 and 4),
  use_case          text not null default 'Job application',
  subject_template  text default '',
  body_template     text default '',
  tone              text not null default 'Formal' check (tone in ('Formal', 'Warm', 'Direct')),
  intensity         text not null default 'Tokens + opener'
                    check (intensity in ('Tokens only', 'Tokens + opener')),
  grounding         text default '',

  state             text not null default 'idle' check (state in ('idle', 'review', 'done')),
  cursor            integer not null default 0,
  approved          boolean not null default false,
  working_hours_only boolean not null default true,

  batch_cap         smallint not null default 20 check (batch_cap between 1 and 100),
  cooldown_hours    smallint not null default 6,
  window_start      timestamptz,
  window_sent       integer not null default 0,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.campaign_documents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name        text not null,
  size_bytes  bigint not null default 0,
  attach_rule text default '',
  storage_path text default '',
  position    integer not null default 0
);

create table if not exists public.campaign_recipients (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  email       text not null,
  name        text not null default '',
  org         text default '',
  role        text default '',
  position    integer not null default 0,
  sent_at     timestamptz,
  skipped     boolean not null default false,
  unique (campaign_id, email)
);

create table if not exists public.campaign_log (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  campaign_id         uuid not null references public.campaigns(id) on delete cascade,
  email               text not null,
  org                 text default '',
  note                text default '',
  documents_attached  integer not null default 0,
  created_at          timestamptz not null default now()
);

-- --------------------------------------------------------------- rate limits
-- Per-user counters for expensive operations (Gmail sync, LLM calls, campaign
-- sends). Kept in Postgres rather than memory because serverless functions do
-- not share state between invocations.
create table if not exists public.rate_limits (
  user_id     uuid not null references auth.users(id) on delete cascade,
  bucket      text not null,
  window_start timestamptz not null default now(),
  count       integer not null default 0,
  primary key (user_id, bucket)
);

-- ------------------------------------------------------------------- indexes
create index if not exists messages_user_priority_idx
  on public.messages (user_id, priority, sent_at desc);
create index if not exists messages_user_needs_reply_idx
  on public.messages (user_id, needs_reply) where needs_reply;
create index if not exists messages_user_sender_idx
  on public.messages (user_id, from_email);
create index if not exists messages_user_outbound_idx
  on public.messages (user_id, is_outbound, sent_at desc);
create index if not exists messages_thread_idx on public.messages (thread_id);
create index if not exists threads_user_latest_idx
  on public.threads (user_id, latest_at desc);
create index if not exists commitments_user_open_idx
  on public.commitments (user_id, status, due_at);
create index if not exists commitments_user_direction_idx
  on public.commitments (user_id, direction, status);
create index if not exists subscriptions_user_idx on public.subscriptions (user_id, status);
create index if not exists calendar_slots_user_day_idx on public.calendar_slots (user_id, day);
create index if not exists campaign_recipients_campaign_idx
  on public.campaign_recipients (campaign_id, position);
create index if not exists campaign_log_campaign_idx
  on public.campaign_log (campaign_id, created_at desc);

-- Full-text search over the fields the inbox search ranks on.
create index if not exists messages_search_idx on public.messages
  using gin (to_tsvector('english',
    coalesce(subject,'') || ' ' || coalesce(preview,'') || ' ' ||
    coalesce(from_name,'') || ' ' || coalesce(topics,'')));

-- ------------------------------------------------------- ROW LEVEL SECURITY
-- Nothing below is optional. Without it, the anon key would read every row in
-- the database.

alter table public.profiles            enable row level security;
alter table public.threads             enable row level security;
alter table public.messages            enable row level security;
alter table public.commitments         enable row level security;
alter table public.subscriptions       enable row level security;
alter table public.vip_senders         enable row level security;
alter table public.calendar_slots      enable row level security;
alter table public.slot_assignments    enable row level security;
alter table public.campaigns           enable row level security;
alter table public.campaign_documents  enable row level security;
alter table public.campaign_recipients enable row level security;
alter table public.campaign_log        enable row level security;
alter table public.rate_limits         enable row level security;

-- profiles keys on id rather than user_id.
drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- One owner policy per remaining table. `for all` covers select/insert/update/
-- delete; `with check` stops a user writing a row owned by someone else.
do $$
declare t text;
begin
  foreach t in array array[
    'threads', 'messages', 'commitments', 'subscriptions', 'vip_senders',
    'calendar_slots', 'slot_assignments', 'campaigns', 'campaign_documents',
    'campaign_recipients', 'campaign_log', 'rate_limits'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_owner', t);
    execute format(
      'create policy %I on public.%I for all using (auth.uid() = user_id) '
      'with check (auth.uid() = user_id)', t || '_owner', t);
  end loop;
end $$;

-- Deny anonymous access outright. RLS already blocks it, but revoking the grant
-- means an unauthenticated request fails at the permission layer first.
revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- ------------------------------------------------------------------ triggers
-- Create a profile row automatically whenever someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', '')
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep updated_at honest.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists campaigns_touch on public.campaigns;
create trigger campaigns_touch before update on public.campaigns
  for each row execute function public.touch_updated_at();

drop trigger if exists commitments_touch on public.commitments;
create trigger commitments_touch before update on public.commitments
  for each row execute function public.touch_updated_at();
