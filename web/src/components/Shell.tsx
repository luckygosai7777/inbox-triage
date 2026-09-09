'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

import { createBrowserClient } from '@supabase/ssr';

const NAV = [
  { href: '/app', label: 'Inbox', icon: <span style={{ width: 16, height: 12, border: '1.5px solid currentColor', borderRadius: 2 }} /> },
  { href: '/app/ledger', label: 'What you owe', icon: <span style={{ width: 14, height: 14, border: '1.5px solid currentColor', borderRadius: 3, borderLeftWidth: 4 }} /> },
  { href: '/app/schedule', label: 'Schedule', icon: <span style={{ width: 14, height: 14, border: '1.5px solid currentColor', borderRadius: '50%' }} /> },
];

type ToastContext = { say: (message: string) => void };
const Toast = createContext<ToastContext>({ say: () => {} });
export const useToast = () => useContext(Toast);

export default function Shell({
  children,
  email,
}: {
  children: React.ReactNode;
  email: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = useCallback((message: string) => {
    setToast(message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const value = useMemo(() => ({ say }), [say]);

  const signOut = async () => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <Toast.Provider value={value}>
      <div className="shell">
        <nav className="nav-rail" aria-label="Main">
          <Link href="/app" className="nav-logo" style={{ textDecoration: 'none' }} title="Inbox Triage">
            T
          </Link>

          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="nav-item"
              aria-current={pathname === item.href}
              title={item.label}
              aria-label={item.label}
            >
              {item.icon}
            </Link>
          ))}

          <div className="spacer" />

          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className="nav-avatar"
              onClick={() => setMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              title="Account"
            >
              {(email || 'me').slice(0, 2).toUpperCase()}
            </button>
            {menuOpen && (
              <div className="menu" role="menu">
                <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-medium)' }}>
                  <div className="mono tiny muted" style={{ wordBreak: 'break-all' }}>
                    {email}
                  </div>
                </div>
                <Link href="/app/settings" role="menuitem" className="menu-item" style={{ display: 'block', textDecoration: 'none' }} onClick={() => setMenuOpen(false)}>
                  Settings
                </Link>
                <Link href="/privacy" role="menuitem" className="menu-item" style={{ display: 'block', textDecoration: 'none' }}>
                  Privacy
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  className="menu-item"
                  style={{ color: 'var(--danger)', borderTop: '1px solid var(--border-medium)' }}
                  onClick={signOut}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </nav>

        <main className="shell-main">{children}</main>

        {toast && (
          <div className="toast" role="status" aria-live="polite">
            {toast}
          </div>
        )}
      </div>
    </Toast.Provider>
  );
}
