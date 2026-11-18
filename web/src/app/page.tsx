import Link from 'next/link';
import type { Metadata } from 'next';

import MarketingNav from '@/components/MarketingNav';
import Footer from '@/components/Footer';
import IntroGate from '@/components/public/IntroGate';
import Paper, { PAPER_VIEWPORT } from '@/components/public/Paper';
import {
  Chapter,
  CompareTable,
  ConnectViz,
  ExtractViz,
  Faq,
  LandingHero,
  ListViz,
  ProblemCards,
  ScheduleViz,
  SectionIntro,
  TrustGrid,
  type TrustIcon,
} from '@/components/public/sections';
import { ScrollType } from '@/components/public/type';

export const metadata: Metadata = {
  title: 'Owed — the to-do list you never had to write',
  description:
    'Reads your sent mail and tells you what you owe, to whom, and by when. Gmail shows what arrived; this shows what you promised.',
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Owed — know what you owe',
    description:
      'It reads your sent mail for the promises you made and forgot. One list, ordered by what is late.',
    type: 'website',
  },
};

export const viewport = PAPER_VIEWPORT;

const PROBLEMS = [
  {
    title: 'The sentence you forgot',
    body: '“I’ll circle back with numbers on Monday.” You meant it. Monday came and went. The only record is buried in a thread you have no reason to reopen.',
  },
  {
    title: 'The chase you didn’t notice',
    body: 'Someone asked you something twelve days ago. It scrolled off the first screen and out of your memory. They are still waiting, and getting a slightly worse impression of you each day.',
  },
  {
    title: 'The day that never had room',
    body: 'You planned to “catch up on email today”. You had 43 minutes of gaps and four hours of replies. Nobody told you that until 6pm.',
  },
];

const STEPS = [
  {
    title: 'Connect Gmail',
    body: 'One sign-in. We read your mail and calendar, and nothing is ever sent unless you write it, read it and press Send.',
  },
  {
    title: 'We read what you sent',
    body: 'Not just your inbox — your sent folder. That is where "I\'ll get you the deck by Friday" is buried, and where every other tool stops looking.',
  },
  {
    title: 'You get one list',
    body: 'Everything you owe, ordered by how late it is, each row quoting the sentence you actually wrote. Nothing to type, nothing to maintain.',
  },
];

const COMPARISON = [
  ['Gmail', 'Sorts what arrived', 'No idea what you promised'],
  ['Boomerang', 'Nags when nobody replies to you', 'The opposite direction'],
  ['Superhuman / Shortwave', 'Faster triage, AI summaries', 'Still only inbound mail'],
  ['Todoist / Things', 'Tracks what you typed in', 'You have to remember to type it'],
] as const;

const TRUST: { icon: TrustIcon; title: string; body: string }[] = [
  {
    icon: 'send',
    title: 'It never sends by itself',
    body: 'You can write and send a reply here, from your own account. Nothing automated can: no scheduled send, no auto-reply, no path to your contacts that does not go through you pressing send on a message you have read.',
  },
  {
    icon: 'key',
    title: 'Your tokens are encrypted',
    body: 'The key to your mailbox is encrypted with AES-256-GCM before it is stored. The database only ever holds ciphertext.',
  },
  {
    icon: 'database',
    title: 'Isolated at the database',
    body: 'Row-level security means the database itself refuses to return another account’s rows — not just the app code.',
  },
  {
    icon: 'guess',
    title: 'It refuses to guess',
    body: 'A deadline is only shown when a real date parser confirmed it. Otherwise it says so. An AI that invents due dates is worse than none.',
  },
  {
    icon: 'training',
    title: 'No training on your mail',
    body: 'Your email is never used to train models, never sold, never shared with anyone.',
  },
  {
    icon: 'leave',
    title: 'Leave whenever',
    body: 'One button deletes every row and revokes access. No retention window, no support ticket.',
  },
];

