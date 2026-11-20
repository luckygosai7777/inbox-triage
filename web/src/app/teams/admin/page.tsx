import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { TeamsAdmin } from '@/components/Teams';
import { env } from '@/lib/env';

export const metadata: Metadata = { title: 'Admin · Owed for Teams' };

export default function Page() {
  // Owed for Teams exists only where it is switched on (not production today).
  if (!env().TEAMS_ENABLED) notFound();
  return <TeamsAdmin />;
}
