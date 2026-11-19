import { describe, expect, it } from 'vitest';

import { clientDisplayName, clientKey, isFreeMail, isInternal } from '@/lib/teams/clients';

describe('clientKey', () => {
  it('keys a company sender by domain', () => {
    expect(clientKey('Maya@Acme.com')).toBe('acme.com');
    expect(clientKey('tom@acme.com')).toBe('acme.com');
  });

  it('keys free-mail senders by full address so strangers never merge', () => {
    expect(clientKey('ravi.k@gmail.com')).toBe('ravi.k@gmail.com');
    expect(clientKey('priya@gmail.com')).not.toBe(clientKey('ravi.k@gmail.com'));
    expect(clientKey('a@yahoo.co.in')).toBe('a@yahoo.co.in');
    expect(clientKey('a@rediffmail.com')).toBe('a@rediffmail.com');
  });
});

describe('isFreeMail', () => {
  it('knows country variants of the big providers', () => {
    expect(isFreeMail('hotmail.co.uk')).toBe(true);
    expect(isFreeMail('outlook.in')).toBe(true);
    expect(isFreeMail('acme.com')).toBe(false);
    expect(isFreeMail('liveops.com')).toBe(false);
  });
});

describe('isInternal', () => {
  const org = ['getowed.online', 'owed.in'];

  it('matches org domains and their subdomains, case-insensitively', () => {
    expect(isInternal('lucky@getowed.online', org)).toBe(true);
    expect(isInternal('ops@mail.GetOwed.online', org)).toBe(true);
    expect(isInternal('x@owed.in', org)).toBe(true);
  });

  it('does not match look-alike domains', () => {
    expect(isInternal('x@notgetowed.online', org)).toBe(false);
    expect(isInternal('x@getowed.online.evil.com', org)).toBe(false);
    expect(isInternal('not-an-address', org)).toBe(false);
  });
});

describe('clientDisplayName', () => {
  it('names a company from its domain', () => {
    expect(clientDisplayName('maya@acme-labs.co.in')).toBe('Acme Labs');
  });

  it('names a free-mail client by person, else address', () => {
    expect(clientDisplayName('ravi@gmail.com', 'Ravi Menon')).toBe('Ravi Menon');
    expect(clientDisplayName('ravi@gmail.com')).toBe('ravi@gmail.com');
  });
});
