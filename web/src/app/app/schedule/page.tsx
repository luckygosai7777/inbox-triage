import { redirect } from 'next/navigation';

import Schedule from '@/components/Schedule';
import Shell from '@/components/Shell';
import { currentUser } from '@/lib/supabase';

export default async function SchedulePage() {
  const user = await currentUser();
  if (!user) redirect('/login');

  return (
    <Shell email={user.email ?? ''}>
      <Schedule />
    </Shell>
  );
}
