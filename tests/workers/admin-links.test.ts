import { describe, expect, it } from 'vitest';
import {
  customerReach,
  tailorWhatsapp,
} from '../../src/modules/contact-links/admin-links';

const base = {
  reference_code: 'AT-ABCD2345',
  contact_number_e164: '+67077000999',
  contact_channel: 'whatsapp',
};
const text = (href: string) =>
  decodeURIComponent(new URL(href).search.slice(6));

describe('customerReach (FR-ADM-13)', () => {
  it('opens WhatsApp to the saved number with the reference code only', () => {
    const reach = customerReach(base)!;
    expect(reach.kind).toBe('whatsapp');
    expect(new URL(reach.href).pathname).toBe('/67077000999');
    expect(text(reach.href)).toContain('AT-ABCD2345');
    expect(text(reach.href)).not.toMatch(/\d{6}/); // no number or other digits in the message
  });

  it('offers a call, not WhatsApp, when the customer asked for phone calls', () => {
    expect(customerReach({ ...base, contact_channel: 'phone' })).toEqual({
      kind: 'call',
      href: 'tel:+67077000999',
    });
    expect(customerReach({ ...base, contact_channel: 'either' })!.kind).toBe(
      'whatsapp',
    );
  });

  it('gives nothing for an anonymised request or a bad number', () => {
    expect(customerReach({ ...base, contact_number_e164: null })).toBeNull();
    expect(customerReach({ ...base, contact_number_e164: '12345' })).toBeNull();
  });
});

describe('tailorWhatsapp', () => {
  it('names the reference only and refuses a missing or bad number', () => {
    const href = tailorWhatsapp('+67077000888', 'AT-ABCD2345')!;
    expect(new URL(href).pathname).toBe('/67077000888');
    expect(text(href)).toContain('AT-ABCD2345');
    expect(tailorWhatsapp(null, 'AT-ABCD2345')).toBeNull();
    expect(tailorWhatsapp('0771', 'AT-ABCD2345')).toBeNull();
  });
});
