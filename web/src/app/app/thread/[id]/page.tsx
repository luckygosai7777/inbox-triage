import { redirect } from 'next/navigation';

import Shell from '@/components/Shell';
import Thread from '@/components/Thread';
import { currentUser } from '@/lib/supabase';

export const metadata = { title: 'Thread — Inbox Triage' };

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  const { id } = await params;

  return (
    <Shell email={user.email ?? ''}>
      <Thread threadId={id} />
    </Shell>
  );
}
