'use client';

// "How it works", told as one continuous scene that scrolling plays: a sent email is read, its
// promise lifts off the page onto a slip, the slip is postmarked with the date from the sentence,
// the days pass, and it lands in a list sorted by how late things are. The page's one big moment
// after the intro; everything else around it stays quiet.
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from 'motion/react';
import { Check, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Cancelled, NoDate, Postmark, Slip, StampFor, type PromiseRow } from './stamps';

const W = 560;
const H = 600;

const MAYA: PromiseRow = {
  what: 'Send the revised deck',
  when: '2 days late',
  who: 'You told Maya Okonkwo you would',
  quote: '“I’ll send the revised deck by Friday, once legal have looked at section 4.”',
  late: true,
  day: 'FRI',
};
const TOM: PromiseRow = {
  what: 'Accept or decline the Nov 14 keynote',
  when: 'Was due yesterday',
  who: 'Tom Bekele asked and you haven’t replied',
  quote: '“Need an answer by Friday so we can lock the running order.”',
  late: true,
  day: 'FRI',
};
const RAVI: PromiseRow = {
  what: 'Review the rebrand scope doc',
  when: 'No deadline given',
  who: 'You told Ravi Menon you would',
  quote: '“I’ll review the scope doc and get back to you with comments.”',
  late: false,
};

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
const pct = (h: number) => `${((h - DAY.start) / (DAY.end - DAY.start)) * 100}%`;

