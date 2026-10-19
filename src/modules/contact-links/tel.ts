export const E164 = /^\+[1-9]\d{7,14}$/;

/** `tel:` link for a stored E.164 number. Refuses anything else, so nothing unexpected can reach an href. */
export function telLink(e164: string): string {
  if (!E164.test(e164)) throw new Error('Not an E.164 number');
  return `tel:${e164}`;
}
