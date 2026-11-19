/**
 * Who is a client, and which client.
 *
 * A client is keyed by email domain (everyone at acme.com is Acme). Free-mail
 * senders are keyed by their full address instead, so two unrelated people on
 * gmail.com never merge into one "client". Pure: no I/O, fully testable.
 */

const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'yahoo.com', 'ymail.com', 'rocketmail.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com',
  'proton.me', 'protonmail.com', 'pm.me', 'zoho.com', 'zohomail.com', 'zohomail.in',
  'rediffmail.com', 'gmx.com', 'gmx.net', 'gmx.de', 'mail.com', 'yandex.com', 'yandex.ru',
  'qq.com', '163.com', '126.com', 'fastmail.com', 'hey.com', 'tutanota.com', 'tuta.io',
]);
// Country variants: yahoo.co.in, hotmail.co.uk, outlook.in, live.fr and the like.
const FREE_MAIL_FAMILY = /^(?:yahoo|hotmail|outlook|live)\.[a-z.]+$/;

export function emailDomain(address: string): string {
  const at = address.lastIndexOf('@');
  return at < 0 ? '' : address.slice(at + 1).trim().toLowerCase();
}

export function isFreeMail(domain: string): boolean {
  return FREE_MAIL.has(domain) || FREE_MAIL_FAMILY.test(domain);
}

/** True when the address belongs to the org: one of its domains, or a subdomain of one. */
export function isInternal(address: string, orgDomains: string[]): boolean {
  const domain = emailDomain(address);
  if (!domain) return false;
  return orgDomains.some((d) => {
    const own = d.toLowerCase();
    return domain === own || domain.endsWith(`.${own}`);
  });
}

/**
 * The client key for an external address.
 * shortcut: eu.acme.com and acme.com are separate clients; merging them needs the
 * public-suffix list (acme.co.in vs co.in). Upgrade when a pilot hits it.
 */
export function clientKey(address: string): string {
  const email = address.trim().toLowerCase();
  const domain = emailDomain(email);
  return isFreeMail(domain) ? email : domain;
}

/** "acme-labs.co.in" -> "Acme Labs"; a free-mail client is shown by name, else address. */
export function clientDisplayName(address: string, personName = ''): string {
  const domain = emailDomain(address);
  if (isFreeMail(domain)) return personName.trim() || address.trim().toLowerCase();
  const label = domain.split('.')[0] ?? domain;
  return label
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}
