/**
 * POST /api/draft — a reply to one thread, written in the user's own voice.
 *
 * Two things remain true now that the app can send (see api/send):
 *
 *  1. This route still sends nothing. It returns text into a box the user can
 *     edit, and sending is a separate, deliberate act on a separate endpoint.
 *     Nothing automated reaches either. An inbox tool that can email your
 *     clients unattended is a different and much more frightening product, and
 *     that line has not moved — only where the send button lives.
 *  2. Message bodies are read live from Gmail for this request and are never
 *     written to our database. The draft is not stored either. The most
 *     sensitive text in the system therefore exists only for the length of one
 *     request.
 */
import { z } from 'zod';

import { route, HttpError } from '@/lib/api';
import { isDemo } from '@/lib/demo';
import { GoogleNotConnected, gmailFor } from '@/lib/gmail';
import { LLMUnavailable, activeProvider, draftReply } from '@/lib/llm';
import { extractBodyText, splitAddress, stripQuoted } from '@/lib/parsing';
import { EMPTY_VOICE, profileVoice } from '@/lib/voice';

const schema = z.object({
  thread_id: z.string().uuid(),
});

/** How many of the user's own emails to measure their voice from. */
const VOICE_SAMPLE_SIZE = 12;

export const POST = route<z.infer<typeof schema>>(
  async ({ db, user, input }) => {
    if (isDemo()) {
      throw new HttpError(400, 'Drafting needs a real mailbox. Connect Gmail to try it.');
    }
    if (activeProvider() === 'none') {
      throw new HttpError(
        503,
        'No AI provider is configured. Add GEMINI_API_KEY (free) or ANTHROPIC_API_KEY.',
      );
    }

    const [{ data: thread }, { data: rows }] = await Promise.all([
      db
        .from('threads')
        .select('id, subject')
        .eq('user_id', user.id)
        .eq('id', input.thread_id)
        .maybeSingle(),
      db
        .from('messages')
        .select('gmail_message_id, from_name, from_email, sent_at, is_outbound, preview')
        .eq('user_id', user.id)
        .eq('thread_id', input.thread_id)
        .order('sent_at', { ascending: true }),
    ]);

    if (!thread || !rows?.length) throw new HttpError(404, 'Thread not found');

    const inbound = [...rows].reverse().find((row: any) => !row.is_outbound);
    if (!inbound) {
      throw new HttpError(400, 'Nothing to reply to — every message here is yours.');
    }

    // The user's own recent sent mail, for the voice profile. Ones written to
    // this same person come first: people write differently to different
    // people, and the closest match is the best evidence.
    const { data: sent } = await db
      .from('messages')
      .select('gmail_message_id, to_emails, sent_at')
      .eq('user_id', user.id)
      .eq('is_outbound', true)
      .order('sent_at', { ascending: false })
      .limit(60);

    const recipient = String((inbound as any).from_email).toLowerCase();
    const ranked = [...(sent ?? [])].sort((a: any, b: any) => {
      const aMatch = (a.to_emails ?? []).some((e: string) => e.toLowerCase() === recipient);
      const bMatch = (b.to_emails ?? []).some((e: string) => e.toLowerCase() === recipient);
      return Number(bMatch) - Number(aMatch);
    });

    let gmail;
    try {
      gmail = await gmailFor(user.id);
    } catch (error) {
      if (error instanceof GoogleNotConnected) throw new HttpError(409, error.message);
      throw error;
    }

    const fetchBody = async (id: string): Promise<string> => {
      const { data } = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
      return stripQuoted(extractBodyText((data as any).payload, 8000));
    };

    // One round trip for the thread, one for the voice samples.
    const [threadBodies, voiceBodies] = await Promise.all([
      Promise.allSettled(rows.map((row: any) => fetchBody(row.gmail_message_id))),
      Promise.allSettled(
        ranked.slice(0, VOICE_SAMPLE_SIZE).map((row: any) => fetchBody(row.gmail_message_id)),
      ),
    ]);

    // Why a fetch failed matters, and used to be thrown away. An expired token,
    // a deleted message and a Gmail outage all produced the same unhelpful
    // "try again in a moment" for a user with nothing to try.
    const failures = threadBodies.flatMap((settled) =>
      settled.status === 'rejected' ? [settled.reason] : [],
    );
    if (failures.length) {
      console.warn(
        `[draft] ${failures.length}/${rows.length} bodies failed:`,
        failures.map((error: any) => `${error?.code ?? ''} ${error?.message ?? error}`).join(' | '),
      );
    }

    const messages = rows.map((row: any, index: number) => {
      const settled = threadBodies[index];
      const fetched = settled.status === 'fulfilled' ? settled.value.trim() : '';
      return {
        fromName: row.from_name ?? '',
        fromEmail: row.from_email ?? '',
        sentAt: new Date(row.sent_at).toISOString().slice(0, 16).replace('T', ' '),
        isOutbound: Boolean(row.is_outbound),
        // Falling back to the stored preview beats refusing to draft. A short
        // reply written from the first 200 characters is worse than one written
        // from the whole thread, and enormously better than nothing — which is
        // what a hard failure here was delivering.
        body: fetched || String(row.preview ?? '').trim(),
        fromPreviewOnly: !fetched,
      };
    });

    const usable = messages.filter((m) => m.body);
    if (!usable.length) {
      const reason = (failures[0] as any)?.message ?? '';
      // 401/403 means the Google grant is stale, which no amount of retrying
      // fixes — reconnecting does.
      if (/invalid_grant|invalid credentials|unauthorized|insufficient/i.test(reason)) {
        throw new HttpError(
          409,
          'Google access has expired. Open Settings and reconnect your account.',
        );
      }
      throw new HttpError(
        502,
        failures.length
          ? 'Gmail would not return this thread. It may have been deleted or moved.'
          : 'This thread has no readable text to reply to.',
      );
    }

    // A failed voice fetch is not a failed draft; it just means less evidence.
    const voice = profileVoice(
      voiceBodies.flatMap((settled) => (settled.status === 'fulfilled' ? [settled.value] : [])),
    );

    const senderName =
      splitAddress(
        (rows.find((row: any) => row.is_outbound) as any)?.from_name
          ? `${(rows.find((row: any) => row.is_outbound) as any).from_name} <${user.email}>`
          : String(user.email ?? ''),
      ).name || (user.email ?? '').split('@')[0];

    let draft;
    try {
      draft = await draftReply({
        messages,
        subject: (thread as any).subject ?? '',
        recipientName: (inbound as any).from_name || (inbound as any).from_email,
        senderName,
        voice: voice.sampleCount ? voice : EMPTY_VOICE,
      });
    } catch (error) {
      if (error instanceof LLMUnavailable) {
        // These messages are written by us, not by the provider, and are
        // deliberately specific: "no model named X" and "rejected the API key"
        // are fixable in a minute, while "unavailable, try again shortly" sends
        // someone away to wait for a problem that will never clear on its own.
        // The provider's own prose, which can name a project, stays in the log.
        console.warn('[draft] provider failed:', (error as Error).message);
        throw new HttpError(503, `Could not write a draft — ${(error as Error).message}.`);
      }
      throw error;
    }

    return {
      draft: draft.body,
      asks: draft.asks,
      gaps: draft.gaps,
      tells: draft.tells,
      to: (inbound as any).from_email,
      subject: (thread as any).subject ?? '',
      // Honest about what it read. A draft built from previews is thinner and
      // the user should know before they trust it.
      fromPreviewOnly: messages.some((m) => m.body && m.fromPreviewOnly),
      voice: {
        // Shown in the UI so the user can see what it learned, and why a draft
        // reads the way it does.
        measuredFrom: voice.sampleCount,
        greeting: voice.greeting,
        signOff: voice.signOff,
        replyWords: voice.replyWords,
      },
      provider: activeProvider(),
    };
  },
  {
    schema,
    // Drafting costs a model call and two Gmail round trips. Twenty an hour is
    // more than anyone triages by hand, and caps a stolen session's bill.
    limit: { bucket: 'draft', max: 20, windowSeconds: 3600 },
  },
);

export const maxDuration = 60;
