/**
 * The Owed mark: a circular arrow closing on a check.
 *
 * Rebuilt as vector rather than shipped as the original PNG, for three
 * reasons that matter at the sizes this renders at: it is drawn at 32px in the
 * nav rail and a raster would be soft there; it costs about 700 bytes against
 * a PNG's tens of kilobytes on every page load; and it can take its colours
 * from the theme instead of carrying its own.
 *
 * ON THE COLOURS
 *
 * The supplied artwork is cool navy with a bright green check. This theme is
 * warm paper with a rust accent, and those two greens-against-rust fight when
 * they sit near each other. The resolution here: the ring uses the page's own
 * ink, so the mark belongs to the paper rather than sitting on it, and the
 * check keeps its green — a tick reads as "done" in green and as something
 * else entirely in rust. Green appears nowhere else in the chrome, so it stays
 * a brand signal rather than becoming a second accent competing with the
 * first.
 */

type Props = {
  /** Rendered size in px. The mark is drawn on a 100×100 grid and scales. */
  size?: number;
  /** Include the "wed" wordmark to the right of the mark. */
  withWordmark?: boolean;
  className?: string;
};

export default function Logo({ size = 32, withWordmark = false, className }: Props) {
  const width = withWordmark ? size * 3.05 : size;

  return (
    <svg
      width={width}
      height={size}
      viewBox={withWordmark ? '0 0 305 100' : '0 0 100 100'}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Owed"
    >
      {/* The disc the check sits on. Barely there — it exists to stop the
          check touching the ring at small sizes. */}
      <circle cx="50" cy="50" r="23" fill="var(--logo-disc, #f1faf4)" />

      {/*
        The ring, open at the upper right. Drawn the long way round —
        large-arc + clockwise sweep — from 30° to 75°, leaving a 45° gap for
        the arrowhead to occupy.
      */}
      <path
        d="M79.4 33 A34 34 0 1 1 58.8 17.2"
        stroke="var(--logo-ink, #1a1714)"
        strokeWidth="12"
        strokeLinecap="round"
      />

      {/* Arrowhead, tangent to the arc where it ends, pointing with the
          direction of travel. */}
      <path
        d="M53.3 26.1 L67.5 19.5 L58.5 6.7"
        stroke="var(--logo-ink, #1a1714)"
        strokeWidth="12"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* The check. */}
      <path
        d="M36 51.5 L45.5 61 L64.5 38.5"
        stroke="var(--logo-check, #22a55f)"
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {withWordmark && (
        <text
          x="112"
          y="72"
          fill="var(--logo-ink, #1a1714)"
          fontFamily="var(--font-display), Georgia, serif"
          fontSize="70"
          fontWeight="600"
          letterSpacing="-2"
        >
          wed
        </text>
      )}
    </svg>
  );
}
