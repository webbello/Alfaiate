// Owner-curated quotes only (FR-PUB-07): each one is a real customer's words, published with their written permission, which the
// owner records before adding it here. The section stays hidden while this list is empty. Never invent or adapt a quote (BR-11);
// this is not a review or rating system (PRD §7.3).
export type Testimonial = { quote: string; name: string; place: string };
export const TESTIMONIALS: readonly Testimonial[] = [];

/** Sample text for reviewing the layout only. Never shown unless SHOW_TESTIMONIAL_PLACEHOLDERS is "true" (development), always labelled as a sample, never presented as a real customer (BR-11). */
export const PLACEHOLDER_TESTIMONIALS: readonly Testimonial[] = [
  {
    quote:
      'Sample text: a customer would describe their experience here, in their own words.',
    name: 'Sample name',
    place: 'Sample town',
  },
  {
    quote:
      'Sample text: a second quote, added only with the customer’s written permission.',
    name: 'Sample name',
    place: 'Sample town',
  },
  {
    quote:
      'Sample text: a third quote. Replace all three with real ones before launch.',
    name: 'Sample name',
    place: 'Sample town',
  },
];
