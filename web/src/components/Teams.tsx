'use client';

/**
 * Owed for Teams screens. Deliberately plain: Owed sits beside Gmail, it is
 * not an inbox (brief, principle 6). Every row shows its quote and opens the
 * real message in Gmail; replies become Gmail drafts, never sent from here.
 */
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '@/lib/http';

type Row = {
  id: string;
  direction: 'we_owe' | 'they_owe' | 'unanswered_ask';
  status: 'open' | 'done' | 'dismissed';
  owner_member_id: string | null;
  client_id: string | null;
  summary: string;
  source_quote: string;
  deadline: string | null;
  deadline_phrase: string;
  confidence: 'high' | 'low';
  created_at: string;
  link: string;
  mine: boolean;
};
type Ledger = {
  rows: Row[];
  byClient: {
    clientId: string | null;
    clientName: string;
    weOwe: number;
    weOweByOwner: { name: string; count: number }[];
    oldestLateDays: number | null;
    theyOwe: number;
    unanswered: number;
    rows: Row[];
  }[];
  byOwner: { memberId: string | null; name: string; open: number; overdue: number; oldestLateDays: number | null; rows: Row[] }[];
  clients: Record<string, string>;
  members: Record<string, string>;
};
type Me = {
  member: { id: string; role: 'member' | 'manager' | 'admin'; email: string };
  org: { name: string; primary_domain: string; extra_domains: string[]; settings: Record<string, any> };
  myMailbox: {
    id: string;
    email: string;
    sync_status: string;
    sync_error: string;
    last_synced_at: string | null;
    visible_to_managers: boolean;
  } | null;
  coverage: { connected: number; members: number; visibleToManagers: number };
};

const LABEL = { we_owe: 'We owe', they_owe: 'They owe us', unanswered_ask: 'Unanswered ask' } as const;

function useLoad<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const load = useCallback(async () => {
    const r = await apiFetch<T>(url);
    if (r.ok) {
      setData(r.data);
      setError(null);
    } else setError({ status: r.status, message: r.error });
  }, [url]);
  useEffect(() => {
    load();
  }, [load]);
  return { data, error, reload: load };
}

async function send(url: string, method: string, body?: unknown): Promise<string | null> {
  const r = await apiFetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.ok ? null : r.error;
}

function when(row: Row): { text: string; late: boolean } {
  if (!row.deadline) return { text: 'No deadline given', late: false };
  const days = Math.floor((Date.now() - new Date(row.deadline).getTime()) / 86_400_000);
  if (days > 0) return { text: `${days} day${days === 1 ? '' : 's'} late`, late: true };
  return { text: `Due ${new Date(row.deadline).toLocaleDateString()} (“${row.deadline_phrase}”)`, late: false };
}

export function TeamsNav({ current }: { current: 'mine' | 'clients' | 'owners' | 'admin' }) {
  const tabs = [
    ['mine', '/teams', 'My rows'],
    ['clients', '/teams/clients', 'Clients'],
    ['owners', '/teams/owners', 'People'],
    ['admin', '/teams/admin', 'Admin'],
  ] as const;
  return (
    <nav className="row wrap gap-8" aria-label="Owed for Teams" style={{ marginBottom: 20 }}>
      <span className="h2" style={{ marginRight: 12 }}>Owed for Teams</span>
      {tabs.map(([key, href, label]) => (
        <Link key={key} href={href} className={key === current ? 'btn btn-sm btn-primary' : 'btn btn-sm'} aria-current={key === current ? 'page' : undefined}>
          {label}
        </Link>
      ))}
    </nav>
  );
}

function Frame({ current, children }: { current: Parameters<typeof TeamsNav>[0]['current']; children: React.ReactNode }) {
  return (
    <main className="shell-pad" style={{ maxWidth: 980, margin: '0 auto', paddingTop: 28, paddingBottom: 60 }}>
      <TeamsNav current={current} />
      {children}
    </main>
  );
}

