import { CanvasTexture, SRGBColorSpace } from 'three';

// Drawn at runtime on a canvas: no image files to download, nothing for the CSP to block.
const INK = '#1b1828';
const ACCENT = '#2b2645';
const ACCENT_SOFT = '#e9dfcc';
const PAPER = '#f3ece0'; // the page's ground: the letter must match it exactly at the handoff
const IVORY = '#fbf8f2';
const CHECK = '#1e9e6a';

/** Font stacks as next/font named them; canvas text can only use a face that has loaded. */
export type Faces = { brand: string; sans: string };

function draw(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d')!);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** The Owed mark (same paths as components/Logo.tsx, on its 100×100 grid), centred at x,y. */
function mark(g: CanvasRenderingContext2D, x: number, y: number, size: number, ink: string, check: string) {
  g.save();
  g.translate(x - size / 2, y - size / 2);
  g.scale(size / 100, size / 100);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.fillStyle = check;
  g.globalAlpha = 0.14;
  g.beginPath();
  g.arc(50, 50, 23, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;
  g.strokeStyle = ink;
  g.lineWidth = 12;
  g.stroke(new Path2D('M79.4 33 A34 34 0 1 1 58.8 17.2'));
  g.stroke(new Path2D('M53.3 26.1 L67.5 19.5 L58.5 6.7'));
  g.strokeStyle = check;
  g.lineWidth = 10;
  g.stroke(new Path2D('M36 51.5 L45.5 61 L64.5 38.5'));
  g.restore();
}

/**
 * The letter: a picture of the page's first screen, blank but for the letterhead, on the page's
 * own beige. It has the viewport's proportions and draws the logo where the header's real one
 * sits (`logo`, measured in CSS px), so when the camera has dived in and the page shows through,
 * the two coincide at any screen size.
 */
export const letterTexture = (faces: Faces, view: { width: number; height: number; logo: DOMRect | null }) => {
  const k = Math.min(1.5, 2048 / Math.max(view.width, view.height)); // texture px per CSS px
  return draw(Math.round(view.width * k), Math.round(view.height * k), (g) => {
    g.scale(k, k);
    g.fillStyle = PAPER;
    g.fillRect(0, 0, view.width, view.height);
    if (!view.logo) return;
    // <Logo withWordmark> draws on a 305×100 grid: the mark in the first 100, "wed" from x=112.
    const { left, top, height } = view.logo;
    const s = height / 100;
    mark(g, left + 50 * s, top + 50 * s, height, INK, CHECK);
    g.fillStyle = INK;
    g.font = `600 ${70 * s}px ${faces.brand}`;
    g.letterSpacing = `${-2 * s}px`;
    g.textBaseline = 'alphabetic';
    g.textAlign = 'left';
    g.fillText('wed', left + 112 * s, top + 72 * s);
  });
};

/**
 * Emails that flutter out of the envelope: a subject, header and body as soft bars, no ruled
 * lines. The first carries a highlighted sentence, the promise Owed finds.
 */
export const sheetTexture = (title: string, variant: number, faces: Faces) =>
  draw(380, 500, (g) => {
    g.fillStyle = IVORY;
    g.fillRect(0, 0, 380, 500);
    g.fillStyle = ACCENT;
    g.fillRect(0, 0, 380, 14);
    g.fillStyle = INK;
    g.font = `600 28px ${faces.sans}`;
    g.fillText(title, 28, 62);
    g.fillStyle = 'rgba(27, 24, 40, 0.28)';
    g.fillRect(28, 84, 150, 9); // from / to
    g.fillRect(28, 104, 110, 9);
    for (let i = 0; i < 9; i++) {
      const y = 150 + i * 34;
      const w = 160 + ((i * 71 + variant * 37) % 150);
      if (variant === 0 && (i === 2 || i === 3)) {
        g.fillStyle = ACCENT_SOFT;
        g.fillRect(22, y - 9, 336, 26);
        g.fillStyle = 'rgba(27, 24, 40, 0.5)';
      } else g.fillStyle = 'rgba(27, 24, 40, 0.2)';
      g.fillRect(28, y, w, 9);
    }
  });

/** A navy wax seal pressed with the Owed mark. */
export const sealTexture = () =>
  draw(256, 256, (g) => {
    const [x, y, r] = [128, 128, 120];
    g.fillStyle = ACCENT;
    g.beginPath();
    for (let i = 0; i <= 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      const rr = i % 2 ? r * 0.92 : r; // scalloped wax edge
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.fill();
    mark(g, x, y, r * 1.35, '#f7f3ea', '#34d399');
  });
