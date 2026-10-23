import { en } from '../../i18n/en';
import { messageKind } from '../admin-ui/messages';

const LABELS: Record<string, string> = {
  ...en.tailorFields,
  ...en.publishFields,
};

/** Turns ?msg= and ?fields= into text, accepting only known keys (nothing from the URL is rendered as is). */
export function messageFrom(url: URL): {
  code: string;
  message: string;
  kind: 'success' | 'problem';
  /** The dictionary label of each rejected field, for the banner. */
  fields: string[];
  /** The raw keys of those fields, so the page can mark the exact control. */
  fieldKeys: string[];
} {
  const code = url.searchParams.get('msg') ?? '';
  const message = Object.hasOwn(en.adminMessages, code)
    ? en.adminMessages[code as keyof typeof en.adminMessages]
    : '';
  const fieldKeys = (url.searchParams.get('fields') ?? '')
    .split(',')
    .filter((f) => Object.hasOwn(LABELS, f));
  const fields = fieldKeys.map((f) => LABELS[f] as string);
  return {
    code,
    message,
    kind: messageKind(code),
    fields,
    fieldKeys,
  };
}
