import Link from 'next/link';

export default function NotFound() {
  return (
    <div
      className="shell"
      style={{ gridTemplateColumns: '1fr', placeItems: 'center', padding: 24, minHeight: '100vh' }}
    >
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div className="metric-number" style={{ fontSize: 56, color: 'var(--accent)' }}>
          404
        </div>
        <h1 className="h1 mt-12" style={{ fontSize: 22 }}>
          Nothing here
        </h1>
        <p className="small secondary mt-8">
          That page does not exist, or it moved. The inbox is still where you left it.
        </p>
        <div className="row gap-8 mt-16" style={{ justifyContent: 'center' }}>
          <Link href="/app" className="btn btn-primary" style={{ textDecoration: 'none' }}>
            Go to the app
          </Link>
          <Link href="/" className="btn" style={{ textDecoration: 'none' }}>
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
