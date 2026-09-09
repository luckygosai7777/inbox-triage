'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * Route-level error boundary. Shows a recovery path rather than a blank page,
 * and deliberately does not print the error text — it can carry internals.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[boundary]', error);
  }, [error]);

  return (
    <div
      className="shell"
      style={{ gridTemplateColumns: '1fr', placeItems: 'center', padding: 24, minHeight: '100vh' }}
    >
      <div style={{ textAlign: 'center', maxWidth: 460 }}>
        <h1 className="h1" style={{ fontSize: 22 }}>
          Something broke
        </h1>
        <p className="small secondary mt-8">
          That is on us, not you. Try again — if it keeps happening, sign out and back in.
        </p>
        {error.digest && (
          <p className="mono tiny muted mt-8">Reference: {error.digest}</p>
        )}
        <div className="row gap-8 mt-16" style={{ justifyContent: 'center' }}>
          <button type="button" className="btn btn-primary" onClick={reset}>
            Try again
          </button>
          <Link href="/app" className="btn" style={{ textDecoration: 'none' }}>
            Back to inbox
          </Link>
        </div>
      </div>
    </div>
  );
}
