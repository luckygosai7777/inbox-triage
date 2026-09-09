import { redirect } from 'next/navigation';

import Inbox from '@/components/Inbox';
import Shell from '@/components/Shell';
import { currentUser } from '@/lib/supabase';

export default async function InboxPage() {
  const user = await currentUser();
  if (!user) redirect('/login');

  return (
    <Shell email={user.email ?? ''}>
      <Inbox />
    </Shell>
  );
}
