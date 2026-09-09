import { useEffect, useRef, useState } from 'react';

import { useApp } from '../state/AppContext.jsx';

const ITEMS = [
  {
    key: 'inbox',
    label: 'Inbox',
    icon: (
      <span
        style={{
          width: 16,
          height: 12,
          border: '1.5px solid currentColor',
          borderRadius: 2,
        }}
      />
    ),
  },
  {
    key: 'schedule',
    label: 'Schedule',
    icon: (
      <span
        style={{
          width: 14,
          height: 14,
          border: '1.5px solid currentColor',
          borderRadius: '50%',
        }}
      />
    ),
  },
  {
    key: 'bulk',
    label: 'Bulk send',
    icon: (
      <span
        style={{
          width: 11,
          height: 11,
          borderTop: '1.5px solid currentColor',
          borderRight: '1.5px solid currentColor',
          transform: 'rotate(45deg)',
          marginLeft: -3,
        }}
      />
    ),
  },
];

export default function NavRail() {
  const { view, setView, account, signOut } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (event) => event.key === 'Escape' && setMenuOpen(false);
    const onClick = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [menuOpen]);

  const email = account?.email || '';
  const initials = (account?.name || email || 'JD').slice(0, 2).toUpperCase();

  return (
    <nav className="nav-rail" aria-label="Main">
      <button
        type="button"
        className="nav-logo"
        onClick={() => setView('inbox')}
        title="Back to inbox"
      >
        T
      </button>

      {ITEMS.map((item) => (
        <button
          key={item.key}
          type="button"
          className="nav-item"
          aria-current={view === item.key}
          onClick={() => setView(item.key)}
          title={item.label}
          aria-label={item.label}
        >
          {item.icon}
        </button>
      ))}

      <div className="spacer" />

      <div style={{ position: 'relative' }} ref={menuRef}>
        <button
          type="button"
          className="nav-avatar"
          onClick={() => setMenuOpen((open) => !open)}
          title="Account"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          {initials}
        </button>

        {menuOpen && (
          <div className="menu" role="menu">
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-medium)' }}>
              <div className="small" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {account?.name || 'Not signed in'}
              </div>
              {email && (
                <div className="mono tiny muted mt-4" style={{ wordBreak: 'break-all' }}>
                  {email}
                </div>
              )}
              <div className="tiny mt-4" style={{ color: account?.google_connected ? 'var(--success)' : 'var(--warning)' }}>
                {account?.google_connected ? 'Gmail connected' : 'Gmail not connected'}
              </div>
            </div>
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => {
                setView('bulk');
                setMenuOpen(false);
              }}
            >
              New bulk send
            </button>
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              style={{ borderTop: '1px solid var(--border-medium)', color: 'var(--danger)' }}
              onClick={() => {
                setMenuOpen(false);
                signOut();
              }}
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
