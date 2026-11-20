-- Owed for Teams — multi-tenant tables.
--
-- Run AFTER schema.sql, on the Teams STAGING project first (docs/AUDIT.md, D4).
-- Purely additive: no existing table, policy or function is changed, so the
-- personal app is unaffected.
--
-- SECURITY MODEL
-- --------------
-- Every table carries org_id and has RLS on. Policies ask public.org_role(),
-- which returns the caller's role in that org ('member' | 'manager' | 'admin')
-- or null. It is SECURITY DEFINER so policies on `members` can consult
-- `members` without recursing into their own RLS.
--
-- Writes from sync go through the service-role key (server only). Refresh
-- tokens live in mailbox_tokens, which has RLS on and NO policies: no signed-in
-- user can read even the ciphertext; only server code can.

-- -------------------------------------------------------------------- orgs
create table if not exists public.orgs (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  primary_domain text not null unique check (primary_domain = lower(primary_domain)),
  extra_domains  text[] not null default '{}',
  -- reply_hours: an ask older than this (business hours) with no reply is flagged.
  settings       jsonb not null default
                 '{"reply_hours": 24, "business_hours": [9, 18], "timezone": "Asia/Kolkata", "backfill_days": 30}',
  created_at     timestamptz not null default now()
);

-- ----------------------------------------------------------------- members
create table if not exists public.members (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id) on delete cascade,
  -- Null until the invited person first signs in.
  user_id    uuid references auth.users(id) on delete set null,
  email      text not null check (email = lower(email)),
  name       text not null default '',
  role       text not null default 'member' check (role in ('member', 'manager', 'admin')),
  status     text not null default 'invited' check (status in ('invited', 'active', 'removed')),
  created_at timestamptz not null default now(),
  unique (org_id, email)
);
create index if not exists members_user_idx on public.members (user_id);

-- --------------------------------------------------------------- mailboxes
create table if not exists public.mailboxes (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.orgs(id) on delete cascade,
  -- Nullable for shared mailboxes (Phase 4).
  member_id           uuid references public.members(id) on delete set null,
  email               text not null check (email = lower(email)),
  history_id          text,
  -- Where an unfinished backfill resumes: one run fits inside a 60s function.
  backfill_page_token text,
  sync_status         text not null default 'pending'
                      check (sync_status in ('pending', 'backfilling', 'ok', 'error', 'disconnected')),
  sync_error          text not null default '',
  -- Per-mailbox lock: a job claims the mailbox by setting this in the future.
  sync_locked_until   timestamptz,
  last_synced_at      timestamptz,
  -- Opt-in, and the mailbox owner's choice alone: off until they turn it on.
  visible_to_managers boolean not null default false,
  connected_at        timestamptz not null default now(),
  unique (org_id, email)
);

create table if not exists public.mailbox_tokens (
  mailbox_id        uuid primary key references public.mailboxes(id) on delete cascade,
  refresh_token_enc text not null,  -- AES-256-GCM, lib/crypto.ts
  updated_at        timestamptz not null default now()
);

-- ----------------------------------------------------------------- clients
create table if not exists public.clients (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id) on delete cascade,
  -- Email domain, or the full address for free-mail senders (lib/teams/clients.ts).
  key          text not null check (key = lower(key)),
  display_name text not null default '',
  created_at   timestamptz not null default now(),
  unique (org_id, key)
);

-- ------------------------------------------------------- thread_messages
-- Metadata of every external-thread message any connected mailbox has seen,
-- keyed by RFC 822 Message-ID, so "did ANY teammate reply?" can be answered
-- across mailboxes. No bodies, no subjects. Server-only (no policies).
create table if not exists public.thread_messages (
  org_id          uuid not null references public.orgs(id) on delete cascade,
  message_id      text not null,
  thread_key      text not null,
  mailbox_id      uuid references public.mailboxes(id) on delete cascade,
  from_email      text not null default '',
  from_internal   boolean not null,
  sent_at         timestamptz not null,
  primary key (org_id, message_id)
);
create index if not exists thread_messages_thread_idx on public.thread_messages (org_id, thread_key, sent_at);

-- ------------------------------------------------------------- ledger_rows
create table if not exists public.ledger_rows (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.orgs(id) on delete cascade,
  mailbox_id        uuid not null references public.mailboxes(id) on delete cascade,
  owner_member_id   uuid references public.members(id) on delete set null,
  client_id         uuid references public.clients(id) on delete set null,
  direction         text not null check (direction in ('we_owe', 'they_owe', 'unanswered_ask')),
  summary           text not null,
  -- Quote or nothing: a row without its source sentence cannot exist.
  source_quote      text not null check (length(btrim(source_quote)) > 0),
  source_message_id text not null,  -- RFC 822 Message-ID, the same in every mailbox
  gmail_message_id  text not null,  -- per mailbox; used for the link back
  gmail_thread_id   text not null,  -- per mailbox
  thread_key        text not null,  -- cross-mailbox thread (lib/teams/threads.ts)
  deadline          timestamptz,    -- only when the text states one
  deadline_phrase   text not null default '',
  status            text not null default 'open'
                    check (status in ('open', 'done', 'dismissed', 'reassigned')),
  confidence        text not null default 'low' check (confidence in ('high', 'low')),
  quote_hash        text generated always as (md5(source_quote)) stored,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- The same client email in three teammates' inboxes is one row, not three.
  -- A real constraint (not an expression index) so upserts can target it.
  constraint ledger_rows_dedupe unique (org_id, direction, source_message_id, quote_hash)
);
create index if not exists ledger_rows_open_idx on public.ledger_rows (org_id, status, deadline);
create index if not exists ledger_rows_thread_idx on public.ledger_rows (org_id, thread_key);

