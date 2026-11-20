import { headers } from 'next/headers';

import { INTRO_KEY } from './intro/played';
import MotionProvider from './MotionProvider';

/*
 * Runs while the HTML is parsed, before first paint. It marks that JavaScript is on (the typed
 * text and fade-ins only hide content when it is), and on the landing page decides whether the
 * mail intro is due, so its cover is up from the first frame rather than appearing over a page
 * the visitor has already seen. Esc and a 4s deadline release the cover even if React is slow to
 * arrive. Same rules as shouldPlayIntro() in intro/played.ts.
 */
const boot = (intro: boolean) =>
  `(function(){var d=document.documentElement;d.setAttribute('data-js','');` +
  (intro
    ? `var k=${JSON.stringify(INTRO_KEY)};` +
      `try{if(sessionStorage.getItem(k)==='1')return}catch(e){}` +
      `if(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)return;` +
      `try{if(!document.createElement('canvas').getContext('webgl2'))return}catch(e){return}` +
      `d.setAttribute('data-intro','play');` +
      `var skip=function(){if(d.getAttribute('data-intro')!=='play')return;d.setAttribute('data-intro','done');` +
      `try{sessionStorage.setItem(k,'1')}catch(e){}};` +
      `addEventListener('keydown',function(e){if(e.key==='Escape')skip()});setTimeout(skip,4000);`
    : '') +
  `})()`;

/**
 * Wraps a public page that animates: the inline script below, and motion that honours the
 * reduced-motion setting. The .paper class scopes the no-JavaScript fallbacks in styles/index.css.
 */
export default async function Paper({
  intro = false,
  children,
}: {
  intro?: boolean;
  children: React.ReactNode;
}) {
  // The CSP allows only scripts carrying this request's nonce (middleware.ts).
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <div className="paper">
      {/* The browser blanks a nonce attribute once read, so hydration would see a mismatch. */}
      <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: boot(intro) }} />
      <MotionProvider>{children}</MotionProvider>
    </div>
  );
}
