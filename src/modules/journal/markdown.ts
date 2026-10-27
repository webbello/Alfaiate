/**
 * The few Markdown shapes the editor writes for an article body: paragraphs, headings, quotes, lists, a picture on its own line, and bold, italic and links inside text.
 * The result is plain data that the page renders as elements, so nothing from an article is ever inserted as HTML. Links must be http(s); pictures must live under /photos/.
 */
export type Inline = {
  text: string;
  strong?: boolean;
  em?: boolean;
  href?: string;
};
export type Block =
  | { kind: 'p' | 'h2' | 'h3' | 'quote'; inline: Inline[] }
  | { kind: 'ul' | 'ol'; items: Inline[][] }
  | { kind: 'img'; src: string; alt: string };

export const PHOTO_PATH = /^\/photos\/[A-Za-z0-9][A-Za-z0-9._/-]*$/;
export const safePhoto = (src: string): boolean =>
  PHOTO_PATH.test(src) && !src.includes('..') && !src.includes('//');

const TOKEN = /\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ text: m[1], strong: true });
    else if (m[2] !== undefined || m[3] !== undefined)
      out.push({ text: (m[2] ?? m[3])!, em: true });
    else if (/^https?:\/\//i.test(m[5]!))
      out.push({ text: m[4]!, href: m[5]! });
    else out.push({ text: m[4]! }); // an unsafe link keeps its words and loses the address
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

export function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of markdown.replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    const lines = chunk.split('\n').filter((l) => l.trim() !== '');
    if (lines.length === 0) continue;
    const first = lines[0]!;
    let m: RegExpExecArray | null;
    if ((m = /^#{1,2}\s+(.+)$/.exec(first)))
      blocks.push({ kind: 'h2', inline: parseInline(m[1]!) });
    else if ((m = /^#{3,6}\s+(.+)$/.exec(first)))
      blocks.push({ kind: 'h3', inline: parseInline(m[1]!) });
    else if ((m = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/.exec(first))) {
      if (safePhoto(m[2]!))
        blocks.push({ kind: 'img', src: m[2]!, alt: m[1]! });
    } else if (lines.every((l) => /^>\s?/.test(l)))
      blocks.push({
        kind: 'quote',
        inline: parseInline(lines.map((l) => l.replace(/^>\s?/, '')).join(' ')),
      });
    else if (lines.every((l) => /^[-*+]\s+/.test(l)))
      blocks.push({
        kind: 'ul',
        items: lines.map((l) => parseInline(l.replace(/^[-*+]\s+/, ''))),
      });
    else if (lines.every((l) => /^\d+[.)]\s+/.test(l)))
      blocks.push({
        kind: 'ol',
        items: lines.map((l) => parseInline(l.replace(/^\d+[.)]\s+/, ''))),
      });
    else
      blocks.push({
        kind: 'p',
        inline: parseInline(lines.map((l) => l.trim()).join(' ')),
      });
  }
  return blocks;
}
