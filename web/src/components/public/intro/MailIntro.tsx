'use client';

// Kept out of the page bundle: IntroGate loads this chunk (with three.js) only when the intro plays.
// drei's <Text> is deliberately not used: it spawns blob workers the CSP would block, so every
// word in the intro is DOM or canvas-drawn.
import { ContactShadows, RoundedBox } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { DoubleSide, ExtrudeGeometry, Group, Mesh, PerspectiveCamera, Shape } from 'three';

import { letterTexture, sealTexture, sheetTexture, type Faces } from './textures';
import {
  coverDistance,
  easeInCubic,
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  fitDistance,
  lerp,
  letterSize,
  segment,
} from './timeline';

// Envelope geometry (world units). The letter has the screen's proportions, fitted inside this box
// so it always fits in the envelope: that is what lets its last frame be the page exactly.
const W = 3.2;
const H = 2.0;
const LETTER_BOX = { w: 2.9, h: 1.8 };
const FOCUS = { y: 0.5, z: 0.9 }; // where the letter waits for the camera
const FOV = 35;
const END = 4.1; // seconds

const FLAP_CLOSED = 0;
const FLAP_OPEN = -(Math.PI + 0.18); // swings up through the front and leans back, behind the letter

// Pocket: the front of the envelope, with side flaps reaching the top corners and a V in the middle.
function pocketGeometry() {
  const s = new Shape();
  s.moveTo(-W / 2, -H / 2);
  s.lineTo(W / 2, -H / 2);
  s.lineTo(W / 2, H / 2);
  s.lineTo(0, 0.05);
  s.lineTo(-W / 2, H / 2);
  s.closePath();
  return new ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.012, bevelSegments: 3 });
}

// Flap hangs down from the hinge at the top edge; its tip reaches below the pocket's V so nothing peeks.
function flapGeometry() {
  const s = new Shape();
  s.moveTo(-W / 2, 0);
  s.lineTo(W / 2, 0);
  s.lineTo(0.16, -1.24);
  s.quadraticCurveTo(0, -1.33, -0.16, -1.24);
  s.closePath();
  return new ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.012, bevelSegments: 3 });
}

// The site's own example threads.
const SHEETS = [
  { title: 'Re: Q3 deck', dir: -1, x: -0.5, lift: 3.0, spin: 1.1, delay: 0 },
  { title: 'Nov 14 keynote', dir: 1, x: 0.45, lift: 3.4, spin: -0.9, delay: 0.14 },
  { title: 'Rebrand scope', dir: 0.35, x: 0.05, lift: 3.9, spin: 0.7, delay: 0.28 },
];

const paper = { color: '#f6efe3', roughness: 0.82, sheen: 1, sheenRoughness: 0.75, sheenColor: '#e6d5b8', clearcoat: 0.05 };

