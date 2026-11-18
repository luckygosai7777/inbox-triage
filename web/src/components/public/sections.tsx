'use client';

// The public pages' animated parts. The copy lives in the pages; the example rows and people here
// are the site's own illustrations, and each picture that shows them says so.
import {
  Ban,
  CalendarDays,
  Check,
  Clock,
  Database,
  KeyRound,
  LogOut,
  Mail,
  Minus,
  Plus,
  Send,
  ShieldQuestion,
  X,
} from 'lucide-react';
import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type Variants,
} from 'motion/react';
import Link from 'next/link';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import Logo from '@/components/Logo';

import { useArrived } from './IntroGate';
import { ScrollType, TypeOnce } from './type';

const EASE = [0.22, 1, 0.36, 1] as const;
const rise: Variants = {
  hidden: { opacity: 0, y: 16 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
};
const SHADOW = 'tw:shadow-lg tw:shadow-[#5b4520]/10';

function ExampleTag() {
  return (
    <span className="tw:rounded-full tw:bg-accent-soft tw:px-2 tw:py-0.5 tw:text-[0.7rem] tw:font-medium tw:text-ink-soft">
      Example
    </span>
  );
}

/**
 * A number that counts up once when it scrolls into view. The final value is always in the DOM:
 * read by screen readers, and shown instead of the count when JavaScript is off (styles/index.css).
 */
export function CountUp({
  to,
  format = (n) => String(Math.round(n)),
  start = true,
}: {
  to: number;
  format?: (n: number) => string;
  /** Hold the count until this turns true as well as being in view. */
  start?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.8 });
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const text = useTransform(mv, format);
  useEffect(() => {
    if (!inView || !start) return;
    if (reduce) {
      mv.set(to);
      return;
    }
    const c = animate(mv, to, { duration: 1.1, ease: EASE });
    return () => c.stop();
  }, [inView, start, reduce, to, mv]);
  return (
    <span ref={ref}>
      <motion.span aria-hidden className="count-live">
        {text}
      </motion.span>
      <span className="count-final">{format(to)}</span>
    </span>
  );
}

// ----------------------------------------------------------------------------------- layout

/** A section heading that types itself as it scrolls into view. */
export function SectionIntro({ id, title, body, center }: { id?: string; title: string; body?: string; center?: boolean }) {
  return (
    <div id={id} className={`tw:mx-auto tw:max-w-6xl tw:scroll-mt-24 tw:px-6 ${center ? 'tw:text-center' : ''}`}>
      <ScrollType
        as="h2"
        text={title}
        className={`tw:max-w-3xl tw:font-serif tw:text-[2.1rem] tw:font-semibold tw:leading-tight tw:tracking-tight tw:text-ink tw:sm:text-5xl ${center ? 'tw:mx-auto' : ''}`}
      />
      {body && (
        <ScrollType
          text={body}
          from="start 90%"
          to="start 50%"
          className={`tw:mt-5 tw:max-w-2xl tw:text-lg tw:leading-8 tw:text-ink-soft ${center ? 'tw:mx-auto' : ''}`}
        />
      )}
    </div>
  );
}

