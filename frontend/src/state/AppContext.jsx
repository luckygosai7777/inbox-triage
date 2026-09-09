/* Global app state: which view is showing, the signed-in user, and toasts.
   Per-view data lives in the views themselves; this only holds what is shared. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { api } from '../api/client.js';

const AppContext = createContext(null);

export const VIEWS = {
  inbox: { title: 'Inbox', subtitle: 'Sorted by reply priority' },
  schedule: {
    title: 'Schedule',
    subtitle: 'Replies packed into the gaps between today’s meetings',
  },
  bulk: {
    title: 'Bulk send',
    subtitle: 'One message, personalised per recipient, sent on a queue',
  },
};

export function AppProvider({ children }) {
  const [view, setView] = useState('inbox');
  const [account, setAccount] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const say = useCallback((message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const refreshAccount = useCallback(async () => {
    try {
      setAccount(await api.me());
    } catch (error) {
      setAccount({ authenticated: false, error: error.message });
    } finally {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAccount();
  }, [refreshAccount]);

  // The OAuth callback returns to "/?connected=1" (or "?auth_error=..."). Report
  // the outcome, then clean the query string so a refresh does not repeat it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('connected') && !params.has('auth_error')) return;
    if (params.has('connected')) {
      say('Google account connected');
      refreshAccount();
    } else {
      say(`Sign-in failed: ${params.get('auth_error')}`);
    }
    window.history.replaceState({}, '', window.location.pathname);
  }, [say, refreshAccount]);

  const signOut = useCallback(async () => {
    try {
      await api.signOut();
      say('Signed out');
      refreshAccount();
    } catch (error) {
      say(error.message);
    }
  }, [say, refreshAccount]);

  const value = useMemo(
    () => ({
      view,
      setView,
      account,
      authLoading,
      refreshAccount,
      signOut,
      toast,
      say,
    }),
    [view, account, authLoading, refreshAccount, signOut, toast, say],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
}