const FAQ = [
  {
    q: 'Can it send email as me?',
    a: 'It can send a reply you have written and read, from your own Gmail account, when you press Send. It cannot send anything you have not. There is no scheduled send, no auto-reply, and nothing automated that can reach your contacts — every message that leaves your account passed under your eyes first. That is a deliberate line, and it is the one that matters.',
  },
  {
    q: 'What does it do with my email?',
    a: 'Subjects, previews and body text are read to work out priority and to find promises. Results are stored against your account and nothing else. Your mail is never used to train a model, never sold, and never shared.',
  },
  {
    q: 'How do I know a commitment is real?',
    a: 'Every row quotes the exact sentence it came from. If the sentence has no clear date, the row says "No deadline given" rather than inventing one. You can always check the claim against the source.',
  },
  {
    q: 'What if it gets something wrong?',
    a: 'Hit "Not mine" and it disappears. The extraction is deliberately narrow — "I\'ll be in touch" and "I\'ll try to look" create nothing, because a list full of noise is a list you stop opening.',
  },
  {
    q: 'Can I delete everything?',
    a: 'Settings → Delete account removes every row we hold and revokes our access to your Google account. No retention period, no "contact support to delete".',
  },
];

export default function LandingPage() {
  return (
    <Paper intro>
      <MarketingNav />

      <IntroGate>
        <main className="tw-root tw:text-base tw:leading-normal">
          <LandingHero />

          {/* ------------------------------------------------------- problem */}
          <section className="tw:py-16 tw:lg:py-24">
            <SectionIntro
              title="Your to-do list is missing half your work"
              body="Todo apps only know what you typed into them. But most of what you owe was never typed anywhere — it was said in passing, in an email, three weeks ago."
            />
            <ProblemCards cards={PROBLEMS} />
          </section>

          {/* -------------------------------------------------- how it works */}
          <section className="tw:pt-16 tw:lg:pt-24">
            <SectionIntro id="how" title="How it works" />
            <Chapter n={1} title={STEPS[0].title} body={STEPS[0].body}>
              <ConnectViz />
            </Chapter>
            <Chapter n={2} flip title={STEPS[1].title} body={STEPS[1].body}>
              <ExtractViz />
            </Chapter>
            <Chapter n={3} title={STEPS[2].title} body={STEPS[2].body}>
              <ListViz />
              <ScheduleViz />
            </Chapter>
          </section>

          {/* ---------------------------------------------------- comparison */}
          <section className="tw:py-16 tw:lg:py-24">
            <SectionIntro
              title="Why not just use what you have?"
              body="Every one of these is good at something. None of them read your sent mail."
            />
            <CompareTable rows={COMPARISON} />
          </section>

          {/* --------------------------------------------------------- trust */}
          <section className="tw:py-16 tw:lg:py-24">
            <SectionIntro
              title="Built to be trusted with your mail"
              body="You are handing over correspondence. Here is exactly what happens to it."
            />
            <TrustGrid items={TRUST} />
            <p className="tw:mx-auto tw:mt-8 tw:max-w-6xl tw:px-6 tw:text-sm tw:text-ink-soft">
              Full detail in the{' '}
              <Link href="/privacy" className="tw:underline tw:underline-offset-4">
                privacy policy
              </Link>
              .
            </p>
          </section>

          {/* ----------------------------------------------------------- faq */}
          <section className="tw:mx-auto tw:max-w-3xl tw:px-6 tw:py-16 tw:lg:py-24">
            <ScrollType
              as="h2"
              text="Questions"
              className="tw:font-serif tw:text-[2.1rem] tw:font-semibold tw:tracking-tight tw:text-ink tw:sm:text-5xl"
            />
            <Faq items={FAQ} />
          </section>

          {/* ----------------------------------------------------------- cta */}
          <section className="tw:px-6 tw:pb-28 tw:pt-8">
            <div className="tw:mx-auto tw:max-w-4xl tw:rounded-3xl tw:bg-sheet tw:px-6 tw:py-14 tw:text-center tw:shadow-xl tw:shadow-[#5b4520]/10 tw:sm:px-12">
              <ScrollType
                as="h2"
                text="Find out what you’ve forgotten"
                from="start 95%"
                to="start 60%"
                className="tw:font-serif tw:text-[2rem] tw:font-semibold tw:leading-tight tw:tracking-tight tw:text-ink tw:sm:text-[2.6rem]"
              />
              <p className="tw:mx-auto tw:mt-4 tw:max-w-xl tw:text-lg tw:leading-8 tw:text-ink-soft">
                Most people are surprised by the first list. Takes about a minute to find out.
              </p>
              <Link href="/login" className="btn btn-primary tw:mt-8 tw:px-6 tw:py-3 tw:text-base">
                Continue with Google
              </Link>
            </div>
          </section>
        </main>
      </IntroGate>

      <Footer />
    </Paper>
  );
}
