'use client';

import { useEffect, useState } from 'react';

/** Transparent at the top, so the intro's letterhead lands on bare paper; ivory once scrolled. */
export default function StickyHeader({ children }: { children: React.ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 12);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  return (
    <header
      className={`tw-root tw:sticky tw:top-0 tw:z-40 tw:transition-[background-color,box-shadow] tw:duration-300 ${
        scrolled ? 'tw:bg-sheet/85 tw:shadow-md tw:shadow-[#5b4520]/8 tw:backdrop-blur-md' : ''
      }`}
    >
      {children}
    </header>
  );
}
