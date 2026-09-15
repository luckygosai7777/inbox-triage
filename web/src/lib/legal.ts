/**
 * The entity details the privacy policy and terms have to name.
 *
 * These lived in the pages as literal "TODO: add your legal entity name"
 * strings, in bold, on a deployed site. Anyone who opened the privacy policy
 * read an unfinished template — and a policy with no working contact address
 * is not merely embarrassing, it leaves a user no way to exercise a data right
 * they are told they have.
 *
 * They are configuration rather than content because they are facts about a
 * company, not decisions about a product: they change when the company changes,
 * and nobody should need a deploy to correct an address.
 *
 * When one is unset the page says so plainly, in ordinary language, rather than
 * printing a developer's note to a stranger. Unset is honest for a product that
 * has not registered yet; a fake address never is.
 *
 * WHY THIS READS process.env DIRECTLY
 *
 * Going through the validated env() made the privacy policy depend on
 * SUPABASE_SERVICE_ROLE_KEY being present and well-formed, because env()
 * validates the whole schema or throws. The build caught it — prerendering
 * /privacy failed on a missing database secret — but the deeper point is that
 * it should never have been coupled at all: a privacy policy has to render
 * when the backend is broken, which is exactly when someone is most likely to
 * be looking for a way to contact you.
 *
 * These four are public, optional strings. There is nothing to validate and
 * nothing to leak.
 */
const read = (name: string): string => (process.env[name] ?? '').trim();

export type LegalDetails = {
  entity: string;
  address: string;
  jurisdiction: string;
  privacyEmail: string;
  legalEmail: string;
  securityEmail: string;
  /** False when anything required is missing, so pages can say so once. */
  complete: boolean;
};

export function legalDetails(): LegalDetails {
  const entity = read('LEGAL_ENTITY_NAME');
  const address = read('LEGAL_ADDRESS');
  const jurisdiction = read('LEGAL_JURISDICTION');
  const contact = read('CONTACT_EMAIL');

  return {
    entity,
    address,
    jurisdiction,
    // One address answers everything until there is a team to split it across.
    privacyEmail: contact,
    legalEmail: contact,
    securityEmail: contact,
    complete: Boolean(entity && address && jurisdiction && contact),
  };
}
