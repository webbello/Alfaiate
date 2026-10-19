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
  home: {
    title: 'Find a tailor in Dili',
    description:
      'Alfaiate TL helps you find independent tailors in Dili, see their work and approximate prices, and contact them directly by WhatsApp or phone.',
    heading: 'Find a tailor in Dili',
    intro:
      'Browse local tailors, see what they make and roughly what it costs, then contact them directly by WhatsApp or phone. Prefer a visit? Ask for a tailor to come to you.',
    noteLabel: 'Please note',
    browse: 'Browse tailors',
    how: {
      heading: 'How it works',
      step1Title: 'Browse',
      step1: 'Look through tailors, their work and their approximate prices.',
      step2Title: 'Contact',
      step2: 'Tap WhatsApp or Call to talk to a tailor directly.',
      step3Title: 'Agree',
      step3:
        'You and the tailor agree the price, measurements and dates between yourselves.',
    },
    categoriesHeading: 'What do you need?',
  },
  request: {
    title: 'Request a tailor at home',
    heading: 'Request a tailor at home',
    body: 'The request form is not open yet. For now you can browse tailors and contact them directly.',
    browse: 'Browse tailors',
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