/** One step of how it works: its words type as you scroll, its picture plays beside them. */
export function Chapter({ n, title, body, flip, children }: { n: number; title: string; body: string; flip?: boolean; children: ReactNode }) {
  return (
    <section className="tw:mx-auto tw:grid tw:max-w-6xl tw:gap-10 tw:px-6 tw:py-14 tw:lg:grid-cols-2 tw:lg:gap-20 tw:lg:py-20">
      <div className={`tw:lg:sticky tw:lg:top-32 tw:lg:self-start ${flip ? 'tw:lg:order-2' : ''}`}>
        <motion.span
          initial={{ opacity: 0, scale: 0.6 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          className="tw:inline-flex tw:size-11 tw:items-center tw:justify-center tw:rounded-full tw:bg-accent tw:font-serif tw:text-xl tw:font-semibold tw:text-white tw:shadow-lg tw:shadow-accent/25"
          aria-hidden
        >
          {n}
        </motion.span>
        <ScrollType
          as="h3"
          text={title}
          className="tw:mt-5 tw:font-serif tw:text-[1.9rem] tw:font-semibold tw:leading-tight tw:tracking-tight tw:text-ink tw:sm:text-[2.4rem]"
        />
        <ScrollType text={body} from="start 85%" to="start 30%" className="tw:mt-5 tw:max-w-xl tw:text-lg tw:leading-8 tw:text-ink-soft" />
      </div>
      <div className="tw:min-w-0 tw:space-y-6">{children}</div>
    </section>
  );
}

// ------------------------------------------------------------------------------------- hero

const HERO_ROWS = [
  {
    what: 'Send the revised deck',
    when: '2 days late',
    who: 'You told Maya Okonkwo you would',
    quote: '“I’ll send the revised deck by Friday, once legal have looked at section 4.”',
    late: true,
  },
  {
    what: 'Accept or decline the Nov 14 keynote',
    when: 'Was due yesterday',
    who: 'Tom Bekele asked and you haven’t replied',
    quote: '“Need an answer by Friday so we can lock the running order.”',
    late: true,
  },
  {
    what: 'Review the rebrand scope doc',
    when: 'No deadline given',
    who: 'You told Ravi Menon you would',
    quote: '“I’ll review the scope doc and get back to you with comments.”',
    late: false,
  },
];

/** A picture of the product beats a description of it: the total counts up, then the rows slide in. */
function LedgerShot({ run }: { run: boolean }) {
  return (
    <motion.div
      animate={run ? { y: [0, -6, 0] } : {}}
      transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
      className="tw:overflow-hidden tw:rounded-2xl tw:border tw:border-rule tw:bg-sheet tw:shadow-2xl tw:shadow-[#5b4520]/15"
    >
      <div className="tw:flex tw:items-center tw:gap-2 tw:bg-paper/70 tw:px-4 tw:py-2.5">
        <span aria-hidden className="tw:size-2.5 tw:rounded-full tw:bg-[#f87171]" />
        <span aria-hidden className="tw:size-2.5 tw:rounded-full tw:bg-[#f5c451]" />
        <span aria-hidden className="tw:size-2.5 tw:rounded-full tw:bg-[#4ade9b]" />
        <span className="tw:ml-2 tw:text-xs tw:text-ink-faint">what you owe</span>
        <span className="tw:ml-auto">
          <ExampleTag />
        </span>
      </div>
      <div className="tw:p-5 tw:sm:p-6">
        <p className="tw:flex tw:items-baseline tw:gap-3">
          <span className="tw:font-serif tw:text-5xl tw:font-semibold tw:tracking-tight tw:text-ink tw:tabular-nums">
            <CountUp to={7} start={run} />
          </span>
          <span className="tw:font-medium tw:text-ink">things you owe people</span>
        </p>
        <motion.p
          initial={{ opacity: 0 }}
          animate={run ? { opacity: 1 } : {}}
          transition={{ delay: 1.1 }}
          className="tw:mt-1 tw:text-sm tw:font-semibold tw:text-bad"
        >
          3 of these are already late
        </motion.p>
        <motion.ul
          initial="hidden"
          animate={run ? 'shown' : 'hidden'}
          transition={{ staggerChildren: 0.35, delayChildren: 1.4 }}
          className="tw:mt-5 tw:space-y-2.5"
        >
          {HERO_ROWS.map((r) => (
            <motion.li
              key={r.what}
              variants={{ hidden: { opacity: 0, x: 28 }, shown: { opacity: 1, x: 0, transition: { duration: 0.5, ease: EASE } } }}
              className="tw:flex tw:gap-3 tw:rounded-xl tw:bg-paper/60 tw:p-3"
            >
              <span aria-hidden className={`tw:w-1 tw:shrink-0 tw:rounded-full ${r.late ? 'tw:bg-bad tw:motion-safe:animate-pulse' : 'tw:bg-ink-faint/40'}`} />
              <div className="tw:min-w-0 tw:text-sm">
                <p className="tw:flex tw:flex-wrap tw:items-baseline tw:gap-x-2">
                  <span className="tw:font-semibold tw:text-ink">{r.what}</span>
                  <span className={`tw:font-semibold ${r.late ? 'tw:text-bad' : 'tw:text-ink-faint'}`}>{r.when}</span>
                </p>
                <p className="tw:mt-0.5 tw:text-xs tw:text-ink-soft">{r.who}</p>
                <p className="tw:mt-1.5 tw:border-l-2 tw:border-rule tw:pl-2.5 tw:text-xs tw:italic tw:leading-5 tw:text-ink-soft">{r.quote}</p>
              </div>
            </motion.li>
          ))}
        </motion.ul>
      </div>
    </motion.div>
  );
}

/** The headline types once the intro has handed over; the rest follows it in. */
export function LandingHero() {
  const arrived = useArrived();
  const [typed, setTyped] = useState(false);
  return (
    <section className="tw:mx-auto tw:grid tw:max-w-6xl tw:items-center tw:gap-14 tw:px-6 tw:pb-24 tw:pt-8 tw:lg:grid-cols-[1.05fr_1fr] tw:lg:pt-14">
      <div>
        <motion.p initial={{ opacity: 0 }} animate={arrived ? { opacity: 1 } : {}} className="tw:text-sm tw:font-medium tw:text-ink-soft">
          For people who answer a lot of email
        </motion.p>
        <TypeOnce
          as="h1"
          start={arrived}
          cps={34}
          onDone={() => setTyped(true)}
          accent="promises"
          text={'You don’t have an inbox problem.\nYou have a promises problem.'}
          className="tw:mt-5 tw:whitespace-pre-line tw:font-serif tw:text-[2.5rem] tw:font-semibold tw:leading-[1.08] tw:tracking-tight tw:text-ink tw:sm:text-[3.5rem]"
        />
        <motion.div initial={{ opacity: 0, y: 14 }} animate={typed ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6, ease: EASE }}>
          <p className="tw:mt-7 tw:max-w-xl tw:text-lg tw:leading-8 tw:text-ink-soft">
            You wrote “I’ll send it Friday” and moved on. That sentence is now sitting in your Sent folder, where nobody will
            ever read it again — including you. Owed reads it, and hands you the list.
          </p>
          <div className="tw:mt-8 tw:flex tw:flex-wrap tw:gap-3">
            <Link href="/login" className="btn btn-primary tw:px-6 tw:py-3 tw:text-base">
              Continue with Google
            </Link>
            <Link href="/pricing" className="btn tw:px-6 tw:py-3 tw:text-base">
              See pricing
            </Link>
          </div>
          <p className="tw:mt-4 tw:text-sm tw:text-ink-faint">Free to start · Nothing sends itself · Delete everything in one click</p>
        </motion.div>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 36, scale: 0.95 }}
        animate={arrived ? { opacity: 1, y: 0, scale: 1 } : {}}
        transition={{ delay: 0.6, duration: 0.9, ease: EASE }}
      >
        <LedgerShot run={arrived} />
      </motion.div>
    </section>
  );
}

