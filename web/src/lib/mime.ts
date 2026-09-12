/**
 * Building an RFC 2822 message for the Gmail API.
 *
 * Gmail's send endpoint takes one field: a base64url-encoded raw message. That
 * means every detail of the envelope — threading, encoding, attachment
 * boundaries — is ours to get right, and the failure mode for getting it wrong
 * is not an exception. It is an email that arrives at a client looking broken.
 *
 * Three things here are less obvious than they look:
 *
 *  1. THREADING is not the threadId. Passing Gmail a threadId puts the message
 *     in the right conversation *in the sender's own mailbox*. For the reply to
 *     thread in the recipient's mail client — which may not be Gmail — it needs
 *     In-Reply-To and References headers carrying the original Message-ID.
 *     Miss those and every reply starts a new conversation on their side.
 *
 *  2. HEADERS ARE ASCII. A name like "José" or a subject in Devanagari has to
 *     be RFC 2047 encoded-word wrapped, or Gmail rejects the message outright.
 *
 *  3. BODIES NEED QUOTED-PRINTABLE OR BASE64. A raw UTF-8 body with long lines
 *     violates the 998-character line limit and can be mangled in transit.
 *     Base64 for the body is the boring, safe choice.
 *
 * Everything here is pure and unit tested. No network, no Gmail client.
 */

export type Attachment = {
  filename: string;
  /** MIME type, e.g. "application/pdf". */
  mimeType: string;
  /** Raw bytes, already base64-encoded. */
  base64: string;
};

export type OutgoingMessage = {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  /** Plain text. The HTML part is generated from it. */
  body: string;
  /** The sender, as Gmail will send it. */
  fromName?: string;
  fromEmail: string;
  /** Message-ID of the message being replied to, with angle brackets. */
  inReplyTo?: string;
  /** Existing References chain, space separated. */
  references?: string;
  attachments?: Attachment[];
};

/** Does this string need encoding to survive an ASCII-only header? */
function needsEncoding(value: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /[^\x20-\x7E]/.test(value);
}

/**
 * RFC 2047 encoded-word. Non-ASCII header text becomes =?UTF-8?B?...?=.
 *
 * Long values are split into several encoded words, because the spec caps one
 * at 75 characters and some servers enforce it.
 */
export function encodeHeaderValue(value: string): string {
  if (!needsEncoding(value)) return value;

  /*
   * The 75-character cap is on the whole encoded word, and the arithmetic runs
   * backwards from there: "=?UTF-8?B?" + "?=" costs 12, leaving 63 for the
   * base64, which must be a multiple of 4, so 60 — and 60 base64 characters
   * encode 45 bytes.
   *
   * Bytes, not characters. Chunking by character length was wrong the moment
   * the text was not Latin: one Devanagari character is three bytes, so thirty
   * of them became a 120-character word. Splitting must also land on a
   * character boundary, because half a multi-byte sequence decodes to nothing.
   */
  const MAX_BYTES = 45;
  const words: string[] = [];
  let chunk = '';
  let bytes = 0;

  for (const char of value) {
    const size = Buffer.byteLength(char, 'utf8');
    if (bytes + size > MAX_BYTES && chunk) {
      words.push(`=?UTF-8?B?${Buffer.from(chunk, 'utf8').toString('base64')}?=`);
      chunk = '';
      bytes = 0;
    }
    chunk += char;
    bytes += size;
  }
  if (chunk) words.push(`=?UTF-8?B?${Buffer.from(chunk, 'utf8').toString('base64')}?=`);

  return words.join(' ');
}

