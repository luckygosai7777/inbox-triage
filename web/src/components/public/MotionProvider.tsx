'use client';

import { MotionConfig } from 'motion/react';

/** Every motion animation on the public pages honours the system's reduced-motion setting. */
export default function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
