'use client';

/**
 * A number that counts up to its value.
 *
 * Worth the component because the figure it renders — how many things you owe
 * — is the one number on the page a person actually reacts to, and a value
 * that animates into place is read, where one that is simply present is
 * skimmed.
 *
 * Driven by requestAnimationFrame against a wall clock rather than a fixed
 * step per frame, so it takes the same time on a 60Hz and a 120Hz display, and
 * it never overshoots when a frame is dropped.
 */

import { useEffect, useRef, useState } from 'react';

export default function CountUp({
  value,
  duration = 900,
  className,
}: {
  value: number;
  duration?: number;
  className?: string;
}) {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    // Respect the system setting: this is decoration, and decoration is the
    // first thing that should stop when someone asks for less movement.
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (reduced || value === fromRef.current) {
      setShown(value);
      fromRef.current = value;
      return;
    }

    const from = fromRef.current;
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // Ease-out cubic: fast at first, settling rather than stopping.
      const eased = 1 - (1 - t) ** 3;
      setShown(Math.round(from + (value - from) * eased));
      if (t < 1) frameRef.current = requestAnimationFrame(tick);
      else fromRef.current = value;
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [value, duration]);

  return <span className={className}>{shown}</span>;
}
