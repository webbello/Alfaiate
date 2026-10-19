export const en = {
  siteName: 'Alfaiate TL',
  skipToContent: 'Skip to main content',
  nav: { label: 'Main menu', home: 'Home' },
  language: { switchLabel: 'Language', en: 'English', tet: 'Tetun' },
  cta: { requestHome: 'Request a tailor at home' },
  contact: {
    whatsapp: 'WhatsApp',
    call: 'Call',
    whatsappMessage:
      'Hello, I found {name} on Alfaiate TL and would like to ask about your tailoring.',
  },
  price: {
    from: 'From {amount}',
    upTo: 'Up to {amount}',
    approximate: 'Approximate prices',
    confirmedOn: 'Confirmed {date}',
  },
  disclaimer: {
    short:
      "Alfaiate TL introduces you to independent tailors. The tailor, not Alfaiate TL, agrees the price, makes your clothes and sets the dates. We cannot guarantee a tailor's availability, quality or timing.",
  },
  notFound: {
    title: 'Page not found',
    heading: 'We could not find that page',
    body: 'The page may have moved, or the tailor may no longer be listed.',
    home: 'Go to the home page',
  },
};

/** The shape every language must have: same keys, text values. */
export type Widen<T> = {
  [K in keyof T]: T[K] extends string ? string : Widen<T[K]>;
};
export type Dictionary = Widen<typeof en>;