/** `Name <a@b.com>`, with the display name encoded and quoted when needed. */
export function formatAddress(email: string, name?: string): string {
  const clean = email.trim();
  if (!name?.trim()) return clean;

  const display = name.trim();
  if (needsEncoding(display)) return `${encodeHeaderValue(display)} <${clean}>`;
  // Quote anything with a special character in it, per RFC 5322 atom rules.
  if (/[(),.:;<>@[\]\\"]/.test(display)) return `"${display.replace(/(["\\])/g, '\\$1')}" <${clean}>`;
  return `${display} <${clean}>`;
}

/** Header injection defence: a newline in a header is a forged header. */
function sanitiseHeader(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

/** Minimal, safe text→HTML for the alternative part. */
function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<div style="white-space:pre-wrap;font-family:-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.6;">${escaped}</div>`;
}

function base64Lines(data: string): string {
  // RFC 2045: base64 in a message body is wrapped at 76 characters.
  return (data.match(/.{1,76}/g) ?? []).join('\r\n');
}

/** A boundary that cannot appear in the content it separates. */
function boundary(prefix: string): string {
  const random = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 36).toString(36),
  ).join('');
  return `----=_Owed_${prefix}_${random}`;
}

/**
 * Build the complete message.
 *
 * Structure depends on what is present, because a needlessly nested message
 * renders badly in older clients:
 *
 *   text only              multipart/alternative (plain + html)
 *   text + attachments     multipart/mixed [ alternative, ...parts ]
 */
export function buildMimeMessage(message: OutgoingMessage): string {
  const attachments = message.attachments ?? [];
  const altBoundary = boundary('alt');
  const mixedBoundary = boundary('mix');

  const headers: string[] = [
    `From: ${sanitiseHeader(formatAddress(message.fromEmail, message.fromName))}`,
    `To: ${message.to.map((a) => sanitiseHeader(a)).join(', ')}`,
  ];
  if (message.cc?.length) headers.push(`Cc: ${message.cc.map(sanitiseHeader).join(', ')}`);
  if (message.bcc?.length) headers.push(`Bcc: ${message.bcc.map(sanitiseHeader).join(', ')}`);
  headers.push(`Subject: ${encodeHeaderValue(sanitiseHeader(message.subject))}`);

  // The two headers that make a reply thread in someone else's mail client.
  if (message.inReplyTo) {
    const id = sanitiseHeader(message.inReplyTo);
    headers.push(`In-Reply-To: ${id}`);
    // References accumulates the whole chain; the parent goes on the end.
    const chain = message.references ? `${sanitiseHeader(message.references)} ${id}` : id;
    headers.push(`References: ${chain}`);
  }

  headers.push('MIME-Version: 1.0');

  const plainPart = [
    `Content-Type: text/plain; charset="UTF-8"`,
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(Buffer.from(message.body, 'utf8').toString('base64')),
  ].join('\r\n');

  const htmlPart = [
    `Content-Type: text/html; charset="UTF-8"`,
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(Buffer.from(textToHtml(message.body), 'utf8').toString('base64')),
  ].join('\r\n');

  const alternative = [
    `--${altBoundary}`,
    plainPart,
    `--${altBoundary}`,
    htmlPart,
    `--${altBoundary}--`,
  ].join('\r\n');

  if (!attachments.length) {
    headers.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
    return [...headers, '', alternative].join('\r\n');
  }

  headers.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);

  const parts = [
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    '',
    alternative,
  ];

  for (const file of attachments) {
    const name = encodeHeaderValue(sanitiseHeader(file.filename));
    parts.push(
      `--${mixedBoundary}`,
      `Content-Type: ${sanitiseHeader(file.mimeType) || 'application/octet-stream'}; name="${name}"`,
      `Content-Disposition: attachment; filename="${name}"`,
      'Content-Transfer-Encoding: base64',
      '',
      base64Lines(file.base64.replace(/\s+/g, '')),
    );
  }
  parts.push(`--${mixedBoundary}--`);

  return [...headers, '', parts.join('\r\n')].join('\r\n');
}

/**
 * Gmail wants base64url — the URL-safe alphabet, unpadded.
 *
 * Standard base64 uses + and /, which are not URL safe, and the API rejects a
 * message encoded with them rather than silently fixing it.
 */
export function toBase64Url(raw: string): string {
  return Buffer.from(raw, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Accepts "a@b.com, Name <c@d.com>; e@f.com" and returns the addresses. */
export function parseRecipients(input: string): string[] {
  return input
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const angled = part.match(/<([^>]+)>/);
      return (angled ? angled[1] : part).trim();
    })
    .filter((address, index, all) => address && all.indexOf(address) === index);
}

/** Deliberately permissive — the real check is whether Gmail accepts it. */
export function isEmailish(address: string): boolean {
  return /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(address);
}
