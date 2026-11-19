/**
 * One conversation across many mailboxes.
 *
 * Gmail's threadId is per mailbox: the same client thread has a different id
 * in each teammate's Gmail. The RFC 822 headers are what every copy shares, so
 * conversations are correlated on those. A thread's key is its root
 * Message-ID: the first entry of References, else In-Reply-To, else the
 * message's own Message-ID (it starts the thread).
 *
 * shortcut: a client that drops References entirely and replies with only
 * In-Reply-To pointing mid-thread lands on a different key. Upgrade to
 * union-find over all ids if pilots show split threads.
 */
import type { Headers } from '@/lib/parsing';

/** Every `<id@host>` in a header, in order. */
export function messageIdList(value: string | undefined): string[] {
  return (value ?? '').match(/<[^<>\s]+>/g) ?? [];
}

export type ThreadHeaders = { messageId: string; inReplyTo: string; references: string[] };

export function threadHeaders(headers: Headers): ThreadHeaders {
  return {
    messageId: messageIdList(headers['message-id'])[0] ?? '',
    inReplyTo: messageIdList(headers['in-reply-to'])[0] ?? '',
    references: messageIdList(headers.references),
  };
}

export function threadKey(h: ThreadHeaders): string {
  return h.references[0] || h.inReplyTo || h.messageId;
}

export type ThreadMessage = { fromInternal: boolean; sentAt: Date };

/**
 * Has anyone in the org replied since this ask? Any connected teammate counts,
 * not just the person it was sent to: that is what makes the ask "answered".
 */
export function answeredSince(thread: ThreadMessage[], askedAt: Date): boolean {
  return thread.some((m) => m.fromInternal && m.sentAt.getTime() > askedAt.getTime());
}