/** The scene at scroll progress p (0..1). Every position is a function of p, so scrolling back rewinds it. */
function Stage({ p }: { p: MotionValue<number> }) {
  const at = (input: number[], output: number[]) => useTransform(p, input, output); // eslint-disable-line react-hooks/rules-of-hooks

  // 1. The sent folder: two older emails fan away, leaving the one with the promise in it.
  const backX = at([0.08, 0.22], [0, -60]);
  const backFade = at([0.08, 0.22], [1, 0]);
  const chips = at([0.03, 0.1, 0.22, 0.28], [0, 1, 1, 0]);
  // 2. Owed reads it: the sentence is highlighted, then lifts off onto a slip.
  const highlight = useTransform(p, [0.28, 0.4], ['0% 100%', '100% 100%']);
  const left = at([0.42, 0.48], [1, 0.25]);
  const flyX = at([0.4, 0.52], [0, 86]);
  const flyY = at([0.4, 0.52], [0, 246]);
  const flyScale = at([0.4, 0.52], [1, 0.82]);
  const flyFade = at([0.39, 0.41, 0.5, 0.53], [0, 1, 1, 0]);
  const slipA = at([0.44, 0.52], [0, 1]);
  const stampScale = at([0.52, 0.56, 0.58], [1.7, 0.94, 1]);
  const stampFade = at([0.52, 0.55], [0, 1]);
  // 3. Time passes; the list forms.
  const emailUp = at([0.6, 0.67], [0, -70]);
  const emailFade = at([0.6, 0.66], [1, 0]);
  const slipAY = at([0.6, 0.68], [0, -300]);
  const calFade = at([0.64, 0.67, 0.92, 0.96], [0, 1, 1, 0]);
  const dayN = at([0.67, 0.76], [13, 16.99]);
  const dayText = useTransform(dayN, (d) => String(Math.floor(d)));
  const weekday = useTransform(dayN, (d) => ['Thursday', 'Friday', 'Saturday', 'Sunday'][Math.min(3, Math.floor(d) - 13)]);
  const cancelA = at([0.76, 0.8], [0, 1]);
  const arrive = at([0.8, 0.85], [0, 1]);
  const arriveX = at([0.8, 0.85], [120, 0]);
  const cancelB = at([0.84, 0.88], [0, 1]);
  const tomY = at([0.87, 0.92], [0, -150]);
  const raviY = at([0.87, 0.92], [0, 150]);
  const day = at([0.9, 0.94], [0, 1]);
  const drop = [0, 1, 2].map((i) => at([0.93 + i * 0.02, 0.96 + i * 0.02], [0, 1]));
  const dropY = drop.map((d) => useTransform(d, [0, 1], [-26, 0])); // eslint-disable-line react-hooks/rules-of-hooks

  return (
    <div className="tw:relative" style={{ width: W, height: H }}>
      {/* The sent folder */}
      <motion.div style={{ opacity: emailFade, y: emailUp }} className="tw:absolute tw:inset-0">
        {['Re: revised scope for the rebrand', 'Re: Nov 14 keynote'].map((s, i) => (
          <motion.div
            key={s}
            style={{ x: backX, opacity: backFade, rotate: i ? -4 : -2, top: 30 + (2 - i) * 14, left: 30 + (2 - i) * 14 }}
            className="tw:absolute tw:h-[260px] tw:w-[420px] tw:rounded-md tw:bg-[#f7f1e6] tw:p-5 tw:shadow-md tw:shadow-[#5b4520]/10"
          >
            <p className="tw:text-xs tw:text-ink-faint">Sent</p>
            <p className="tw:font-serif tw:font-semibold tw:text-ink-soft">{s}</p>
          </motion.div>
        ))}
        <div className="tw:absolute tw:left-[30px] tw:top-[30px] tw:h-[260px] tw:w-[420px] tw:-rotate-1 tw:rounded-md tw:bg-sheet tw:px-6 tw:py-[18px] tw:shadow-lg tw:shadow-[#5b4520]/12">
          <p className="tw:flex tw:justify-between tw:text-xs tw:text-ink-faint">
            <span>Sent 3 weeks ago</span>
            <span>
              To <span className="tw:font-medium tw:text-ink">Maya Okonkwo</span>
            </span>
          </p>
          <p className="tw:mt-2 tw:font-serif tw:text-lg tw:font-semibold tw:text-ink">Re: Q3 deck</p>
          <div className="tw:mt-3 tw:space-y-2.5 tw:font-mono tw:text-[13px] tw:leading-[22px] tw:text-ink-soft">
            <p>Hi Maya, thanks for the notes.</p>
            <motion.p style={{ opacity: left }}>
              <motion.mark
                style={{ backgroundSize: highlight }}
                className="tw:bg-linear-to-r tw:from-accent-soft tw:to-accent-soft tw:bg-no-repeat tw:text-ink"
              >
                I’ll send the revised deck by Friday, once legal have looked at section 4.
              </motion.mark>
            </motion.p>
            <p>Speak soon.</p>
          </div>
        </div>
      </motion.div>

      {/* What Owed may and may not do */}
      <motion.ul style={{ opacity: chips }} className="tw:absolute tw:left-[250px] tw:top-[318px] tw:w-[290px] tw:space-y-2 tw:text-sm">
        {(
          [
            ['Reads your mail', true],
            ['Reads your calendar', true],
            ['Sends anything by itself', false],
          ] as const
        ).map(([label, ok]) => (
          <li key={label} className="tw:flex tw:items-center tw:gap-2.5 tw:rounded-full tw:bg-sheet tw:px-4 tw:py-2 tw:shadow-sm tw:shadow-[#5b4520]/10">
            {ok ? <Check className="tw:size-4 tw:text-ok" aria-hidden /> : <X className="tw:size-4 tw:text-bad" aria-hidden />}
            <span className={ok ? 'tw:text-ink' : 'tw:text-ink-soft'}>{label}</span>
            <span className={`tw:ml-auto tw:text-xs tw:font-semibold ${ok ? 'tw:text-ok' : 'tw:text-bad'}`}>{ok ? 'Allowed' : 'Never'}</span>
          </li>
        ))}
      </motion.ul>

      {/* The sentence, lifting off the page */}
      <motion.p
        style={{ x: flyX, y: flyY, scale: flyScale, opacity: flyFade, transformOrigin: '0 0' }}
        className="tw:absolute tw:left-[54px] tw:top-[147px] tw:w-[372px] tw:rounded-sm tw:bg-accent-soft tw:font-mono tw:text-[13px] tw:leading-[22px] tw:text-ink tw:shadow-xl tw:shadow-[#5b4520]/20"
      >
        I’ll send the revised deck by Friday, once legal have looked at section 4.
      </motion.p>

      {/* The list */}
      <motion.div style={{ y: slipAY, opacity: slipA }} className="tw:absolute tw:left-[120px] tw:top-[330px] tw:w-[410px] tw:-rotate-1">
        <Slip
          p={MAYA}
          stamp={
            <motion.div style={{ scale: stampScale, opacity: stampFade }} className="tw:relative tw:size-full">
              <Postmark day="FRI" date="14 NOV" className="tw:size-full tw:rotate-[8deg] tw:text-accent/80" />
              <Cancelled drawn={cancelA} className="tw:absolute tw:inset-x-0 tw:top-1/2 tw:w-full tw:-translate-y-1/2 tw:-rotate-6" />
            </motion.div>
          }
        />
      </motion.div>
      <motion.div style={{ opacity: arrive, x: arriveX, y: tomY }} className="tw:absolute tw:left-[120px] tw:top-[330px] tw:w-[410px] tw:rotate-1">
        <Slip p={TOM} stamp={<StampFor p={TOM} cancel={cancelB} />} />
      </motion.div>
      <motion.div style={{ opacity: arrive, x: arriveX, y: raviY }} className="tw:absolute tw:left-[120px] tw:top-[180px] tw:w-[410px] tw:-rotate-[0.5deg]">
        <Slip p={RAVI} stamp={<NoDate className="tw:size-full tw:-rotate-6 tw:text-ink-faint" />} />
      </motion.div>

      {/* A tear-off calendar, counting the days past Friday */}
      <motion.div
        style={{ opacity: calFade }}
        className="tw:absolute tw:left-[8px] tw:top-[200px] tw:w-[96px] tw:overflow-hidden tw:rounded-md tw:bg-sheet tw:text-center tw:shadow-md tw:shadow-[#5b4520]/15"
      >
        <p className="tw:bg-bad tw:py-1 tw:text-[0.65rem] tw:font-bold tw:tracking-widest tw:text-white">NOV</p>
        <motion.p className="tw:font-serif tw:text-4xl tw:font-semibold tw:leading-[1.3] tw:text-ink">{dayText}</motion.p>
        <motion.p className="tw:pb-2 tw:text-[0.7rem] tw:text-ink-soft">{weekday}</motion.p>
      </motion.div>

      {/* Today: replies packed into the gaps between meetings */}
      <motion.div style={{ opacity: day }} className="tw:absolute tw:left-[20px] tw:top-[500px] tw:w-[520px]">
        <p className="tw:text-sm tw:font-semibold tw:text-ink">
          Today’s replies, in the gaps <span className="tw:font-normal tw:text-ink-faint">from your calendar</span>
        </p>
        <div className="tw:relative tw:mt-2 tw:h-12 tw:rounded-lg tw:bg-sheet">
          {MEETINGS.map((m) => (
            <div
              key={m.label}
              className="tw:absolute tw:inset-y-1 tw:overflow-hidden tw:rounded-md tw:bg-accent/85 tw:px-1.5 tw:py-1 tw:text-[0.65rem] tw:font-medium tw:text-white"
              style={{ left: pct(m.from), width: `calc(${pct(m.to)} - ${pct(m.from)} - 2px)` }}
            >
              {m.label}
            </div>
          ))}
          {REPLIES.map((r, i) => (
            <motion.div
              key={r.label}
              style={{ opacity: drop[i], y: dropY[i], left: pct(r.from), width: `calc(${pct(r.to)} - ${pct(r.from)} - 2px)` }}
              className="tw:absolute tw:inset-y-1 tw:overflow-hidden tw:rounded-md tw:bg-series tw:px-1.5 tw:py-1 tw:text-[0.65rem] tw:font-medium tw:text-white"
            >
              {r.label}
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

/** Scales the fixed-size stage down to whatever room it has. */
function Fit({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      setScale(Math.min(1.15, e.contentRect.width / W, e.contentRect.height / H));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    // Clipped: slips wait off to the right before they slide in, and must not widen the page.
    <div ref={ref} className="tw:relative tw:size-full tw:overflow-clip">
      <div className="tw:absolute tw:left-1/2 tw:top-1/2" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}

/**
 * How far the page has scrolled through a pinned section: 0 when it reaches the top, 1 when its
 * end does. Measured from the section's own position on every frame; motion's useScroll cached
 * the offsets before the content above it had settled, and the scene drifted out of step.
 */
function usePinProgress(ref: React.RefObject<HTMLElement | null>) {
  const progress = useMotionValue(0);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const range = r.height - window.innerHeight;
      progress.set(range > 0 ? Math.min(1, Math.max(0, -r.top / range)) : 0);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      cancelAnimationFrame(raf);
    };
  }, [ref, progress]);
  return progress;
}

function StillStage({ at }: { at: number }) {
  const p = useMotionValue(at);
  return <Stage p={p} />;
}

type Step = { title: string; body: string };
const ACTIVE = [
  [0, 0.27],
  [0.27, 0.6],
  [0.6, 1],
];

/** One caption per step; the one being played is lit, the others wait. On phones only it shows. */
function Caption({ step, n, p }: { step: Step; n: number; p: MotionValue<number> }) {
  const [a, b] = ACTIVE[n];
  const on = useTransform(p, [a - 0.03, a, b - 0.03, b], n === 0 ? [1, 1, 1, 0] : n === 2 ? [0, 1, 1, 1] : [0, 1, 1, 0]);
  return (
    <motion.li
      style={{ '--on': on } as never}
      className="tw:col-start-1 tw:row-start-1 tw:opacity-(--on) tw:lg:mt-10 tw:lg:opacity-[calc(0.28+0.72*var(--on))] tw:lg:first:mt-0"
    >
      <p className="tw:font-serif tw:text-sm tw:font-semibold tw:text-accent">Step {n + 1}</p>
      <h3 className="tw:mt-1 tw:font-serif tw:text-[1.7rem] tw:font-semibold tw:leading-tight tw:text-ink tw:lg:text-[2rem]">{step.title}</h3>
      <p className="tw:mt-2 tw:max-w-md tw:leading-7 tw:text-ink-soft">{step.body}</p>
    </motion.li>
  );
}

export function HowItWorks({ steps }: { steps: Step[] }) {
  const ref = useRef<HTMLElement>(null);
  const scrollYProgress = usePinProgress(ref);
  const reduce = useReducedMotion();
  // Decided after hydration: the server cannot know the setting, and both must render the same first.
  const [still, setStill] = useState(false);
  useEffect(() => setStill(Boolean(reduce)), [reduce]);

  const summary = (
    <p className="sr-only">
      Example: a sent email to Maya Okonkwo says “I’ll send the revised deck by Friday”. Owed lifts that sentence into a row
      due Friday; by Sunday it is two days late and sits at the top of the list, above a keynote reply that was due yesterday
      and a review with no deadline given. Today’s replies are placed in the gaps between your meetings.
    </p>
  );

  if (still) {
    return (
      <section id="how" className="tw:mx-auto tw:max-w-6xl tw:scroll-mt-24 tw:px-6 tw:py-20">
        <h2 className="tw:font-serif tw:text-[2.1rem] tw:font-semibold tw:text-ink tw:sm:text-5xl">How it works</h2>
        <ol className="tw:mt-10 tw:grid tw:gap-10 tw:lg:grid-cols-3">
          {steps.map((s, n) => (
            <li key={s.title}>
              <p className="tw:font-serif tw:text-sm tw:font-semibold tw:text-accent">Step {n + 1}</p>
              <h3 className="tw:mt-1 tw:font-serif tw:text-2xl tw:font-semibold tw:text-ink">{s.title}</h3>
              <p className="tw:mt-2 tw:leading-7 tw:text-ink-soft">{s.body}</p>
            </li>
          ))}
        </ol>
        {summary}
        <div aria-hidden className="tw:mt-12 tw:grid tw:gap-6 tw:lg:grid-cols-2">
          <div className="tw:h-[420px]">
            <Fit>
              <StillStage at={0.585} />
            </Fit>
          </div>
          <div className="tw:h-[420px]">
            <Fit>
              <StillStage at={1} />
            </Fit>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section ref={ref} id="how" className="tw:relative tw:h-[460vh] tw:scroll-mt-0">
      <div className="tw:sticky tw:top-0 tw:mx-auto tw:flex tw:h-svh tw:max-w-6xl tw:flex-col tw:gap-4 tw:px-6 tw:pb-4 tw:pt-24 tw:lg:flex-row tw:lg:items-center tw:lg:gap-12 tw:lg:pt-20">
        <div className="tw:lg:w-[38%] tw:lg:shrink-0">
          <h2 className="tw:font-serif tw:text-[2.1rem] tw:font-semibold tw:leading-tight tw:text-ink tw:sm:text-5xl">How it works</h2>
          <ol className="tw:mt-5 tw:grid tw:lg:mt-10 tw:lg:block">
            {steps.map((s, n) => (
              <Caption key={s.title} step={s} n={n} p={scrollYProgress} />
            ))}
          </ol>
          {summary}
        </div>
        <div aria-hidden className="tw:min-h-0 tw:flex-1 tw:lg:h-[min(640px,100%)]">
          <Fit>
            <Stage p={scrollYProgress} />
          </Fit>
        </div>
      </div>
    </section>
  );
}
