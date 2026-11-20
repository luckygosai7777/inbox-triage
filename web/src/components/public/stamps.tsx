'use client';

// The paper vocabulary of the public pages. A promise is a slip; its due date is a postmark,
// because the date came out of a letter; a late promise is cancelled in red the way the post
// cancels a used stamp; and a promise with no date gets an empty ring, never an invented one.
import { motion, type MotionValue } from 'motion/react';
import { useId, type ReactNode } from 'react';

/** Slightly uneven ink, so a stamp reads as pressed rather than drawn. */
function Ink({ id }: { id: string }) {
  return (
    <filter id={id} x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="7" result="n" />
      <feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" />
    </filter>
  );
}

/** A round date postmark. `ring` runs around the top edge. */
export function Postmark({
  day,
  date,
  ring = 'DATE FROM THE EMAIL',
  foot = 'DUE',
  className,
}: {
  day: string;
  date?: string;
  ring?: string;
  foot?: string;
  className?: string;
}) {
  const id = useId().replace(/[^a-z0-9]/gi, '');
  return (
    <svg viewBox="0 0 120 120" aria-hidden className={className}>
      <defs>
        <Ink id={`ink${id}`} />
        <path id={`arc${id}`} d="M 17 62 A 43 43 0 0 1 103 62" />
      </defs>
      <g filter={`url(#ink${id})`} fill="currentColor" stroke="currentColor">
        <circle cx="60" cy="60" r="55" fill="none" strokeWidth="3" />
        <circle cx="60" cy="60" r="33" fill="none" strokeWidth="1.4" />
        <text stroke="none" fontSize="9" fontWeight="700" letterSpacing="1.6">
          <textPath href={`#arc${id}`} startOffset="50%" textAnchor="middle">
            {ring}
          </textPath>
        </text>
        <text x="60" y={date ? 64 : 68} textAnchor="middle" stroke="none" fontSize="21" fontWeight="700" fontFamily="var(--font-display)">
          {day}
        </text>
        {date && (
          <text x="60" y="80" textAnchor="middle" stroke="none" fontSize="9" fontWeight="600" letterSpacing="1">
            {date}
          </text>
        )}
        {foot && (
          <text x="60" y="107" textAnchor="middle" stroke="none" fontSize="8" fontWeight="700" letterSpacing="2">
            {foot}
          </text>
        )}
      </g>
    </svg>
  );
}

/** The empty ring of a promise that named no date: Owed leaves it blank rather than guess. */
export function NoDate({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" aria-hidden className={className}>
      <circle cx="60" cy="60" r="54" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="5 6" />
      <text x="60" y="57" textAnchor="middle" fill="currentColor" fontSize="11" fontWeight="600">
        no date
      </text>
      <text x="60" y="72" textAnchor="middle" fill="currentColor" fontSize="11" fontWeight="600">
        given
      </text>
    </svg>
  );
}

/** Postal cancellation bars in red, drawn across a stamp. `drawn` is 0..1. */
export function Cancelled({ drawn, className }: { drawn: MotionValue<number> | number; className?: string }) {
  const id = useId().replace(/[^a-z0-9]/gi, '');
  const wave = (y: number) => `M 0 ${y} q 10 -5 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0`;
  return (
    <svg viewBox="0 0 160 60" aria-hidden className={className} fill="none">
      <defs>
        <Ink id={`ink${id}`} />
      </defs>
      <g filter={`url(#ink${id})`} stroke="var(--bad)" strokeWidth="3.2" strokeLinecap="round">
        {[10, 22, 34, 46].map((y) => (
          <motion.path key={y} d={wave(y)} style={{ pathLength: drawn }} />
        ))}
      </g>
    </svg>
  );
}

export type PromiseRow = {
  what: string;
  when: string;
  who: string;
  quote: string;
  late: boolean;
  /** Postmark face, when the sentence named a day. */
  day?: string;
};

/**
 * A promise on a paper slip. The quote is set in mono: everywhere on the site, mono means words
 * the user wrote. The stamp slot sits over the slip's top-right corner.
 */
export function Slip({ p, stamp, className }: { p: PromiseRow; stamp?: ReactNode; className?: string }) {
  return (
    <div className={`tw:relative tw:drop-shadow-[0_10px_18px_rgba(91,69,32,0.16)] ${className ?? ''}`}>
      <div className="slip tw:rounded-b-lg tw:bg-sheet tw:px-5 tw:pb-4 tw:pt-5 tw:pr-28">
        <p className="tw:font-serif tw:text-[1.05rem] tw:font-semibold tw:leading-snug tw:text-ink">{p.what}</p>
        <p className="tw:mt-0.5 tw:text-xs tw:text-ink-soft">{p.who}</p>
        <p className="tw:mt-2.5 tw:font-mono tw:text-[0.78rem] tw:leading-5 tw:text-ink-soft">{p.quote}</p>
        <p className={`tw:mt-2 tw:text-xs tw:font-semibold ${p.late ? 'tw:text-bad' : 'tw:text-ink-faint'}`}>{p.when}</p>
      </div>
      {stamp && <div className="tw:absolute tw:-right-3 tw:-top-4 tw:size-24">{stamp}</div>}
    </div>
  );
}

/** The stamp a slip wears: due postmark, cancelled when late, or the empty ring. */
export function StampFor({ p, cancel }: { p: PromiseRow; cancel: MotionValue<number> | number }) {
  if (!p.day) return <NoDate className="tw:size-full tw:-rotate-6 tw:text-ink-faint" />;
  return (
    <div className="tw:relative tw:size-full">
      <Postmark day={p.day} className="tw:size-full tw:rotate-[8deg] tw:text-accent/80" />
      {p.late && <Cancelled drawn={cancel} className="tw:absolute tw:inset-x-0 tw:top-1/2 tw:w-full tw:-translate-y-1/2 tw:-rotate-6" />}
    </div>
  );
}
