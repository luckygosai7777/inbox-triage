'use client';

// The public pages' interactive parts. The copy lives in the pages; the example rows and people are
// the site's own illustrations, and each picture that shows them says so.
import { Ban, CalendarDays, Check, Clock, Database, KeyRound, LogOut, Minus, Plus, Send, ShieldQuestion } from 'lucide-react';
import { animate, motion, useInView, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';

import Logo from '@/components/Logo';

import { useArrived } from './IntroGate';
import { Postmark, Slip, StampFor, type PromiseRow } from './stamps';
import { Retype, ScrollType, TypeOnce, type Edit } from './type';

const EASE = [0.22, 1, 0.36, 1] as const;

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

// ------------------------------------------------------------------------------------- hero

const HERO: PromiseRow[] = [
  {
    what: 'Send the revised deck',
    when: '2 days late',
    who: 'You told Maya Okonkwo you would',
    quote: '“I’ll send the revised deck by Friday, once legal have looked at section 4.”',
    late: true,
    day: 'FRI',
  },
  {
    what: 'Accept or decline the Nov 14 keynote',
    when: 'Was due yesterday',
    who: 'Tom Bekele asked and you haven’t replied',
    quote: '“Need an answer by Friday so we can lock the running order.”',
    late: true,
    day: 'FRI',
  },
  {
    what: 'Review the rebrand scope doc',
    when: 'No deadline given',
    who: 'You told Ravi Menon you would',
    quote: '“I’ll review the scope doc and get back to you with comments.”',
    late: false,
  },
];
const LAY = [
  { rotate: -2.2, x: 0 },
  { rotate: 1.6, x: 28 },
  { rotate: -0.8, x: 10 },
];

/** One slip on the hero's desk: dealt in, postmarked, cancelled if late. Drag it about; it springs back. */
function DeskSlip({ p, i, run }: { p: PromiseRow; i: number; run: boolean }) {
  const reduce = useReducedMotion();
  const cancel = useMotionValue(0);
  const [stamped, setStamped] = useState(false);
  useEffect(() => {
    if (!run) return;
    if (reduce) {
      setStamped(true);
      cancel.set(1);
      return;
    }
    const t = setTimeout(() => setStamped(true), 1500 + i * 380);
    const c = p.late ? animate(cancel, 1, { delay: 2.3 + i * 0.38, duration: 0.5, ease: 'easeOut' }) : undefined;
    return () => {
      clearTimeout(t);
      c?.stop();
    };
  }, [run, reduce, i, p.late, cancel]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -60, rotate: LAY[i].rotate }} // no extra spin: a turned slip pokes past a phone's edge
      animate={run ? { opacity: 1, y: 0, rotate: LAY[i].rotate } : {}}
      transition={{ delay: 0.5 + i * 0.25, type: 'spring', stiffness: 170, damping: 19 }}
      drag
      dragSnapToOrigin
      dragElastic={0.4}
      whileDrag={{ scale: 1.04, rotate: 0, zIndex: 10 }}
      style={{ marginLeft: LAY[i].x, zIndex: 3 - i }} // a margin, not x: dragSnapToOrigin returns x to 0
      className="tw:relative tw:-mt-3 tw:max-w-[26rem] tw:cursor-grab tw:touch-none tw:select-none tw:active:cursor-grabbing tw:first:mt-0"
    >
      <Slip
        p={p}
        stamp={
          <motion.div
            initial={false}
            animate={stamped ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 1.7 }}
            transition={{ type: 'spring', stiffness: 520, damping: 22 }}
            className="tw:size-full"
          >
            <StampFor p={p} cancel={cancel} />
          </motion.div>
        }
      />
    </motion.div>
  );
}

const HEADLINE = 'You don’t have an inbox problem.\nYou have a promises problem.';
// It writes the obvious diagnosis, thinks better of it, and corrects itself.
const SCRIPT: Edit[] = [
  { type: 'You don’t have an inbox problem.\nYou have an inbox' },
  { wait: 500 },
  { select: 8 },
  { wait: 600 },
  { type: 'a promises problem.' },
];