drop trigger if exists ledger_rows_touch on public.ledger_rows;
create trigger ledger_rows_touch before update on public.ledger_rows
  for each row execute function public.touch_updated_at();

-- -------------------------------------------------------- row_assignments
create table if not exists public.row_assignments (
  id          uuid primary key default gen_random_uuid(),
  row_id      uuid not null references public.ledger_rows(id) on delete cascade,
  from_member uuid references public.members(id) on delete set null,
  to_member   uuid references public.members(id) on delete set null,
  by_member   uuid references public.members(id) on delete set null,
  at          timestamptz not null default now(),
  reason      text not null default ''
);

-- ----------------------------------------------------------- audit_events
create table if not exists public.audit_events (
  id              bigint generated always as identity primary key,
  org_id          uuid not null references public.orgs(id) on delete cascade,
  actor_member_id uuid references public.members(id) on delete set null,
  action          text not null check (action in (
                    'row_viewed', 'row_reassigned', 'draft_created', 'mailbox_connected',
                    'mailbox_disconnected', 'settings_changed', 'data_deleted')),
  target          text not null default '',
  at              timestamptz not null default now(),
  metadata        jsonb not null default '{}'
);
create index if not exists audit_events_org_idx on public.audit_events (org_id, at desc);

-- Append-only, even for the service role. The one exception is the cascade
-- when a whole org is deleted (an admin's "delete all org data"): that delete
-- arrives through the foreign-key trigger, so pg_trigger_depth() is above 1.
create or replace function public.audit_events_append_only()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'audit_events is append-only';
end;
$$;
drop trigger if exists audit_events_no_change on public.audit_events;
create trigger audit_events_no_change before update or delete on public.audit_events
  for each row execute function public.audit_events_append_only();

-- ------------------------------------------------------------- role check
create or replace function public.org_role(target uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select role from public.members
  where org_id = target and user_id = auth.uid() and status = 'active'
  limit 1
$$;

create or replace function public.my_member_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select id from public.members where user_id = auth.uid() and status = 'active'
$$;

-- --------------------------------------------------------------- policies
alter table public.orgs            enable row level security;
alter table public.members         enable row level security;
alter table public.mailboxes       enable row level security;
alter table public.mailbox_tokens  enable row level security;  -- no policies: server only
alter table public.clients         enable row level security;
alter table public.thread_messages enable row level security;  -- no policies: server only
alter table public.ledger_rows     enable row level security;
alter table public.row_assignments enable row level security;
alter table public.audit_events    enable row level security;

-- Orgs are created server-side (after checking the creator's domain).
create policy orgs_read on public.orgs
  for select using (public.org_role(id) is not null);
create policy orgs_admin_update on public.orgs
  for update using (public.org_role(id) = 'admin') with check (public.org_role(id) = 'admin');

create policy members_read on public.members
  for select using (public.org_role(org_id) is not null);
create policy members_admin_write on public.members
  for all using (public.org_role(org_id) = 'admin') with check (public.org_role(org_id) = 'admin');

-- Every member may see which mailboxes are connected (that is what "based on
-- 5 of 8 mailboxes" needs); none of these columns is mail content.
create policy mailboxes_read on public.mailboxes
  for select using (public.org_role(org_id) is not null);
-- Only the mailbox's own member changes it (the visibility opt-in is theirs).
create policy mailboxes_owner_update on public.mailboxes
  for update using (member_id in (select public.my_member_ids()))
  with check (member_id in (select public.my_member_ids()));

create policy clients_read on public.clients
  for select using (public.org_role(org_id) is not null);

-- Rows you own (including ones reassigned to you), your own mailbox's rows,
-- plus, for managers and admins, rows from mailboxes whose owners opted in.
create policy ledger_rows_read on public.ledger_rows
  for select using (
    owner_member_id in (select public.my_member_ids())
    or exists (
      select 1 from public.mailboxes m
      where m.id = ledger_rows.mailbox_id
        and (
          m.member_id in (select public.my_member_ids())
          or (m.visible_to_managers and public.org_role(ledger_rows.org_id) in ('manager', 'admin'))
        )
    )
  );
-- Members change status on their own rows; reassignment is a server route.
create policy ledger_rows_owner_update on public.ledger_rows
  for update using (owner_member_id in (select public.my_member_ids()))
  with check (owner_member_id in (select public.my_member_ids()));

create policy row_assignments_read on public.row_assignments
  for select using (
    exists (select 1 from public.ledger_rows r where r.id = row_assignments.row_id)
  );  -- inherits ledger_rows' RLS through the subquery

create policy audit_events_admin_read on public.audit_events
  for select using (public.org_role(org_id) = 'admin');

-- schema.sql's grants covered only the tables that existed then.
revoke all on public.orgs, public.members, public.mailboxes, public.mailbox_tokens,
              public.clients, public.thread_messages, public.ledger_rows,
              public.row_assignments, public.audit_events from anon;
grant select on public.orgs, public.members, public.mailboxes, public.clients,
                public.ledger_rows, public.row_assignments, public.audit_events to authenticated;
-- Column-level, because the policies above say WHO may update, not WHAT: without
-- this a member could rewrite their mailbox's org_id and move it into another org.
-- user_id on members is set only server-side, when an invited email signs in.
grant update (visible_to_managers) on public.mailboxes to authenticated;
grant update (status) on public.ledger_rows to authenticated;
grant update (name, extra_domains, settings) on public.orgs to authenticated;
grant insert (org_id, email, name, role) on public.members to authenticated;
grant update (name, role, status) on public.members to authenticated;
grant delete on public.members to authenticated;
