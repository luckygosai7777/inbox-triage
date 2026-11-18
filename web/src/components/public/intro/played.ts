// When the mail intro plays: once per browser session, never under reduced motion or without WebGL.
// Paper's inline script makes the same decision before first paint on a full page load; this is
// the copy for client navigations, where that script does not run. Keep the two in step.

export const INTRO_KEY = 'owed:intro-played';

// Storage can be blocked (private mode, strict settings). Then the intro may replay, which is harmless.
export function markIntroPlayed() {
  try {
    sessionStorage.setItem(INTRO_KEY, '1');
  } catch {
    /* see above */
  }
}

export function shouldPlayIntro() {
  try {
    if (sessionStorage.getItem(INTRO_KEY) === '1') return false;
  } catch {
    /* blocked storage: fall through */
  }
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'));
  } catch {
    return false;
  }
}
