'use client';

import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useLayoutEffect, useState } from 'react';

import { markIntroPlayed, shouldPlayIntro } from './intro/played';

const loadIntro = () => import('./intro/MailIntro');
const MailIntro = lazy(loadIntro);

const Arrived = createContext(true);

/** True once the intro is over, or was never due: the hero starts typing then. */
export const useArrived = () => useContext(Arrived);

/**
 * Plays the three.js mail intro once per browser session, then lets the page begin.
 *
 * <html data-intro> carries the state: 'play' (Paper's inline script raised the cover before
 * first paint), 'running' (React owns the overlay), 'done'. Arriving by client navigation there
 * was no script, so the same decision is made here, before paint, in a layout effect.
 */
export default function IntroGate({ children }: { children: React.ReactNode }) {
  const [playing, setPlaying] = useState(false);
  const [arrived, setArrived] = useState(false);

  const finish = useCallback(() => {
    markIntroPlayed();
    document.documentElement.dataset.intro = 'done';
    setPlaying(false);
    setArrived(true);
  }, []);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const state = root.dataset.intro;
    // 'running' too: dev Strict Mode runs this twice.
    if (state === 'play' || state === 'running' || (state === undefined && shouldPlayIntro())) {
      root.dataset.intro = 'running';
      setPlaying(true);
    } else {
      setArrived(true);
    }
  }, []);

  // A slow connection shouldn't hold the page hostage: if the 3D chunk isn't here in time, skip.
  useEffect(() => {
    if (!playing) return;
    let loaded = false;
    loadIntro().then(() => {
      loaded = true;
    }, finish);
    const timer = setTimeout(() => {
      if (!loaded) finish();
    }, 1200);
    // Works before the 3D chunk arrives; the inline script covered the time before hydration.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [playing, finish]);

  return (
    <Arrived.Provider value={arrived}>
      {children}
      {/* Raised by CSS while <html data-intro="play">, i.e. before React has taken over. */}
      <div aria-hidden className="intro-cover" />
      {playing && (
        <Suspense fallback={<div aria-hidden className="intro-cover is-on" />}>
          <MailIntro onDone={finish} />
        </Suspense>
      )}
    </Arrived.Provider>
  );
}
