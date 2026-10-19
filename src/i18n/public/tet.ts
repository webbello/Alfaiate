import type { Dictionary } from './en';

// DRAFT Tetum (Tetun) text, written by the developer and NOT yet reviewed by a native speaker.
// It is only served when PUBLIC_LANGUAGES includes "tet", which stays off in production until the owner
// confirms a review (SPEC-phase-4, assumption 5). Every key must exist here; the compiler enforces it.
export const tet: Dictionary = {
  siteName: 'Alfaiate TL',
  skipToContent: 'Salta ba konteúdu prinsipál',
  nav: { label: 'Menu prinsipál', home: 'Pájina inísiu' },
  language: { switchLabel: 'Lian', en: 'English', tet: 'Tetun' },
  cta: { requestHome: 'Husu alfaiate ba uma' },
  contact: {
    whatsapp: 'WhatsApp',
    call: 'Telefone',
    whatsappMessage:
      "Bondia, ha'u hetan {name} iha Alfaiate TL no ha'u hakarak husu kona-ba ita-nia serbisu alfaiate.",
  },
  price: {
    from: 'Hahú husi {amount}',
    upTo: "To'o {amount}",
    approximate: 'Folin aproximadu',
    confirmedOn: 'Konfirma iha {date}',
  },
  disclaimer: {
    short:
      "Alfaiate TL aprezenta ita ba alfaiate independente sira. Alfaiate rasik, la'ós Alfaiate TL, konkorda ba folin, halo ita-nia roupa no hili data. Ami la bele garante alfaiate disponivel, kualidade ka tempu.",
  },
  home: {
    title: 'Buka alfaiate iha Dili',
    description:
      'Alfaiate TL ajuda ita buka alfaiate independente iha Dili, haree sira-nia serbisu no folin aproximadu, no kontaktu sira diretamente liuhosi WhatsApp ka telefone.',
    heading: 'Buka alfaiate iha Dili',
    intro:
      'Haree alfaiate lokál sira, hatene saida mak sira halo no folin aproximadu, depois kontaktu sira diretamente liuhosi WhatsApp ka telefone. Hakarak vizita iha uma? Husu alfaiate atu mai ita-nia fatin.',
    noteLabel: 'Favór nota',
    browse: 'Haree alfaiate sira',
    how: {
      heading: "Oinsá serbisu ne'e halo",
      step1Title: 'Haree',
      step1: 'Haree alfaiate sira, sira-nia serbisu no folin aproximadu.',
      step2Title: 'Kontaktu',
      step2: 'Toka WhatsApp ka Telefone atu koʼalia ho alfaiate diretamente.',
      step3Title: 'Konkorda',
      step3: 'Ita no alfaiate rasik konkorda ba folin, medida no data.',
    },
    categoriesHeading: 'Ita presiza saida?',
  },
  request: {
    title: 'Husu alfaiate ba uma',
    heading: 'Husu alfaiate ba uma',
    body: "Formuláriu pedidu ne'e seidauk loke. Agora ita bele haree alfaiate sira no kontaktu sira diretamente.",
    browse: 'Haree alfaiate sira',
  },
  notFound: {
    title: 'Pájina la hetan',
    heading: "Ami la hetan pájina ne'e",
    body: "Pájina ne'e bele muda fatin, ka alfaiate ne'e la lista tan.",
    home: 'Fila ba pájina inísiu',
  },
};
