import type { Dictionary } from './en';

// DRAFT Tetum (Tetun) text, written by the developer and NOT yet reviewed by a native speaker.
// It is only served when PUBLIC_LANGUAGES includes "tet", which stays off in production until the owner
// confirms a review (SPEC-phase-4, assumption 5). Every key must exist here; the compiler enforces it.
export const tet: Dictionary = {
  siteName: 'Alfaiate TL',
  skipToContent: 'Salta ba konteúdu prinsipál',
  nav: {
    label: 'Menu prinsipál',
    home: 'Pájina inísiu',
    tailors: 'Buka alfaiate',
    how: "Oinsá serbisu ne'e halo",
  },
  footer: {
    about: 'Kona-ba',
    privacy: 'Privasidade',
    terms: 'Kondisaun',
    label: "Kona-ba sítiu ne'e",
  },
  bar: {
    label: 'Asaun lais',
    ask: 'Husu alfaiate',
    whatsapp: 'WhatsApp ba ami',
    whatsappMessage: "Bondia, ha'u hakarak ajuda atu buka alfaiate.",
  },
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
    // Rascunho tetun, seidauk revista husi ema ne'ebé koalia tetun nu'udar lian-inan (OQ-07).
    promise: {
      kicker: 'Tanba sá alfaiate',
      heading: 'Halo ba ema ida de’it: ita.',
      body: 'Roupa husi loja halo ba ema média. Alfaiate tesi tuir ita-nia isin: ita-nia ombru, ita-nia aas, no oinsá ita gosta roupa monu.',
    },
    craft: {
      heading: 'Oinsá alfaiate hasai medida',
      intro:
        'Alfaiate hasai ita-nia medida ho ema ba ema. Ne’e medida lima ne’ebé forma roupa barak.',
      note: 'Ne’e de’it esplikasaun. Medida, folin no data ita koalia ho alfaiate, la liu husi sítiu ne’e.',
      shoulder: {
        name: 'Ombru',
        text: 'Husi ular to’o ombru-nia ninin. Ne’e determina oinsá kazaku ka kamiza monu.',
      },
      chest: {
        name: 'Ibun',
        text: 'Roda parte ne’ebé luan liu iha ibun, ba kazaku ka roupa-feto presiza fatin.',
      },
      waist: {
        name: 'Kabun',
        text: 'Roda kabun naturál, fatin ne’ebé kalsa no saia hatuur.',
      },
      inseam: {
        name: 'Kalsa laran',
        text: 'Husi fatin ne’ebé ain rua hasoru malu to’o ain-kakorok, ba kalsa-nia naruk.',
      },
      sleeve: {
        name: 'Liman-ben',
        text: 'Husi ombru to’o liman-kakorok, ho liman kolen uitoan.',
      },
    },
    local: {
      heading: 'Alfaiate iha Dili',
      body: 'Alfaiate ida-idak iha ne’e halo ninia negósiu rasik, ho matan rasik no jeitu rasik. Haree serbisu, lee saida mak sira dehan kona-ba sira, depois koalia ho sira.',
    },
    trust: {
      heading: 'Saida mak ami halo, no saida mak ami la halo',
      doHeading: 'Ami',
      do1: 'aprezenta ita ba alfaiate independente ne’ebé konkorda atu lista',
      do2: 'hatudu faktu hanesan alfaiate fornese, ka marka katak ami verifika',
      do3: 'fahe ita-nia detalle ba alfaiate de’it ho ita-nia konsentimentu',
      dontHeading: 'Ami la',
      dont1: 'determina folin, ka simu osan husi ita',
      dont2: 'garante alfaiate-nia disponibilidade, kualidade ka tempu',
      dont3: 'hatudu ita-nia detalle ba ema seluk',
    },
    ask: {
      heading: 'Prontu atu husu?',
      body: 'Hatete mai ami saida mak ita presiza no ita iha ne’ebé. Ho ita-nia konsentimentu, ami sei haruka ita-nia pedidu ba alfaiate ida.',
      button: 'Husu alfaiate',
    },
  },
  directory: {
    title: 'Buka alfaiate',
    heading: 'Buka alfaiate',
    intro:
      "Alfaiate sira ne'e konkorda atu lista iha Alfaiate TL. Loke perfíl atu haree sira-nia serbisu no kontaktu sira diretamente.",
    filtersHeading: 'Hamenus lista',
    category: 'Tipu roupa ka serbisu',
    area: 'Área',
    any: 'Hotu-hotu',
    homeVisit: 'Bele vizita iha uma',
    apply: 'Hatudu alfaiate sira',
    clear: 'Hamoos filtru sira',
    found: 'Alfaiate hetan: {count}',
    emptyHeading: "La iha alfaiate ne'ebé hanesan",
    emptyBody: 'Koko hasai filtru ida, ka husu alfaiate atu mai ita-nia uma.',
    truncated: 'Hatudu alfaiate 200 uluk. Uza filtru sira atu hamenus lista.',
    homeVisits: 'Bele vizita iha uma',
    viewProfile: 'Haree perfíl',
    moreFilters: 'Filtru ba área ka vizita iha uma',
  },
  pages: {
    how: {
      title: 'Oinsá Alfaiate TL serbisu',
      intro:
        'Alfaiate TL ajuda ita buka alfaiate independente iha Dili no kontaktu sira diretamente.',
      s1Heading: 'Saida mak ami',
      s1: "Alfaiate TL mak diretóriu ida. Ami aprezenta kliente sira ba alfaiate sira ne'ebé jere sira-nia negósiu rasik. Ami la'ós alfaiate: ami la halo, la faan, la entrega ka la hadi'a roupa.",
      s2Heading: 'Buka no kontaktu alfaiate',
      s2: "Haree lista, loke perfíl atu haree saida mak alfaiate halo, iha ne'ebé sira serbisu no folin aproximadu, depois toka WhatsApp ka Telefone atu koʼalia ho sira diretamente.",
      s3Heading: "Alfaiate ne'ebé mai ita-nia fatin",
      s3: "Alfaiate balu bele mai vizita ita atu foti medida. Uza formuláriu pedidu atu husu vizita ba uma, no ami sei haruka ita-nia pedidu ba alfaiate parseiru ida ne'ebé apropriadu. Ita bele mós kontaktu alfaiate sira diretamente no husu se sira bele vizita.",
      s4Heading: 'Folin no akordu',
      s4: 'Folin iha perfíl sira aproximadu no alfaiate rasik mak hili. Ita no alfaiate konkorda rasik ba folin final, material, medida, data no pagamentu. Alfaiate TL la simu pagamentu.',
      s5Heading: 'Saida mak ita bele fiar',
      s5: "Alfaiate sira hatudu iha ne'e de'it ho sira-nia lisensa. Informasaun ne'ebé marka \"Verifika husi Alfaiate TL\" ami mak verifika; seluk mai husi alfaiate rasik. Ami la publika avaliasaun ka revizaun.",
      s6Heading: 'Saida mak ami la bele promete',
      s6: "Ami la bele garante katak alfaiate disponivel, sira-nia serbisu di'ak ka bainhira sei remata. Favór konkorda ida-ne'e diretamente ho alfaiate.",
    },
    about: {
      title: 'Kona-ba Alfaiate TL',
      intro:
        'Alfaiate TL mak diretóriu alfaiate independente iha Dili, Timor-Leste.',
      s1Heading: 'Tanba sá iha',
      s1: 'Alfaiate TL hatuur alfaiate lokál sira iha fatin ida, hodi kliente sira bele haree saida mak sira halo no kontaktu sira diretamente, no alfaiate sira bele hetan kliente foun.',
      s2Heading: 'Oinsá jere',
      s2: 'Alfaiate TL aprezenta kliente no alfaiate. Alfaiate sira jere sira-nia negósiu rasik no konkorda ba folin no data ho sira-nia kliente rasik.',
    },
    privacy: {
      title: 'Avizu privasidade',
      intro:
        "Pájina ne'e mak fatin-reservadu. Avizu privasidade kompletu hela prepara no seidauk aprova.",
      s1Heading: 'Saida mak formuláriu pedidu halibur',
      s1: "Ita-nia naran, númeru telefone ka WhatsApp no tipu, saida mak ita presiza, ita-nia área, oras ne'ebé ita hakarak no nota se ita hakerek. La iha seluk. (Testu fatin-reservadu: dono hodi konfirma.)",
      s2Heading: 'Se mak simu',
      s2: "Ema sira ne'ebé dirije Alfaiate TL, no alfaiate parseiru ne'ebé simu ita-nia pedidu, depois de ita klik kaixa konsentimentu de'it. (Testu fatin-reservadu.)",
      s3Heading: 'Durasaun rai',
      s3: "Periodu atu rai seidauk deside no sei hatudu iha ne'e molok lansa.",
    },
    terms: {
      title: 'Kondisaun uza',
      intro:
        "Pájina ne'e mak fatin-reservadu. Kondisaun uza kompletu hela prepara no seidauk aprova.",
    },
  },
  profile: {
    metaDescription:
      '{name}: alfaiate iha Dili. Haree sira-nia serbisu, folin aproximadu no oinsá atu kontaktu sira.',
    contact: 'Kontaktu alfaiate',
    contactNote:
      'Ita konkorda ba folin, medida no data diretamente ho alfaiate.',
    about: 'Kona-ba',
    makes: 'Saida mak sira halo',
    where: 'Fatin',
    shopLocation: 'Loja',
    serves: 'Serbisu iha',
    languages: 'Lian sira',
    homeVisits: 'Vizita iha uma',
    homeYes: 'Bele vizita iha uma',
    homeNo: 'La vizita iha uma',
    address: 'Enderesu loja',
    priceNote: 'Kona-ba folin',
    prices: 'Folin',
    pricesIntro: 'Folin hotu-hotu aproximadu no alfaiate rasik mak hili.',
    work: 'Sira-nia serbisu',
    verified: 'Verifika husi Alfaiate TL',
    supplied: 'Informasaun husi alfaiate',
    suppliedNote:
      'Informasaun ne\'ebé marka "Informasaun husi alfaiate" mai husi alfaiate rasik no Alfaiate TL seidauk verifika.',
    back: 'Fila ba alfaiate hotu-hotu',
    requestThis: "Husu alfaiate ida-ne'e ba uma",
  },
  category: {
    title: 'Alfaiate {name}',
    heading: '{name}',
    intro: "Alfaiate sira ne'ebé halo ne'e.",
    emptyBody: "Seidauk iha alfaiate lista ba ne'e.",
  },
  join: {
    title: 'Hakbesik hanesan alfaiate',
    heading: 'Ita alfaiate?',
    intro:
      'Husik ita-nia detalle no ami sei telefone ita atu koalia. Ne’e la’ós rejistu: la kria konta no la hatama ita iha sítiu ne’e.',
    contactName: 'Ita-nia naran',
    business: 'Loja ka negósiu-nia naran (opsionál)',
    phone: 'Númeru telefone ka WhatsApp',
    area: 'Ita-nia loja iha ne’ebé? (opsionál)',
    craft: 'Ita halo saida? (opsionál)',
    message: 'Iha tan saida deit? (opsionál)',
    consentLegend: 'Kontaktu ita',
    consent:
      'Ha’u konkorda katak Alfaiate TL bele kontaktu ha’u iha númeru ne’e atu koalia kona-ba lista.',
    privacyLink: 'Lee avizu privasidade',
    submit: 'Haruka ha’u-nia detalle',
    notListing:
      'Lista la automátiku. Alfaiate lista de’it depois ami koalia no alfaiate fó lisensa.',
    forbiddenHeading: 'Ami la bele haruka ita-nia detalle',
    forbiddenBody:
      'Ita-nia browser la haruka saida mak ami presiza atu verifika formuláriu ne’e mai husi ne’ebé, entaun la rai buat ruma. Favór loke pájina ne’e fali no haruka fali.',
    failedHeading: 'Iha problema ruma',
    failedBody: 'Ita-nia detalle la rai. Favór koko fali iha tempu oin.',
    thanksTitle: 'Detalle simu ona',
    thanksHeading: 'Obrigadu, ami simu ona ita-nia detalle',
    thanksBody:
      'Ami sei kontaktu ita iha númeru neʼebé ita fó. Ami la bele promete bainhira.',
    banner: {
      heading: 'Ita alfaiate?',
      body: 'Hatete mai ami katak ita interese no ami sei telefone atu koalia.',
      link: 'Hakbesik hanesan alfaiate',
    },
  },
  request: {
    title: 'Husu alfaiate ba uma',
    heading: 'Husu alfaiate ba uma',
    intro:
      "Hatete ba ami saida mak ita presiza. Ami sei haruka ita-nia pedidu ba alfaiate parseiru ida ne'ebé apropriadu, no nia sei kontaktu ita.",
    notBooking:
      "Ida-ne'e pedidu de'it, la'ós marka konfirma ona. Alfaiate tenke konfirma ho ita direta se nia bele atende.",
    summaryHeading: "Favór hadi'a buat hirak ne'e",
    fromTailor: "Ita hahú pedidu ne'e husi pájina ba {name}.",
    name: 'Ita-nia naran',
    phone: 'Númeru telefone ka WhatsApp',
    phoneHint: 'Ezemplu: 7712 3456',
    channel: "Númeru ida-ne'e ba",
    channelWhatsapp: 'WhatsApp',
    channelPhone: 'Telefone',
    channelEither: 'Sira rua',
    choose: 'Hili…',
    stepOne: 'Pasu 1 husi 2: Ita presiza saida?',
    stepTwo: 'Pasu 2 husi 2: Oinsá ami bele kontaktu ita?',
    notSure: 'Seidauk hatene',
    category: 'Saida mak ita presiza? (opsionál)',
    service: 'Deskreve (opsionál)',
    area: 'Ita-nia área (opsionál)',
    areaOther: 'Fatin seluk',
    areaText: "Fatin ida-ne'ebé?",
    when: "Loron ka oras ne'ebé ita hakarak (opsionál)",
    whenHint: "Ida-ne'e dezeju de'it, la'ós marka.",
    notes: 'Buat seluk? (opsionál)',
    consentLegend: 'Fahe ita-nia detallu',
    consent:
      "Hau konkorda katak Alfaiate TL bele fahe hau-nia naran, númeru no detallu pedidu ba alfaiate parseiru ida ne'ebé apropriadu atu nia bele kontaktu hau.",
    privacyLink: 'Lee avizu privasidade',
    submit: 'Haruka pedidu',
    tooFast: 'Lalais liu. Favór haree fali ita-nia resposta no haruka fali.',
    expired: "Formuláriu ne'e expira ona. Favór haruka fali.",
    errorRequired: "Favór hakerek iha fatin ida-ne'e.",
    errorInvalid: "Ida-ne'e la loos.",
    errorTooLong: "Ida-ne'e naruk liu.",
    errorConsent:
      'Favór klik kaixa atu ami bele fahe ita-nia detallu ba alfaiate.',
    errorPhone:
      'Hakerek númeru Timor-Leste: dígitu 8 hahú ho 7 ka 3, ho ka laiha +670.',
    forbiddenHeading: 'Ami la bele haruka ita-nia pedidu',
    forbiddenBody:
      "Ita-nia browser la haruka buat ne'ebé ami presiza atu hatene formuláriu ne'e mai husi ne'ebé, tanba ne'e laiha buat ida grava. Favór loke fali pájina pedidu no haruka fali.",
    limitedHeading: 'Pedidu barak liu',
    limitedBody: 'Favór koko fali iha oras ida nia laran.',
    failedHeading: 'Buat ruma la loos',
    failedBody:
      'Ita-nia pedidu la grava. Favór koko fali, ka kontaktu alfaiate direta.',
    thanksTitle: 'Pedidu simu ona',
    thanksHeading: 'Pedidu simu ona',
    reference: 'Ita-nia kódigu referénsia',
    keepCode: "Favór rai kódigu ne'e.",
    thanksBody:
      "Ami sei kontaktu ita liuhusi númeru ne'ebé ita fó. Ami la bele promete oras.",
    browse: 'Haree alfaiate sira',
  },
  notFound: {
    title: 'Pájina la hetan',
    heading: "Ami la hetan pájina ne'e",
    body: "Pájina ne'e bele muda fatin, ka alfaiate ne'e la lista tan.",
    home: 'Fila ba pájina inísiu',
  },
};
