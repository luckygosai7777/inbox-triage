'use client';

import { useMotionValueEvent, useReducedMotion, useScroll } from 'motion/react';
import { createElement, useEffect, useRef, useState } from 'react';

type Tag = 'h1' | 'h2' | 'h3' | 'p' | 'span';

/** Zero-width ink caret: sits after the last typed character without shifting the layout. */
export function Caret() {
  return (
    // 1em tall, nudged down by the descender so it spans the letters, not the gap below the line
    <span aria-hidden className="tw:relative tw:inline-block tw:h-[1em] tw:w-0 tw:align-[-0.14em]">
      <span className="tw:absolute tw:-left-px tw:top-0 tw:h-full tw:w-[2px] tw:rounded-full tw:bg-accent tw:motion-safe:animate-caret" />
    </span>
  );
}

/**
 * Typed text whose untyped rest is already laid out (transparent via .typed-rest), so nothing
 * below it jumps. Screen readers get the whole sentence at once. `accent` colours one phrase violet.
 *
 * Every render starts from n = 0 on the server and on the client alike: reading reduced motion
 * during render would make hydration disagree. Reduced motion is applied by the effects, and the
 * CSS shows .typed-rest in full under reduced motion or without JavaScript until they run.
 */
function Typed({
  as,
  text,
  n,
  className,
  caret,
  accent,
}: {
  as: Tag;
  text: string;
  n: number;
  className?: string;
  caret: boolean;
  accent?: string;
}) {
  const at = accent ? text.indexOf(accent) : -1;
  const cuts = at < 0 ? [0, text.length] : [0, at, at + accent!.length, text.length];
  const segments = cuts.slice(1).map((to, s) => {
    const from = cuts[s];
    const k = Math.min(Math.max(n, from), to);
    // The caret lives in the segment being typed, or at the very end once done.
    const here = caret && n >= from && (n < to || to === text.length);
    return (
      // Owed's violet: navy is too close to the ink to read as emphasis.
      <span key={from} className={at >= 0 && s === 1 ? 'tw:text-series' : undefined}>
        {text.slice(from, k)}
        {here && <Caret />}
        <span className="typed-rest">{text.slice(k, to)}</span>
      </span>
    );
  });
  return createElement(
    as,
    { className },
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden>{segments}</span>
    </>,
  );
}

/**
 * The page writes itself as you scroll: characters appear in step with the element's trip from
 * `from` to `to` (viewport positions). Scroll back and it un-types. Reduced motion: full text.
 */
export function ScrollType({
  text,
  as = 'p',
  className,
  from = 'start 88%',
  to = 'start 42%',
}: {
  text: string;
  as?: Tag;
  className?: string;
  from?: string;
  to?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: [from, to] as never });
  const toChars = (p: number) => Math.round(Math.min(1, Math.max(0, p)) * text.length);
  const [n, setN] = useState(0);
  useMotionValueEvent(scrollYProgress, 'change', (p) => {
    if (!reduce) setN(toChars(p));
  });
  useEffect(() => {
    // Already in view on load, or reduced motion: no scroll event will come to set it.
    setN(reduce ? text.length : toChars(scrollYProgress.get()));
  }, [reduce]); // scrollYProgress is a stable motion value; text is fixed per element

  return (
    <span ref={ref} className="tw:block">
      <Typed as={as} text={text} n={n} className={className} caret={n > 0 && n < text.length} />
    </span>
  );
}

/** Types once, at `cps` characters per second, after `start` turns true. Calls onDone at the end. */
export function TypeOnce({
  text,
  as = 'p',
  className,
  start,
  cps = 38,
  onDone,
  accent,
}: {
  text: string;
  as?: Tag;
  className?: string;
  start: boolean;
  cps?: number;
  onDone?: () => void;
  accent?: string;
}) {
  const reduce = useReducedMotion();
  const [n, setN] = useState(0);
  const done = useRef(false);

  useEffect(() => {
    if (!start) return;
    const finish = () => {
      if (!done.current) {
        done.current = true;
        onDone?.();
      }
    };
    if (reduce) {
      setN(text.length);
      finish();
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const next = Math.min(text.length, Math.floor(((now - t0) / 1000) * cps));
      setN(next);
      if (next < text.length) raf = requestAnimationFrame(tick);
      else finish();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [start]); // once per start; text and speed are fixed for a given element

  return (
    <Typed as={as} text={text} n={n} className={className} caret={start && n < text.length} accent={accent} />
  );
}

/** One edit in a Retype script: type text, select the last n characters, or pause. */
export type Edit = { type: string } | { select: number } | { wait: number };

/** What the script shows `ms` into playing it: the text so far and how much of its end is selected. */
export function retypeAt(script: Edit[], ms: number, cps: number) {
  let text = '';
  let selected = 0;
  let t = ms;
  for (const step of script) {
    if ('wait' in step) {
      if (t < step.wait) return { text, selected, done: false };
      t -= step.wait;
    } else if ('select' in step) {
      selected = step.select;
    } else {
      // Typing over a selection replaces it, as in any editor.
      if (selected) text = text.slice(0, text.length - selected);
      selected = 0;
      const n = Math.floor((t / 1000) * cps);
      if (n < step.type.length) return { text: text + step.type.slice(0, n), selected, done: false };
      text += step.type;
      t -= (step.type.length / cps) * 1000;
    }
  }
  return { text, selected, done: true };
}

/**
 * A headline that writes itself and changes its mind: the script types, selects and retypes,
 * ending on `text`. The finished text is laid out underneath from the start, so nothing jumps;
 * screen readers, reduced motion and no-JavaScript all get the finished text.
 */
export function Retype({
  text,
  script,
  start,
  cps = 30,
  onDone,
  className,
}: {
  text: string;
  script: Edit[];
  start: boolean;
  cps?: number;
  onDone?: () => void;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [frame, setFrame] = useState({ text: '', selected: 0, done: false });
  const done = useRef(false);

  useEffect(() => {
    if (!start) return;
    const finish = () => {
      if (!done.current) {
        done.current = true;
        onDone?.();
      }
    };
    if (reduce) {
      setFrame({ text, selected: 0, done: true });
      finish();
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const f = retypeAt(script, now - t0, cps);
      setFrame(f);
      if (f.done) finish();
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [start]); // once per start; the script is fixed for a given element

  const cut = frame.text.length - frame.selected;
  return (
    <h1 className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden className="tw:grid">
        <span className="retype-final tw:col-start-1 tw:row-start-1">{text}</span>
        <span className="retype-live tw:col-start-1 tw:row-start-1">
          {frame.text.slice(0, cut)}
          {frame.selected > 0 && <span className="tw:rounded-sm tw:bg-accent-soft">{frame.text.slice(cut)}</span>}
          {start && !frame.done && <Caret />}
        </span>
      </span>
    </h1>
  );
}
