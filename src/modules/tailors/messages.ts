import { en } from '../../i18n/en';

/** Turns ?msg= and ?fields= into text, accepting only known keys (nothing from the URL is rendered as is). */
export function messageFrom(url: URL): { message: string; fields: string[] } {
  const code = url.searchParams.get('msg') ?? '';
  const message = Object.hasOwn(en.adminMessages, code)
    ? en.adminMessages[code as keyof typeof en.adminMessages]
    : '';
  const fields = (url.searchParams.get('fields') ?? '')
    .split(',')
    .filter((f) => Object.hasOwn(en.tailorFields, f))
    .map((f) => en.tailorFields[f as keyof typeof en.tailorFields]);
  return { message, fields };
}