function Scene({
  onDone,
  overlay,
  tagline,
  faces,
}: {
  onDone: () => void;
  overlay: RefObject<HTMLDivElement | null>;
  tagline: RefObject<HTMLDivElement | null>;
  faces: Faces;
}) {
  const camera = useThree((s) => s.camera as PerspectiveCamera);
  // The canvas's own CSS size, which is what the letter must become: the overlay can be narrower
  // than the window by a scrollbar gutter, and clientWidth does not always say so.
  const { width, height } = useThree((s) => s.size);
  const aspect = width / height;
  const envelope = useRef<Group>(null!);
  const flap = useRef<Group>(null!);
  const seal = useRef<Mesh>(null!);
  const letter = useRef<Mesh>(null!);
  const sheets = useRef<Mesh[]>([]);
  const clock = useRef(0);
  const finished = useRef(false);

  // The overlay sits at the viewport's top left, so the logo's viewport rect is its canvas rect.
  const view = useMemo(
    () => ({ width, height, logo: document.querySelector('[data-intro-logo]')?.getBoundingClientRect() ?? null }),
    [width, height],
  );
  const LETTER = letterSize(aspect, LETTER_BOX);
  const textures = useMemo(
    () => ({
      letter: letterTexture(faces, view),
      seal: sealTexture(),
      sheets: SHEETS.map((s, i) => sheetTexture(s.title, i, faces)),
    }),
    [faces, view],
  );
  const geometry = useMemo(() => ({ pocket: pocketGeometry(), flap: flapGeometry() }), []);
  useEffect(() => {
    return () => {
      [textures.letter, textures.seal, ...textures.sheets, geometry.pocket, geometry.flap].forEach((x) => x.dispose());
    };
  }, [textures, geometry]);

  // Start far enough back to frame the envelope and the letter's rise; end where the letter is the
  // screen, edge to edge (same proportions, so covering it is also fitting it).
  const startZ = fitDistance(FOV, aspect, W * 1.35, H * 2.4);
  const endZ = FOCUS.z + coverDistance(FOV, aspect, LETTER.w, LETTER.h);

  useFrame((_, delta) => {
    // Capped step: time spent in a background tab doesn't count, so the intro pauses instead of skipping.
    const t = (clock.current += Math.min(delta, 1 / 30));

    // 1. Envelope floats in and bobs gently.
    const arrive = easeOutCubic(segment(t, 0, 0.8));
    const bob = 1 - segment(t, 1.5, 2.1);
    const drop = easeInCubic(segment(t, 2.5, 3.3));
    envelope.current.position.y = lerp(-1.1, 0, arrive) + 0.06 * Math.sin(t * 1.4) * bob - drop * 5;
    envelope.current.rotation.x = lerp(0.5, 0, arrive);
    envelope.current.rotation.z = lerp(-0.12, 0, arrive);

    // 2. The wax seal pops, then the flap swings open with a small bounce.
    const pop = segment(t, 0.7, 0.92);
    seal.current.scale.setScalar(pop < 0.35 ? lerp(1, 1.3, pop / 0.35) : lerp(1.3, 0, (pop - 0.35) / 0.65));
    seal.current.rotation.z = pop * 2.4;
    const open = segment(t, 0.85, 1.6);
    flap.current.rotation.x = lerp(FLAP_CLOSED, FLAP_OPEN, easeOutBack(open, 1.2));
    flap.current.position.z = lerp(0.05, -0.035, open); // in front of the pocket when shut, behind the letter when open

    // 3. Emails flutter out.
    sheets.current.forEach((m, i) => {
      const s = SHEETS[i];
      const k = segment(t, 1.35 + s.delay, 2.4 + s.delay);
      m.visible = k > 0 && k < 1;
      m.position.set(s.x + s.dir * 3.4 * easeOutCubic(k), 0.05 + s.lift * k - 1.4 * k * k, -0.008 + 2.4 * easeInCubic(k));
      m.rotation.set(0.5 * k * s.spin, s.dir * 1.1 * k, s.dir * 0.35 + s.spin * 1.6 * k);
    });

    // 4. The letter rises, comes forward to meet the camera while the envelope falls away.
    const rise = easeInOutCubic(segment(t, 1.75, 2.55));
    const forward = easeInOutCubic(segment(t, 2.45, 3.25));
    const envY = envelope.current.position.y;
    const riseY = envY + lerp(-0.1, 1.95, rise); // world y while still riding with the envelope
    letter.current.position.y = lerp(riseY, FOCUS.y, forward) - envY; // the letter is the envelope's child
    letter.current.position.z = lerp(0, FOCUS.z, forward);
    letter.current.rotation.x = Math.sin(rise * Math.PI) * 0.1 * (1 - forward); // top leans forward: in front of the flap, bottom stays behind the pocket

    // 5. Camera dives into the letter.
    const dive = easeInOutCubic(segment(t, 2.75, 3.8));
    camera.position.set(0, lerp(0.35, FOCUS.y, dive), lerp(startZ, endZ, dive));
    camera.lookAt(0, lerp(0.35, FOCUS.y, dive), lerp(0, FOCUS.z, dive));

    // DOM overlays share this clock, so they stay in sync with the scene.
    if (tagline.current) tagline.current.style.opacity = String(segment(t, 2.2, 2.6) - segment(t, 2.95, 3.25));
    if (overlay.current) overlay.current.style.opacity = String(1 - segment(t, 3.8, END));
    if (t >= END && !finished.current) {
      finished.current = true;
      onDone();
    }
  });

  return (
    <>
      {/* three.js divides diffuse light by pi: these sum to ~1 on a front face, so paper reads white with soft falloff. */}
      <hemisphereLight args={['#ffffff', '#d8c7a8', 2.2]} />
      <directionalLight position={[3, 5, 6]} intensity={1.6} />
      <directionalLight position={[-4, 2, 3]} intensity={0.5} color="#ffe9cf" />

      <group ref={envelope}>
        <RoundedBox args={[W, H, 0.05]} radius={0.03} smoothness={3} position={[0, 0, -0.04]}>
          <meshPhysicalMaterial {...paper} color="#eadfcb" />
        </RoundedBox>

        <mesh ref={letter}>
          <planeGeometry args={[LETTER.w, LETTER.h]} />
          {/* Unlit and not tone-mapped: the final frame must match the page's beige exactly. */}
          <meshBasicMaterial map={textures.letter} toneMapped={false} side={DoubleSide} />
        </mesh>

        {SHEETS.map((s, i) => (
          <mesh key={s.title} ref={(m) => void (m && (sheets.current[i] = m))} visible={false}>
            <planeGeometry args={[0.95, 1.25]} />
            <meshStandardMaterial map={textures.sheets[i]} roughness={0.9} side={DoubleSide} />
          </mesh>
        ))}

        <mesh geometry={geometry.pocket} position={[0, 0, 0.022]}>
          <meshPhysicalMaterial {...paper} />
        </mesh>

        <group ref={flap} position={[0, H / 2, 0.05]}>
          <mesh geometry={geometry.flap}>
            <meshPhysicalMaterial {...paper} color="#f8f2e7" side={DoubleSide} />
          </mesh>
          <mesh ref={seal} position={[0, -1.1, 0.03]}>
            <circleGeometry args={[0.3, 48]} />
            <meshPhysicalMaterial map={textures.seal} transparent roughness={0.3} clearcoat={0.9} clearcoatRoughness={0.2} />
          </mesh>
        </group>
      </group>

      <ContactShadows position={[0, -1.55, 0]} scale={9} blur={2.6} opacity={0.32} far={4} resolution={512} color="#3b2f1e" />
    </>
  );
}

