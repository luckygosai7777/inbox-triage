import Paper, { PAPER_VIEWPORT } from '@/components/public/Paper';

// The public pages share the beige paper theme (see styles/index.css).
export const viewport = PAPER_VIEWPORT;

export default function Layout({ children }: { children: React.ReactNode }) {
  return <Paper>{children}</Paper>;
}
