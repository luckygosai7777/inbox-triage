import { redirect } from 'next/navigation';

import Ledger from '@/components/Ledger';
import Shell from '@/components/Shell';
import { currentUser } from '@/lib/supabase';

export default async function LedgerPage() {
  const user = await currentUser();
  if (!user) redirect('/login');

  return (
    <Shell email={user.email ?? ''}>
      <Ledger />
    </Shell>
  );
}