// ---------------------------------------------------------------------------------- problem

/**
 * Ranked horizontal bars, one series: thin, square at the baseline, value at the tip. Every row is
 * labelled, and a table carries the values for screen readers.
 */
function RankedBars({ rows, max, format }: { rows: { label: string; value: number }[]; max: number; format: (v: number) => string }) {
  return (
    <div>
      <motion.ul
        aria-hidden
        initial="hidden"
        whileInView="shown"
        viewport={{ once: true, amount: 0.5 }}
        transition={{ staggerChildren: 0.07 }}
        className="tw:space-y-3"
      >
        {rows.map((r) => (
          <li key={r.label} className="tw:text-sm">
            <span className="tw:block tw:text-ink-soft">{r.label}</span>
            <span className="tw:mt-1 tw:flex tw:items-center tw:gap-2">
              <motion.span
                variants={{ hidden: { width: 0 }, shown: { width: `${(r.value / max) * 85}%`, transition: { duration: 0.8, ease: EASE } } }}
                className="tw:h-3 tw:rounded-r-[4px] tw:bg-series"
              />
              <motion.span
                variants={{ hidden: { opacity: 0 }, shown: { opacity: 1, transition: { delay: 0.5 } } }}
                className="tw:shrink-0 tw:text-xs tw:font-semibold tw:text-ink tw:tabular-nums"
              >
                {format(r.value)}
              </motion.span>
            </span>
          </li>
        ))}
      </motion.ul>
      {/* The div hides it: a table won't shrink to sr-only's 1px, and on a phone that widened the page. */}
      <div className="sr-only"><table>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              <td>{format(r.value)}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}

function SentenceMini() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.7 });
  const reduce = useReducedMotion();
  return (
    <div ref={ref} className="tw:space-y-3">
      <div className="tw:rounded-xl tw:rounded-tl-sm tw:bg-paper tw:px-3.5 tw:py-2.5 tw:text-sm tw:text-ink">
        <TypeOnce as="p" start={inView} cps={34} text="I’ll circle back with numbers on Monday." />
      </div>
      <div className="tw:flex tw:items-center tw:gap-2 tw:text-xs tw:text-ink-soft">
        <CalendarDays className="tw:size-4" aria-hidden />
        <span className="tw:relative tw:font-semibold tw:text-ink">
          Monday
          <motion.span
            aria-hidden
            initial={{ scaleX: 0 }}
            animate={inView ? { scaleX: 1 } : {}}
            transition={{ delay: reduce ? 0 : 1.6, duration: 0.5 }}
            className="tw:absolute tw:inset-x-0 tw:top-1/2 tw:h-[2px] tw:origin-left tw:bg-bad"
          />
        </span>
        <motion.span initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}} transition={{ delay: reduce ? 0 : 2 }}>
          came and went
        </motion.span>
      </div>
    </div>
  );
}

