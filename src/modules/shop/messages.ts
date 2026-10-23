import { en } from '../../i18n/en';
import { messageKind } from '../admin-ui/messages';

const FIELDS = [
  'name',
  'description',
  'price',
  'price_note',
  'category_id',
] as const;
const LABELS: Record<(typeof FIELDS)[number], string> = {
  name: 'Product name',
  description: 'Description',
  price: 'Price',
  price_note: 'Price note',
  category_id: 'Type',
};

/** ?msg= and ?fields= as text, accepting only known keys (nothing from the URL is shown as is). */
export function productMessage(url: URL): {
  message: string;
  kind: 'success' | 'problem';
  fields: string[];
} {
  const code = url.searchParams.get('msg') ?? '';
  const message = Object.hasOwn(en.adminMessages, code)
    ? en.adminMessages[code as keyof typeof en.adminMessages]
    : '';
  const fields = (url.searchParams.get('fields') ?? '')
    .split(',')
    .filter((f): f is (typeof FIELDS)[number] =>
      (FIELDS as readonly string[]).includes(f),
    )
    .map((f) => LABELS[f]);
  return { message, kind: messageKind(code), fields };
}
