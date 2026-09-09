import { redirect } from 'next/navigation';

import Settings from '@/components/Settings';
import Shell from '@/components/Shell';
import { currentUser } from '@/lib/supabase';

export const metadata = { title: 'Settings — Inbox Triage' };

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) redirect('/login');

  return (
    <Shell email={user.email ?? ''}>
      <Settings />
    </Shell>
  );
}