function ChaseMini() {
  return (
    <div className="tw:space-y-3">
      <div className="tw:rounded-xl tw:rounded-tr-sm tw:border tw:border-rule tw:bg-sheet tw:px-3.5 tw:py-2.5 tw:text-sm tw:text-ink">
        Could you send the signed copy when you get a sec?
      </div>
      <p className="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:text-ink-soft">
        <Clock className="tw:size-4 tw:text-bad" aria-hidden />
        Waiting for{' '}
        <span className="tw:font-semibold tw:text-bad tw:tabular-nums">
          <CountUp to={12} /> days
        </span>
      </p>
    </div>
  );
}

function DayMini() {
  return (
    <RankedBars
      max={240}
      format={(m) => (m >= 60 ? `${m / 60} hours` : `${m} min`)}
      rows={[
        { label: 'Gaps between meetings', value: 43 },
        { label: 'Replies waiting', value: 240 },
      ]}
    />
  );
}

const MINIS = [<SentenceMini key="s" />, <ChaseMini key="c" />, <DayMini key="d" />];

/** The three problem cards, each with its own small animation above the copy. */
export function ProblemCards({ cards }: { cards: { title: string; body: string }[] }) {
  return (
    <motion.div
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, amount: 0.25 }}
      transition={{ staggerChildren: 0.15 }}
      className="tw:mx-auto tw:mt-12 tw:grid tw:max-w-6xl tw:gap-5 tw:px-6 tw:md:grid-cols-3"
    >
      {cards.map((p, i) => (
        <motion.article key={p.title} variants={rise} className={`tw:flex tw:flex-col tw:rounded-2xl tw:border tw:border-rule tw:bg-sheet tw:p-6 ${SHADOW}`}>
          <div className="tw:min-h-28">{MINIS[i]}</div>
          <h3 className="tw:mt-6 tw:font-serif tw:text-xl tw:font-semibold tw:text-ink">{p.title}</h3>
          <p className="tw:mt-2 tw:text-sm tw:leading-6 tw:text-ink-soft">{p.body}</p>
        </motion.article>
      ))}
    </motion.div>
  );
}

// ----------------------------------------------------------------------------- how it works

/** Step 1: one sign-in; what Owed may and may not do. */
export function ConnectViz() {
  const items: [string, boolean][] = [
    ['Read your mail', true],
    ['Read your calendar', true],
    ['Send anything by itself', false],
  ];
  return (
    <motion.div
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, amount: 0.5 }}
      className={`tw:rounded-2xl tw:border tw:border-rule tw:bg-sheet tw:p-6 ${SHADOW}`}
    >
      <div className="tw:flex tw:items-center tw:justify-between tw:gap-4">
        <span className="tw:flex tw:items-center tw:gap-2.5 tw:rounded-xl tw:bg-paper tw:px-3 tw:py-2 tw:text-sm tw:font-medium tw:text-ink">
          <Mail className="tw:size-4 tw:text-accent" aria-hidden /> Your Google account
        </span>
        <svg aria-hidden viewBox="0 0 100 10" className="tw:h-3 tw:flex-1">
          <motion.path
            d="M 2 5 L 98 5"
            stroke="var(--check)"
            strokeWidth={2}
            strokeLinecap="round"
            variants={{ hidden: { pathLength: 0 }, shown: { pathLength: 1, transition: { duration: 0.8, ease: 'easeInOut' } } }}
          />
        </svg>
        <motion.span
          variants={{ hidden: { scale: 0.6, opacity: 0 }, shown: { scale: 1, opacity: 1, transition: { delay: 0.7, type: 'spring', stiffness: 400, damping: 16 } } }}
        >
          <Logo size={44} />
        </motion.span>
      </div>
      <motion.ul transition={{ staggerChildren: 0.25, delayChildren: 1 }} className="tw:mt-6 tw:space-y-2.5">
        {items.map(([label, allowed]) => (
          <motion.li key={label} variants={rise} className="tw:flex tw:items-center tw:gap-3 tw:rounded-lg tw:bg-paper/70 tw:px-3.5 tw:py-2.5 tw:text-sm">
            {allowed ? <Check className="tw:size-4 tw:text-ok" aria-hidden /> : <X className="tw:size-4 tw:text-bad" aria-hidden />}
            <span className={allowed ? 'tw:text-ink' : 'tw:text-ink-soft'}>{label}</span>
            <span className={`tw:ml-auto tw:text-xs tw:font-semibold ${allowed ? 'tw:text-ok' : 'tw:text-bad'}`}>{allowed ? 'Allowed' : 'Never'}</span>
          </motion.li>
        ))}
      </motion.ul>
    </motion.div>
  );
}