export function LandingHero() {
  const arrived = useArrived();
  const [typed, setTyped] = useState(false);
  return (
    <section className="tw:mx-auto tw:grid tw:max-w-6xl tw:items-center tw:gap-14 tw:px-6 tw:pb-28 tw:pt-8 tw:lg:grid-cols-[1.1fr_1fr] tw:lg:pt-14">
      <div>
        <motion.p initial={{ opacity: 0 }} animate={arrived ? { opacity: 1 } : {}} className="tw:text-ink-soft">
          For people who answer a lot of email
        </motion.p>
        <Retype
          text={HEADLINE}
          script={SCRIPT}
          start={arrived}
          cps={30}
          onDone={() => setTyped(true)}
          className="tw:mt-4 tw:whitespace-pre-line tw:font-serif tw:text-[2.6rem] tw:font-semibold tw:leading-[1.06] tw:tracking-tight tw:text-ink tw:sm:text-[3.7rem]"
        />
        <motion.div initial={{ opacity: 0 }} animate={typed ? { opacity: 1 } : {}} transition={{ duration: 0.7 }}>
          <p className="tw:mt-7 tw:max-w-xl tw:text-lg tw:leading-8 tw:text-ink-soft">
            You wrote <span className="tw:font-mono tw:text-[0.95em] tw:text-ink">“I’ll send it Friday”</span> and moved on. That
            sentence is now sitting in your Sent folder, where nobody will ever read it again — including you. Owed reads it, and
            hands you the list.
          </p>
          <div className="tw:mt-8 tw:flex tw:flex-wrap tw:gap-3">
            <Link href="/login" className="btn btn-primary tw:px-6 tw:py-3 tw:text-base">
              Continue with Google
            </Link>
            <Link href="/pricing" className="btn tw:px-6 tw:py-3 tw:text-base">
              See pricing
            </Link>
          </div>
          <p className="tw:mt-4 tw:max-w-md tw:text-sm tw:leading-6 tw:text-ink-faint">
            Free to start. Nothing sends itself. Delete everything in one click.
          </p>
        </motion.div>
      </div>

      <div>
        <motion.p
          initial={{ opacity: 0 }}
          animate={arrived ? { opacity: 1 } : {}}
          transition={{ delay: 0.3 }}
          className="tw:mb-6 tw:flex tw:flex-wrap tw:items-baseline tw:gap-x-3"
        >
          <span className="tw:font-serif tw:text-6xl tw:font-semibold tw:text-ink tw:tabular-nums">
            <CountUp to={7} start={arrived} />
          </span>
          <span className="tw:font-serif tw:text-xl tw:text-ink">things you owe people,</span>
          <span className="tw:font-serif tw:text-xl tw:text-bad">3 of them already late</span>
        </motion.p>
        <div className="tw:pr-8">
          {HERO.map((p, i) => (
            <DeskSlip key={p.what} p={p} i={i} run={arrived} />
          ))}
        </div>
        <p className="tw:mt-6 tw:text-sm tw:text-ink-faint">An example list. The slips can be dragged.</p>
      </div>
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
      <motion.ul aria-hidden initial="hidden" whileInView="shown" viewport={{ once: true, amount: 0.5 }} transition={{ staggerChildren: 0.07 }} className="tw:space-y-3">
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
      <div className="sr-only">
        <table>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <th scope="row">{r.label}</th>
                <td>{format(r.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SentenceMini() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.7 });
  const reduce = useReducedMotion();
  return (
    <div ref={ref} className="tw:space-y-3">
      <TypeOnce as="p" start={inView} cps={34} text="“I’ll circle back with numbers on Monday.”" className="tw:font-mono tw:text-sm tw:text-ink" />
      <div className="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:text-ink-soft">
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
      <p className="tw:text-sm tw:text-ink">Could you send the signed copy when you get a sec?</p>
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

/** Three problems, set as type: each its small evidence above, the claim below. No boxes. */
export function ProblemCards({ cards }: { cards: { title: string; body: string }[] }) {
  return (
    <div className="tw:mx-auto tw:mt-14 tw:grid tw:max-w-6xl tw:gap-x-14 tw:gap-y-14 tw:px-6 tw:md:grid-cols-3">
      {cards.map((p, i) => (
        <article key={p.title}>
          <div className="tw:min-h-24">{MINIS[i]}</div>
          <h3 className="tw:mt-6 tw:font-serif tw:text-2xl tw:font-semibold tw:leading-snug tw:text-ink">{p.title}</h3>
          <p className="tw:mt-3 tw:leading-7 tw:text-ink-soft">{p.body}</p>
        </article>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------------------- comparison

/** What each tool reads. Owed's row carries the postmark: it is the one that reads what you sent. */
export function CompareTable({ rows }: { rows: readonly (readonly [string, string, string])[] }) {
  const cell = 'tw:px-4 tw:py-3.5 tw:align-top';
  return (
    <div className="tw:mx-auto tw:mt-12 tw:max-w-6xl tw:overflow-x-auto tw:px-6">
      <table className="tw:w-full tw:min-w-[34rem] tw:text-left">
        <thead>
          <tr className="tw:text-sm tw:text-ink-faint">
            <th scope="col" className={`${cell} tw:font-medium`}>Tool</th>
            <th scope="col" className={`${cell} tw:font-medium`}>What it does well</th>
            <th scope="col" className={`${cell} tw:font-medium`}>What it misses</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([tool, does, misses]) => (
            <tr key={tool}>
              <th scope="row" className={`${cell} tw:font-semibold tw:text-ink`}>{tool}</th>
              <td className={`${cell} tw:text-ink-soft`}>{does}</td>
              <td className={`${cell} tw:text-ink-faint`}>{misses}</td>
            </tr>
          ))}
          <tr className="tw:relative">
            <th scope="row" className={`${cell} tw:rounded-l-xl tw:bg-sheet tw:py-5 tw:text-ink`}>
              <span className="tw:inline-flex tw:items-center tw:gap-2 tw:font-semibold">
                <Logo size={20} /> Owed
              </span>
            </th>
            <td className={`${cell} tw:bg-sheet tw:py-5 tw:font-medium tw:text-ink`}>Reads your sent mail for promises you made</td>
            <td className={`${cell} tw:rounded-r-xl tw:bg-sheet tw:py-5 tw:pr-28 tw:text-ink-soft`}>
              Still needs you to press Send
              <Postmark day="SENT" ring="READS WHAT YOU" foot="" className="tw:absolute tw:right-2 tw:top-1/2 tw:size-24 tw:-translate-y-1/2 tw:rotate-[10deg] tw:text-accent/70" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------------------------ trust

const TRUST_ICONS = { send: Send, key: KeyRound, database: Database, guess: ShieldQuestion, training: Ban, leave: LogOut };
export type TrustIcon = keyof typeof TRUST_ICONS;

/** Six plain statements in two columns, each with the small navy seal the intro's envelope wore. */
export function TrustGrid({ items }: { items: { icon: TrustIcon; title: string; body: string }[] }) {
  return (
    <ul className="tw:mx-auto tw:mt-14 tw:grid tw:max-w-6xl tw:gap-x-14 tw:gap-y-10 tw:px-6 tw:md:grid-cols-2">
      {items.map(({ icon, title, body }) => {
        const Icon = TRUST_ICONS[icon];
        return (
          <li key={title} className="tw:grid tw:grid-cols-[2.5rem_1fr] tw:gap-x-4">
            <span className="tw:mt-0.5 tw:flex tw:size-10 tw:items-center tw:justify-center tw:rounded-full tw:bg-accent tw:text-white">
              <Icon className="tw:size-[1.1rem]" aria-hidden />
            </span>
            <div>
              <h3 className="tw:font-serif tw:text-xl tw:font-semibold tw:text-ink">{title}</h3>
              <p className="tw:mt-1.5 tw:leading-7 tw:text-ink-soft">{body}</p>
            </div>
          </li>
        );
      })}
    </ul>
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
    <div className="tw:mt-14 tw:grid tw:items-start tw:gap-6 tw:lg:grid-cols-3">
      {plans.map((p) => (
        <div
          key={p.name}
          className={`tw:relative tw:rounded-2xl tw:bg-sheet tw:p-7 ${p.featured ? 'tw:shadow-2xl tw:shadow-[#5b4520]/15 tw:ring-2 tw:ring-accent tw:lg:-mt-4' : 'tw:shadow-md tw:shadow-[#5b4520]/8'}`}
        >
          {p.featured && (
            <span className="tw:absolute tw:-top-3 tw:left-7 tw:rounded-full tw:bg-accent tw:px-3 tw:py-1 tw:text-xs tw:font-semibold tw:text-white">
              Most popular
            </span>
          )}
          <h2 className="tw:font-serif tw:text-xl tw:font-semibold tw:text-ink">{p.name}</h2>
          <p className="tw:mt-3 tw:flex tw:items-baseline tw:gap-2">
            <span className="tw:font-serif tw:text-5xl tw:font-semibold tw:tracking-tight tw:text-ink tw:tabular-nums">
              <CountUp to={p.price} format={rupees} />
            </span>
            <span className="tw:text-sm tw:text-ink-soft">{p.cadence}</span>
          </p>
          <p className="tw:mt-3 tw:min-h-12 tw:text-ink-soft">{p.pitch}</p>
          <Link href="/login" className={`tw:mt-3 tw:w-full ${p.featured ? 'btn btn-primary' : 'btn'}`}>
            {p.cta}
          </Link>
          <ul className="tw:mt-7 tw:space-y-2.5 tw:text-sm">
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
        </div>
      ))}
    </div>
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
    <ul className="tw:mt-10">
      {items.map((it, i) => {
        const isOpen = open === i;
        return (
          <li key={it.q} className={`tw:rounded-xl tw:transition-colors ${isOpen ? 'tw:bg-sheet' : ''}`}>
            <h3>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`${id}-${i}`}
                onClick={() => setOpen(isOpen ? null : i)}
                className="tw:flex tw:w-full tw:items-center tw:justify-between tw:gap-6 tw:rounded-xl tw:px-5 tw:py-4 tw:text-left tw:font-serif tw:text-lg tw:font-semibold tw:text-ink tw:transition-colors tw:hover:text-accent"
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
