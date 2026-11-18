// Tiny timeline kit for the mail intro: every animated value is a pure function of time t (seconds).

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** 0 before `start`, 1 after `end`, linear in between. */
export const segment = (t: number, start: number, end: number) => clamp01((t - start) / (end - start));

export const easeOutCubic = (x: number) => 1 - (1 - x) ** 3;
export const easeInCubic = (x: number) => x ** 3;
export const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);
/** Overshoots past 1 and settles back: the flap's little bounce. */
export const easeOutBack = (x: number, s = 1.5) => 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2;

/**
 * Camera distance at which a w×h plane, facing the camera, exactly covers the viewport (no edges show).
 * Visible height at distance d is 2·d·tan(fov/2), visible width is that times the aspect ratio.
 */
export function coverDistance(fovDeg: number, aspect: number, w: number, h: number) {
  const t = Math.tan((fovDeg * Math.PI) / 360);
  return Math.min(h / (2 * t), w / (2 * t * aspect));
}

/** Distance at which a w×h box fits inside the viewport with nothing cut off. */
export function fitDistance(fovDeg: number, aspect: number, w: number, h: number) {
  const t = Math.tan((fovDeg * Math.PI) / 360);
  return Math.max(h / (2 * t), w / (2 * t * aspect));
}

/** The largest w×h with the screen's aspect ratio that fits inside `box`: the letter that becomes the page. */
export function letterSize(aspect: number, box: { w: number; h: number }) {
  return aspect > box.w / box.h ? { w: box.w, h: box.w / aspect } : { w: box.h * aspect, h: box.h };
}