/** Step 2: the promise is found in a sent email and becomes a row. */
export function ExtractViz() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const reduce = useReducedMotion();
  const later = (s: number) => ({ delay: reduce ? 0 : s, duration: 0.6, ease: EASE });
  return (
    <div ref={ref}>
      <div className={`tw:rounded-2xl tw:border tw:border-rule tw:bg-sheet tw:p-5 tw:text-sm ${SHADOW}`}>
        <p className="tw:flex tw:items-center tw:gap-2 tw:text-xs tw:text-ink-faint">
          <Send className="tw:size-3.5" aria-hidden /> Sent, 3 weeks ago
          <span className="tw:ml-auto">
            <ExampleTag />
          </span>
        </p>
        <p className="tw:mt-2 tw:text-xs tw:text-ink-soft">
          To <span className="tw:font-medium tw:text-ink">Maya Okonkwo</span>
        </p>
        <p className="tw:font-semibold tw:text-ink">Re: Q3 deck</p>
        <div className="tw:mt-3 tw:space-y-1.5 tw:leading-6 tw:text-ink-soft">
          <p>Hi Maya, thanks for the notes.</p>
          <p>
            <motion.mark
              initial={{ backgroundSize: '0% 100%' }}
              animate={inView ? { backgroundSize: '100% 100%' } : {}}
              transition={later(0.6)}
              className="tw:rounded-sm tw:bg-linear-to-r tw:from-accent-soft tw:to-accent-soft tw:bg-no-repeat tw:px-0.5 tw:text-ink"
            >
              I’ll send the revised deck by Friday, once legal have looked at section 4.
            </motion.mark>
          </p>
          <p>Speak soon.</p>
        </div>
      </div>
      <svg aria-hidden viewBox="0 0 20 40" className="tw:mx-auto tw:h-10 tw:w-5">
        <motion.path
          d="M10 2 L10 34 M4 28 L10 36 L16 28"
          fill="none"
          stroke="var(--series)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={inView ? { pathLength: 1 } : {}}
          transition={later(1.3)}
        />
      </svg>
      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.97 }}
        animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
        transition={later(1.8)}
        className="tw:flex tw:gap-3 tw:rounded-xl tw:border tw:border-rule tw:bg-sheet tw:p-4 tw:shadow-md tw:shadow-[#5b4520]/10"
      >
        <span aria-hidden className="tw:w-1 tw:shrink-0 tw:rounded-full tw:bg-series" />
        <div className="tw:text-sm">
          <p className="tw:flex tw:flex-wrap tw:items-baseline tw:gap-x-2">
            <span className="tw:font-semibold tw:text-ink">Send the revised deck</span>
            <span className="tw:font-semibold tw:text-ink-soft">Due Friday</span>
          </p>
          <p className="tw:mt-0.5 tw:text-xs tw:text-ink-soft">You told Maya Okonkwo you would</p>
          <p className="tw:mt-2 tw:inline-flex tw:items-center tw:gap-1.5 tw:rounded-full tw:bg-ok-soft tw:px-2 tw:py-0.5 tw:text-xs tw:font-medium tw:text-ok">
            <Check className="tw:size-3" aria-hidden /> Date read from your own sentence
          </p>
        </div>
      </motion.div>
    </div>
  );
}

const LIST = [
  { what: 'Review the rebrand scope doc', when: 'No deadline given', rank: 2, late: false },
  { what: 'Send the revised deck', when: '2 days late', rank: 0, late: true },
  { what: 'Accept or decline the Nov 14 keynote', when: 'Was due yesterday', rank: 1, late: true },
];