function RowCard({ row, ledger, onChange }: { row: Row; ledger: Ledger; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState('');
  const [assignTo, setAssignTo] = useState('');
  const due = when(row);

  const act = async (fn: () => Promise<string | null>, ok: string) => {
    setBusy(true);
    const error = await fn();
    setBusy(false);
    setNote(error ?? ok);
    if (!error) onChange();
  };

  return (
    <article className="card card-pad" style={{ marginBottom: 10 }}>
      <div className="row wrap gap-8" style={{ alignItems: 'baseline' }}>
        <span className="chip">{LABEL[row.direction]}</span>
        <strong>{row.summary}</strong>
        <span className="small" style={{ color: due.late ? 'var(--danger)' : 'var(--text-tertiary)', fontWeight: 600 }}>
          {due.text}
        </span>
      </div>
      <div className="tiny muted mt-4">
        {ledger.clients[row.client_id ?? ''] ?? 'Unknown client'} · {ledger.members[row.owner_member_id ?? ''] ?? 'Unassigned'}
        {row.status !== 'open' ? ` · ${row.status}` : ''}
      </div>
      <blockquote className="evidence" style={{ margin: '8px 0' }}>“{row.source_quote}”</blockquote>
      <div className="row wrap gap-8">
        <a className="btn btn-xs" href={row.link} target="_blank" rel="noopener noreferrer">
          Open in Gmail
        </a>
        {row.mine && row.status === 'open' && (
          <>
            <button className="btn btn-xs" disabled={busy} onClick={() => act(() => send(`/api/teams/rows/${row.id}`, 'PATCH', { status: 'done' }), 'Marked done')}>
              Done
            </button>
            <button className="btn btn-xs" disabled={busy} onClick={() => act(() => send(`/api/teams/rows/${row.id}`, 'PATCH', { status: 'dismissed' }), 'Dismissed')}>
              Not real
            </button>
            {row.direction !== 'they_owe' && (
              <button className="btn btn-xs" disabled={busy} onClick={() => setDrafting(!drafting)} aria-expanded={drafting}>
                Draft a reply
              </button>
            )}
          </>
        )}
        {row.mine && row.status !== 'open' && (
          <button className="btn btn-xs" disabled={busy} onClick={() => act(() => send(`/api/teams/rows/${row.id}`, 'PATCH', { status: 'open' }), 'Reopened')}>
            Reopen
          </button>
        )}
        {row.status === 'open' && (
          <span className="row gap-4">
            <label className="sr-only" htmlFor={`assign-${row.id}`}>Reassign to</label>
            <select id={`assign-${row.id}`} value={assignTo} onChange={(e) => setAssignTo(e.target.value)} className="small">
              <option value="">Reassign to…</option>
              {Object.entries(ledger.members)
                .filter(([id]) => id !== row.owner_member_id)
                .map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
            </select>
            <button
              className="btn btn-xs"
              disabled={busy || !assignTo}
              onClick={() => act(() => send(`/api/teams/rows/${row.id}/reassign`, 'POST', { to: assignTo }), 'Reassigned')}
            >
              Move
            </button>
          </span>
        )}
      </div>
      {drafting && (
        <div className="mt-8">
          <label className="label" htmlFor={`draft-${row.id}`}>Your reply. It is saved to your Gmail drafts; you send it from Gmail.</label>
          <textarea id={`draft-${row.id}`} className="draft-box" value={draft} onChange={(e) => setDraft(e.target.value)} rows={5} />
          <button
            className="btn btn-sm btn-primary mt-8"
            disabled={busy || !draft.trim()}
            onClick={async () => {
              setBusy(true);
              const r = await apiFetch<{ open: string }>(`/api/teams/rows/${row.id}/draft`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ body: draft }),
              });
              setBusy(false);
              if (r.ok) {
                setDrafting(false);
                setDraft('');
                setNote('Saved to Gmail drafts.');
                window.open(r.data.open, '_blank', 'noopener');
              } else setNote(r.error);
            }}
          >
            Save as Gmail draft
          </button>
        </div>
      )}
      {note && <p className="tiny mt-4" role="status">{note}</p>}
    </article>
  );
}

