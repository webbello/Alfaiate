import { describe, expect, it } from 'vitest';
import { get } from './helpers';

// The request confirmation page offers "Message us your code on WhatsApp" (the message holds the reference code only), and the join page says what happens next
// and links to tailor sign-in. The test environments set fake numbers (see the vitest configs).
const wa = (html: string) =>
  /href="(https:\/\/wa\.me\/[0-9]+\?text=[^"]+)"[^>]*>\s*(Message us your code on WhatsApp|Haruka ita-nia kódigu ba ami iha WhatsApp)/.exec(
    html,
  );

describe('request confirmation page', () => {
  it('tells the customer to save the code and offers to message it on WhatsApp, with the code and nothing else in the message', async () => {
    const html = await (await get('/request/thanks?ref=AT-ABCD2345')).text();
    expect(html).toContain('Take a screenshot or write it down');
    const link = wa(html.replaceAll('&#38;', '&'));
    expect(link, 'WhatsApp button').not.toBeNull();
    expect(link![1]).toMatch(/^https:\/\/wa\.me\/6707700000[01]\?text=/);
    const text = decodeURIComponent(link![1]!.split('text=')[1]!);
    expect(text).toBe('Hello Alfaiate TL, my request code is AT-ABCD2345.');
    expect(html).toContain('Find a Tailor'); // one label for this action since the UX audit (P5)
  });

  it('is in Tetun on the Tetun page', async () => {
    const html = await (
      await get('/tet/request/thanks?ref=AT-ABCD2345')
    ).text();
    expect(wa(html.replaceAll('&#38;', '&'))).not.toBeNull();
    expect(html).toContain('Foto ka hakerek');
  });
});

describe('join page', () => {
  it('says what happens next in three steps and links to tailor sign-in', async () => {
    const html = await (await get('/join')).text();
    expect(html).toContain('<h1>Join Alfaiate TL as a tailor</h1>');
    const steps =
      /<ol class="how request__next" aria-label="What happens next">([\s\S]*?)<\/ol>/.exec(
        html,
      );
    expect(steps?.[1]!.match(/<li>/g)).toHaveLength(3);
    expect(html).toMatch(
      /Already approved by us\?\s*<a href="\/portal\/login">Tailor sign in<\/a>/,
    );
    expect(html).toContain('Being listed is never automatic');
  });

  it('is in Tetun on the Tetun page', async () => {
    const html = await (await get('/tet/join')).text();
    expect(html).toContain('Tama hanesan alfaiate iha Alfaiate TL');
    expect(html).toContain('href="/portal/login"');
  });
});
