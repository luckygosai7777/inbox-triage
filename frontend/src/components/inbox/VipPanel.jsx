/* The important-people list: add, remove, and a count of their open mail. */
import { useCallback, useEffect, useState } from 'react';

import { api } from '../../api/client.js';

export default function VipPanel({ say, onChanged, refreshKey }) {
  const [data, setData] = useState({ results: [], message_count: 0 });
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.vips());
    } catch (error) {
      say(error.message);
    }
  }, [say]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const valid = /.+@.+\..+/.test(draft.trim());

  const add = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await api.addVip(draft.trim().toLowerCase());
      setDraft('');
      say('Added to important people');
      await load();
      onChanged?.();
    } catch (error) {
      say(error.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    try {
      await api.removeVip(id);
      await load();
      onChanged?.();
    } catch (error) {
      say(error.message);
    }
  };

  return (
    <div className="card card-pad">
      <div className="row gap-8" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div className="h3">Important people</div>
        <span className="mono" style={{ color: 'var(--accent)' }}>
          {data.message_count} msgs
        </span>
      </div>
      <div className="small muted mt-4">
        Mail from these addresses is always surfaced at the top.
      </div>

      <div className="stack gap-4 mt-12">
        {data.results.map((person) => (
          <div key={person.id} className="vip-row">
            <span className="avatar">{person.initials}</span>
            <span className="truncate small" style={{ flex: 1 }}>
              {person.display_name}
            </span>
            <button
              type="button"
              className="btn-icon"
              onClick={() => remove(person.id)}
              title={`Remove ${person.email}`}
              aria-label={`Remove ${person.email}`}
            >
              ×
            </button>
          </div>
        ))}
        {!data.results.length && (
          <div className="small muted">
            Nobody flagged yet. Add an address, or open a thread and flag the sender.
          </div>
        )}
      </div>

      <form
        className="row gap-8 mt-12"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <input
          className="input input-sm"
          type="email"
          placeholder="add@address.com"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-label="Add an important person"
        />
        <button
          type="submit"
          className="btn btn-sm"
          style={{ flex: 'none' }}
          disabled={!valid || busy}
        >
          Add
        </button>
      </form>
    </div>
  );
}