function Rows({ rows, ledger, onChange }: { rows: Row[]; ledger: Ledger; onChange: () => void }) {
  if (!rows.length) return <p className="small muted">Nothing here.</p>;
  return <>{rows.map((r) => <RowCard key={r.id} row={r} ledger={ledger} onChange={onChange} />)}</>;
}

function NotConnected({ message }: { message: string }) {
  return (
    <div className="card card-pad">
      <p className="small">{message}</p>
      <a className="btn btn-primary mt-12" href="/auth/google?for=teams">
        Connect my Google Workspace mailbox
      </a>
      <p className="tiny muted mt-8">
        Owed asks to read your mail and to save drafts. It never sends anything, and only threads with people outside
        your company are ever turned into rows.
      </p>
    </div>
  );
}

export function TeamsHome() {
  const me = useLoad<Me>('/api/teams/me');
  const ledger = useLoad<Ledger>('/api/teams/ledger');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (me.error) return <Frame current="mine"><NotConnected message={me.error.status === 403 ? me.error.message : `Could not load: ${me.error.message}`} /></Frame>;
  if (!me.data) return <Frame current="mine"><p className="small muted">Loading…</p></Frame>;
  const box = me.data.myMailbox;
  const reload = () => {
    me.reload();
    ledger.reload();
  };
  const mine = (ledger.data?.rows ?? []).filter((r) => r.mine);

  return (
    <Frame current="mine">
      <section className="card card-pad" style={{ marginBottom: 20 }}>
        {box ? (
          <>
            <div className="row wrap gap-8" style={{ alignItems: 'baseline' }}>
              <strong>{box.email}</strong>
              <span className="tiny muted">
                {box.sync_status === 'backfilling' ? 'Reading the last few weeks…' : box.sync_status}
                {box.last_synced_at ? ` · synced ${new Date(box.last_synced_at).toLocaleString()}` : ''}
              </span>
            </div>
            {box.sync_error && <p className="small" style={{ color: 'var(--danger)' }}>{box.sync_error}</p>}
            <div className="row wrap gap-8 mt-12">
              <button
                className="btn btn-sm"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setNote((await send('/api/teams/sync', 'POST')) ?? 'Synced.');
                  setBusy(false);
                  reload();
                }}
              >
                {busy ? 'Syncing…' : 'Sync now'}
              </button>
              <button
                className="btn btn-sm"
                onClick={async () => {
                  if (!confirm('Disconnect this mailbox? Google access is revoked and every row from it is deleted.')) return;
                  setNote((await send(`/api/teams/mailboxes/${box.id}`, 'DELETE')) ?? 'Disconnected and deleted.');
                  reload();
                }}
              >
                Disconnect and delete
              </button>
            </div>
            <div className="row gap-12 mt-16" style={{ alignItems: 'flex-start' }}>
              <button
                role="switch"
                aria-checked={box.visible_to_managers}
                aria-labelledby="visibility-label"
                className="toggle"
                onClick={async () => {
                  setNote((await send(`/api/teams/mailboxes/${box.id}`, 'PATCH', { visible_to_managers: !box.visible_to_managers })) ?? null);
                  reload();
                }}
              >
                <span className="toggle-knob" />
              </button>
              <div>
                <div id="visibility-label" className="small" style={{ fontWeight: 600 }}>
                  Let managers see my client rows
                </div>
                <p className="tiny muted mt-4">
                  Off by default, and only you can change it. When on, your managers see exactly what you see on this
                  page for client threads: the one-line summary, the quoted sentence, the client, the deadline and the
                  status. They never see internal mail, full emails, or anything else in your mailbox.
                </p>
              </div>
            </div>
          </>
        ) : (
          <NotConnected message="Your mailbox isn't connected." />
        )}
        <p className="tiny muted mt-12">
          Team coverage: {me.data.coverage.connected} of {me.data.coverage.members} mailboxes connected. A reply sent
          from an unconnected mailbox is invisible to Owed.
        </p>
        {note && <p className="tiny mt-4" role="status">{note}</p>}
      </section>

      <h1 className="h1" style={{ fontSize: 22, marginBottom: 12 }}>What you owe, and what clients owe you</h1>
      {ledger.error && <p className="small" style={{ color: 'var(--danger)' }}>{ledger.error.message}</p>}
      {ledger.data && <Rows rows={mine.filter((r) => r.status === 'open')} ledger={ledger.data} onChange={reload} />}
    </Frame>
  );
}

