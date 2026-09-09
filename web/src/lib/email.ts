/**
 * Transactional email via Resend.
 *
 * Deliberately thin, and degrades to a no-op when RESEND_API_KEY is absent so
 * local development and the demo never try to send. Sending is best-effort:
 * a failed digest is logged and skipped, never allowed to fail a cron run and
 * block every other user behind it.
 */
import 'server-only';

import { appUrl } from './url';

type SendResult = { sent: boolean; skipped?: string; id?: string };

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<SendResult> {
  if (!emailConfigured()) {
    return { sent: false, skipped: 'RESEND_API_KEY or EMAIL_FROM not set' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        // One-click unsubscribe. Required by Gmail and Yahoo for bulk senders,
        // and the reason digests land in the inbox rather than Promotions.
        headers: {
          'List-Unsubscribe': `<${appUrl()}/app/settings>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error('[email] send failed', response.status, detail.slice(0, 200));
      return { sent: false, skipped: `provider returned ${response.status}` };
    }

    const body = (await response.json()) as { id?: string };
    return { sent: true, id: body.id };
  } catch (error) {
    console.error('[email] send threw:', error);
    return { sent: false, skipped: 'network error' };
  }
}