/** If WebGL fails mid-way (lost context, driver bug), skip the intro rather than show a broken page. */
class SkipOnError extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** next/font names its families; read the stacks it set, for the canvas-drawn text. */
function readFaces(): Faces {
  const css = getComputedStyle(document.querySelector('.paper') ?? document.documentElement);
  return {
    brand: css.getPropertyValue('--font-grotesk').trim() || 'sans-serif',
    sans: css.getPropertyValue('--font-plex-sans').trim() || 'sans-serif',
  };
}

export default function MailIntro({ onDone }: { onDone: () => void }) {
  const overlay = useRef<HTMLDivElement>(null);
  const tagline = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  const finish = useCallback(() => {
    if (!done.current) {
      done.current = true;
      onDone();
    }
  }, [onDone]); // Esc is handled by IntroGate, so it works even before this chunk loads

  // Canvas text only uses a web font that has already loaded: wait for the wordmark's and the
  // email titles', or they would be drawn in a fallback. A failed load still starts the scene.
  const [faces, setFaces] = useState<Faces | null>(null);
  useEffect(() => {
    const f = readFaces();
    Promise.allSettled([document.fonts.load(`600 24px ${f.brand}`), document.fonts.load(`600 24px ${f.sans}`)]).then(() => {
      setFaces(f);
    });
  }, []);

  return (
    <div ref={overlay} className="intro-cover is-on tw-root">
      <p className="sr-only">Owed. An envelope opens and its letter becomes this page.</p>
      <SkipOnError onError={finish}>
        {faces && (
          <Canvas
            aria-hidden
            dpr={[1, 1.5]}
            camera={{ fov: FOV, position: [0, 0.35, 9], near: 0.1, far: 60 }}
            flat
            gl={{ antialias: true, alpha: true }}
          >
            <Scene onDone={finish} overlay={overlay} tagline={tagline} faces={faces} />
          </Canvas>
        )}
      </SkipOnError>

      {/* Curved title above the letter, as real text. */}
      <div ref={tagline} aria-hidden className="tw:pointer-events-none tw:absolute tw:inset-x-0 tw:top-[7%] tw:opacity-0">
        <svg viewBox="0 0 700 170" className="tw:mx-auto tw:w-[min(94vw,44rem)]">
          <path id="intro-arc" d="M 20 160 Q 350 0 680 160" fill="none" />
          <text className="tw:fill-accent tw:font-serif tw:text-[34px] tw:font-semibold">
            <textPath href="#intro-arc" startOffset="50%" textAnchor="middle">
              Know what you owe, to whom, by when.
            </textPath>
          </text>
        </svg>
      </div>

      <button type="button" onClick={finish} className="btn tw:absolute tw:bottom-6 tw:right-6 tw:bg-sheet" autoFocus>
        Skip intro
      </button>
    </div>
  );
}