function ManagerOnly({ me, children }: { me: ReturnType<typeof useLoad<Me>>; children: React.ReactNode }) {
  if (me.error) return <NotConnected message={me.error.message} />;
  if (!me.data) return <p className="small muted">Loading…</p>;
  if (me.data.member.role === 'member') return <p className="small muted">This view is for managers and admins.</p>;
  return (
    <>
      <p className="tiny muted" style={{ marginBottom: 12 }}>
        Based on {me.data.coverage.visibleToManagers} of {me.data.coverage.members} team mailboxes (only mailboxes whose
        owners chose to share are included).
      </p>
      {children}
    </>
  );
}

export function TeamsClients() {
  const me = useLoad<Me>('/api/teams/me');
  const ledger = useLoad<Ledger>('/api/teams/ledger');
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Frame current="clients">
      <ManagerOnly me={me}>
        {ledger.data?.byClient.map((c) => {
          const key = c.clientId ?? 'none';
          const owners = c.weOweByOwner.map((o) => `${o.name} ${o.count}`).join(', ');
          return (
            <section key={key} className="card card-pad" style={{ marginBottom: 10 }}>
              <button className="btn-icon" style={{ width: '100%', textAlign: 'left', color: 'inherit' }} aria-expanded={open === key} onClick={() => setOpen(open === key ? null : key)}>
                <strong>{c.clientName}</strong>
                <span className="small">
                  {': '}we owe {c.weOwe}
                  {owners ? ` (${owners}` : ''}
                  {owners && c.oldestLateDays !== null ? `, oldest ${c.oldestLateDays} days late` : ''}
                  {owners ? ')' : ''} · they owe us {c.theyOwe} · {c.unanswered} unanswered ask{c.unanswered === 1 ? '' : 's'}
                </span>
              </button>
              {open === key && ledger.data && <div className="mt-12"><Rows rows={c.rows} ledger={ledger.data} onChange={ledger.reload} /></div>}
            </section>
          );
        })}
        {ledger.data && !ledger.data.byClient.length && <p className="small muted">No open client rows.</p>}
      </ManagerOnly>
    </Frame>
  );
}

export function TeamsOwners() {
  const me = useLoad<Me>('/api/teams/me');
  const ledger = useLoad<Ledger>('/api/teams/ledger');
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Frame current="owners">
      <ManagerOnly me={me}>
        {ledger.data?.byOwner.map((o) => {
          const key = o.memberId ?? 'none';
          return (
            <section key={key} className="card card-pad" style={{ marginBottom: 10 }}>
              <button className="btn-icon" style={{ width: '100%', textAlign: 'left', color: 'inherit' }} aria-expanded={open === key} onClick={() => setOpen(open === key ? null : key)}>
                <strong>{o.name}</strong>
                <span className="small">
                  {': '}{o.open} open · {o.overdue} overdue
                  {o.oldestLateDays !== null ? ` · oldest ${o.oldestLateDays} days late` : ''}
                </span>
              </button>
              {open === key && ledger.data && <div className="mt-12"><Rows rows={o.rows} ledger={ledger.data} onChange={ledger.reload} /></div>}
            </section>
          );
        })}
      </ManagerOnly>
    </Frame>
  );
}