/** Step 3: one list. Rows arrive as they were found, then settle into order of how late they are. */
export function ListViz() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const [sorted, setSorted] = useState(false);
  useEffect(() => {
    if (!inView) return;
    const t = setTimeout(() => setSorted(true), 1300);
    return () => clearTimeout(t);
  }, [inView]);
  const rows = sorted ? [...LIST].sort((a, b) => a.rank - b.rank) : LIST;
  return (
    <div ref={ref} className={`tw:rounded-2xl tw:border tw:border-rule tw:bg-sheet tw:p-5 ${SHADOW}`}>
      <p className="tw:flex tw:items-center tw:gap-2 tw:text-sm">
        <span className="tw:font-semibold tw:text-ink">What you owe</span>
        <ExampleTag />
        <span className="tw:ml-auto tw:text-xs tw:text-ink-faint" aria-live="polite">
          {sorted ? 'Most late first' : 'As found'}
        </span>
      </p>
      <ul className="tw:mt-3 tw:space-y-2">
        {rows.map((r) => (
          <motion.li
            key={r.what}
            layout
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            className="tw:flex tw:items-center tw:gap-3 tw:rounded-lg tw:bg-paper/70 tw:px-3 tw:py-2.5 tw:text-sm"
          >
            <span aria-hidden className={`tw:h-6 tw:w-1 tw:shrink-0 tw:rounded-full ${r.late ? 'tw:bg-bad' : 'tw:bg-ink-faint/40'}`} />
            <span className="tw:min-w-0 tw:flex-1 tw:truncate tw:font-medium tw:text-ink">{r.what}</span>
            <span className={`tw:shrink-0 tw:text-xs tw:font-semibold ${r.late ? 'tw:text-bad' : 'tw:text-ink-faint'}`}>{r.when}</span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

const DAY = { start: 9, end: 18 };
const MEETINGS = [
  { from: 9.5, to: 10.5, label: 'Stand-up' },
  { from: 11.5, to: 13, label: 'Client review' },
  { from: 14, to: 15, label: 'Budget call' },
  { from: 16, to: 17.5, label: 'Workshop' },
];
const REPLIES = [
  { from: 10.5, to: 11.25, label: 'Maya' },
  { from: 13, to: 13.5, label: 'Tom' },
  { from: 15, to: 15.75, label: 'Ravi' },
];
const clock = (h: number) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

/** The reply schedule: replies packed into the real gaps between meetings. */
export function ScheduleViz() {
  const pct = (h: number) => `${((h - DAY.start) / (DAY.end - DAY.start)) * 100}%`;
  const block = 'tw:absolute tw:inset-y-1 tw:overflow-hidden tw:rounded-md tw:px-1.5 tw:py-1 tw:text-[0.65rem] tw:font-medium tw:leading-tight tw:text-white';
  return (
    <motion.div
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, amount: 0.6 }}
      className={`tw:rounded-2xl tw:border tw:border-rule tw:bg-sheet tw:p-5 ${SHADOW}`}
    >
      <p className="tw:text-sm tw:font-semibold tw:text-ink">Today’s reply schedule</p>
      <p className="tw:mt-0.5 tw:text-xs tw:text-ink-faint">From your calendar. Example day.</p>
      <div aria-hidden className="tw:relative tw:mt-5 tw:h-14 tw:rounded-lg tw:bg-paper">
        {MEETINGS.map((m) => (
          <div key={m.label} className={`${block} tw:bg-accent/85`} style={{ left: pct(m.from), width: `calc(${pct(m.to)} - ${pct(m.from)} - 2px)` }} title={m.label}>
            <span className="tw:hidden tw:sm:inline">{m.label}</span>
          </div>
        ))}
        {REPLIES.map((r, i) => (
          <motion.div
            key={r.label}
            variants={{ hidden: { opacity: 0, y: -18 }, shown: { opacity: 1, y: 0, transition: { delay: 0.5 + i * 0.35, type: 'spring', stiffness: 300, damping: 18 } } }}
            className={`${block} tw:bg-series`}
            style={{ left: pct(r.from), width: `calc(${pct(r.to)} - ${pct(r.from)} - 2px)` }}
            title={r.label}
          >
            <span className="tw:hidden tw:sm:inline">{r.label}</span>
          </motion.div>
        ))}
      </div>
      <div aria-hidden className="tw:mt-1.5 tw:flex tw:justify-between tw:text-[0.65rem] tw:text-ink-faint">
        {[9, 11, 13, 15, 17].map((h) => (
          <span key={h}>{h}:00</span>
        ))}
      </div>
      <div aria-hidden className="tw:mt-3 tw:flex tw:flex-wrap tw:gap-x-5 tw:gap-y-1 tw:text-xs tw:text-ink-soft">
        <span className="tw:inline-flex tw:items-center tw:gap-1.5">
          <span className="tw:h-2.5 tw:w-4 tw:rounded-sm tw:bg-accent/85" /> Meetings
        </span>
        <span className="tw:inline-flex tw:items-center tw:gap-1.5">
          <span className="tw:h-2.5 tw:w-4 tw:rounded-sm tw:bg-series" /> Replies, in the gaps
        </span>
      </div>
      <div className="sr-only"><table>
        <caption>Example day: meetings from your calendar, and replies placed in the gaps</caption>
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">What</th>
          </tr>
        </thead>
        <tbody>
          {[...MEETINGS.map((m) => ({ ...m, kind: 'Meeting' })), ...REPLIES.map((r) => ({ ...r, kind: 'Reply' }))]
            .sort((a, b) => a.from - b.from)
            .map((s) => (
              <tr key={s.label}>
                <td>
                  {clock(s.from)} to {clock(s.to)}
                </td>
                <td>
                  {s.kind}: {s.label}
                </td>
              </tr>
            ))}
        </tbody>
      </table></div>
    </motion.div>
  );
}

// ------------------------------------------------------------------------------- comparison

/** Rows sit apart as cards, with no rules between them. */
export function CompareTable({ rows }: { rows: readonly (readonly [string, string, string])[] }) {
  const cell = 'tw:px-5 tw:py-3.5 tw:first:rounded-l-xl tw:last:rounded-r-xl';
  const row = `${cell} tw:bg-sheet`;
  return (
    <div className="tw:mx-auto tw:mt-10 tw:max-w-6xl tw:overflow-x-auto tw:px-6">
      <table className="tw:w-full tw:min-w-[34rem] tw:border-separate tw:border-spacing-y-2 tw:text-sm">
        <thead>
          <tr className="tw:text-left tw:text-xs tw:text-ink-soft">
            <th scope="col" className="tw:px-5 tw:py-2 tw:font-semibold">Tool</th>
            <th scope="col" className="tw:px-5 tw:py-2 tw:font-semibold">What it does well</th>
            <th scope="col" className="tw:px-5 tw:py-2 tw:font-semibold">What it misses</th>
          </tr>
        </thead>
        <motion.tbody initial="hidden" whileInView="shown" viewport={{ once: true, amount: 0.5 }} transition={{ staggerChildren: 0.12 }}>
          {rows.map(([tool, does, misses]) => (
            <motion.tr key={tool} variants={rise}>
              <th scope="row" className={`${row} tw:text-left tw:font-semibold tw:text-ink`}>{tool}</th>
              <td className={`${row} tw:text-ink-soft`}>{does}</td>
              <td className={`${row} tw:text-ink-faint`}>{misses}</td>
            </motion.tr>
          ))}
          <motion.tr variants={{ hidden: { opacity: 0, scale: 0.98 }, shown: { opacity: 1, scale: 1, transition: { duration: 0.6, ease: EASE } } }}>
            <th scope="row" className={`${cell} tw:bg-ok-soft tw:text-left tw:font-bold tw:text-ink`}>
              <span className="tw:inline-flex tw:items-center tw:gap-2">
                <Logo size={20} /> Owed
              </span>
            </th>
            <td className={`${cell} tw:bg-ok-soft tw:font-medium tw:text-ink`}>Reads your sent mail for promises you made</td>
            <td className={`${cell} tw:bg-ok-soft tw:text-ink-soft`}>Still needs you to press Send</td>
          </motion.tr>
        </motion.tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------------------------ trust

const TRUST_ICONS = { send: Send, key: KeyRound, database: Database, guess: ShieldQuestion, training: Ban, leave: LogOut };
export type TrustIcon = keyof typeof TRUST_ICONS;

export function TrustGrid({ items }: { items: { icon: TrustIcon; title: string; body: string }[] }) {
  return (
    <motion.div
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, amount: 0.2 }}
      transition={{ staggerChildren: 0.1 }}
      className="tw:mx-auto tw:mt-12 tw:grid tw:max-w-6xl tw:gap-4 tw:px-6 tw:sm:grid-cols-2 tw:lg:grid-cols-3"
    >
      {items.map(({ icon, title, body }) => {
        const Icon = TRUST_ICONS[icon];
        return (
          <motion.div key={title} variants={rise} className="tw:rounded-2xl tw:border tw:border-rule tw:bg-sheet tw:p-5">
            <motion.span
              variants={{ hidden: { rotate: -20, scale: 0.6 }, shown: { rotate: 0, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 14 } } }}
              className="tw:flex tw:size-10 tw:items-center tw:justify-center tw:rounded-xl tw:bg-accent-soft tw:text-accent"
            >
              <Icon className="tw:size-5" aria-hidden />
            </motion.span>
            <h3 className="tw:mt-4 tw:font-semibold tw:text-ink">{title}</h3>
            <p className="tw:mt-1.5 tw:text-sm tw:leading-6 tw:text-ink-soft">{body}</p>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------------- pricing

export type Plan = {
  name: string;
  price: number;
  cadence: string;
  pitch: string;
  cta: string;
  featured: boolean;
  features: readonly (readonly [string, boolean])[];
};

const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export function PricingCards({ plans }: { plans: readonly Plan[] }) {
  return (
    <motion.div
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, amount: 0.2 }}
      transition={{ staggerChildren: 0.15 }}
      className="tw:mt-14 tw:grid tw:items-start tw:gap-5 tw:lg:grid-cols-3"
    >
      {plans.map((p) => (
        <motion.div
          key={p.name}
          variants={rise}
          whileHover={{ y: -4 }}
          className={`tw:relative tw:rounded-2xl tw:border tw:bg-sheet tw:p-6 ${
            p.featured ? 'tw:border-series tw:shadow-2xl tw:shadow-series/20 tw:lg:-mt-3' : `tw:border-rule ${SHADOW}`
          }`}
        >
          {p.featured && (
            <span className="tw:absolute tw:-top-3 tw:left-6 tw:rounded-full tw:bg-series tw:px-3 tw:py-1 tw:text-xs tw:font-semibold tw:text-white">
              Most popular
            </span>
          )}
          <h2 className="tw:text-lg tw:font-semibold tw:text-ink">{p.name}</h2>
          <p className="tw:mt-3 tw:flex tw:items-baseline tw:gap-2">
            <span className="tw:font-serif tw:text-4xl tw:font-semibold tw:tracking-tight tw:text-ink tw:tabular-nums">
              <CountUp to={p.price} format={rupees} />
            </span>
            <span className="tw:text-sm tw:text-ink-soft">{p.cadence}</span>
          </p>
          <p className="tw:mt-2 tw:min-h-12 tw:text-sm tw:text-ink-soft">{p.pitch}</p>
          <Link href="/login" className={`tw:mt-2 tw:w-full ${p.featured ? 'btn btn-primary' : 'btn'}`}>
            {p.cta}
          </Link>
          <ul className="tw:mt-6 tw:space-y-2.5 tw:text-sm">
            {p.features.map(([label, on]) => (
              <li key={label} className={`tw:flex tw:items-start tw:gap-2.5 ${on ? 'tw:text-ink' : 'tw:text-ink-faint'}`}>
                {on ? <Check className="tw:mt-0.5 tw:size-4 tw:shrink-0 tw:text-check" aria-hidden /> : <Minus className="tw:mt-0.5 tw:size-4 tw:shrink-0" aria-hidden />}
                <span>
                  {label}
                  {!on && <span className="sr-only"> (not included)</span>}
                </span>
              </li>
            ))}
          </ul>
        </motion.div>
      ))}
    </motion.div>
  );
}

// -------------------------------------------------------------------------------------- faq

/**
 * Accordion, one open at a time. Answers stay in the DOM when closed (height 0, inert), so the
 * page's HTML carries them as the old <details> did.
 */
export function Faq({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const id = useId();
  return (
    <ul className="tw:mt-10 tw:space-y-3">
      {items.map((it, i) => {
        const isOpen = open === i;
        return (
          <li key={it.q} className="tw:rounded-2xl tw:border tw:border-rule tw:bg-sheet">
            <h3>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`${id}-${i}`}
                onClick={() => setOpen(isOpen ? null : i)}
                className="tw:flex tw:w-full tw:items-center tw:justify-between tw:gap-6 tw:rounded-2xl tw:px-5 tw:py-4 tw:text-left tw:font-medium tw:text-ink tw:transition-colors tw:hover:text-accent"
              >
                {it.q}
                <motion.span animate={{ rotate: isOpen ? 45 : 0 }} className="tw:shrink-0 tw:text-ink-soft">
                  <Plus className="tw:size-5" aria-hidden />
                </motion.span>
              </button>
            </h3>
            <motion.div
              id={`${id}-${i}`}
              data-faq-panel
              inert={!isOpen}
              initial={false}
              animate={{ height: isOpen ? 'auto' : 0, opacity: isOpen ? 1 : 0 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="tw:overflow-hidden"
            >
              <p className="tw:max-w-3xl tw:px-5 tw:pb-5 tw:leading-7 tw:text-ink-soft">{it.a}</p>
            </motion.div>
          </li>
        );
      })}
    </ul>
  );
}
