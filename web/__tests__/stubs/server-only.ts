/**
 * `server-only` throws on import outside a React Server Component, which would
 * make every server module untestable. Vitest already runs in Node, so the
 * guard has nothing to protect here — vitest.config.ts aliases it to this.
 */
export {};