type Admin = {
  members: { id: string; email: string; name: string; role: string; status: string }[];
  mailboxes: { id: string; member_id: string | null; email: string; sync_status: string; visible_to_managers: boolean }[];
  events: { id: number; action: string; target: string; at: string; actor_member_id: string | null }[];
};

export function TeamsAdmin() {
  const me = useLoad<Me>('/api/teams/me');
  const admin = useLoad<Admin>('/api/teams/admin');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState<string | null>(null);

  if (me.data && me.data.member.role !== 'admin') return <Frame current="admin"><p className="small muted">Only admins can manage the team.</p></Frame>;
  if (admin.error) return <Frame current="admin"><p className="small">{admin.error.message}</p></Frame>;
  const names = new Map((admin.data?.members ?? []).map((m) => [m.id, m.name || m.email]));

  return (
    <Frame current="admin">
      <section className="card card-pad" style={{ marginBottom: 20 }}>
        <h2 className="h2">Members</h2>
        <table className="compare mt-12" style={{ width: '100%' }}>
          <thead>
            <tr><th>Person</th><th>Role</th><th>Mailbox</th><th /></tr>
          </thead>
          <tbody>
            {admin.data?.members.filter((m) => m.status !== 'removed').map((m) => {
              const box = admin.data!.mailboxes.find((b) => b.member_id === m.id);
              return (
                <tr key={m.id}>
                  <td>{m.name || m.email}<div className="tiny muted">{m.email}{m.status === 'invited' ? ' · invited' : ''}</div></td>
                  <td>
                    <label className="sr-only" htmlFor={`role-${m.id}`}>Role for {m.email}</label>
                    <select
                      id={`role-${m.id}`}
                      value={m.role}
                      onChange={async (e) => {
                        setNote(await send('/api/teams/admin/members', 'PATCH', { id: m.id, role: e.target.value }));
                        admin.reload();
                      }}
                    >
                      <option value="member">Member</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="small">{box ? `${box.sync_status}${box.visible_to_managers ? ' · shared with managers' : ''}` : 'Not connected'}</td>
                  <td>
                    <button
                      className="btn btn-xs"
                      onClick={async () => {
                        if (!confirm(`Remove ${m.email} from the team?`)) return;
                        setNote(await send('/api/teams/admin/members', 'PATCH', { id: m.id, status: 'removed' }));
                        admin.reload();
                      }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <form
          className="row wrap gap-8 mt-16"
          onSubmit={async (e) => {
            e.preventDefault();
            const error = await send('/api/teams/admin/members', 'POST', { email });
            setNote(error ?? `Invited ${email}. They join when they connect their mailbox.`);
            if (!error) setEmail('');
            admin.reload();
          }}
        >
          <label className="sr-only" htmlFor="invite">Invite by email</label>
          <input id="invite" type="email" required placeholder={`name@${me.data?.org.primary_domain ?? 'company.com'}`} value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn btn-sm btn-primary" type="submit">Invite</button>
        </form>
        {note && <p className="tiny mt-8" role="status">{note}</p>}
      </section>

      <section className="card card-pad">
        <h2 className="h2">Audit log</h2>
        <p className="tiny muted mt-4">Append-only. Shows who looked at, moved or drafted on rows, and every connection or setting change.</p>
        <ul className="small mt-12" style={{ paddingLeft: 18 }}>
          {admin.data?.events.map((e) => (
            <li key={e.id}>
              {new Date(e.at).toLocaleString()} · {names.get(e.actor_member_id ?? '') ?? 'system'} · {e.action.replace(/_/g, ' ')} · {e.target}
            </li>
          ))}
        </ul>
      </section>
    </Frame>
  );
}
