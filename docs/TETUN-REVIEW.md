# Tetun wording for native-speaker review (OQ-07)

Status: **not reviewed.** The Tetun below was written by the assistant during the Handspark theme work (2026-10-23). Nothing here has been checked by a Tetun speaker. Each block is a section of `src/i18n/public/tet.ts`; send corrections back and they will be applied there. Older Tetun text (earlier phases) is also unreviewed; this list covers what the theme work added or changed.

## Request list panel (step 4) — `requestList`

```ts
    toggle: 'Lista pedidu',
    title: 'Ita-nia lista pedidu',
    close: 'Taka lista pedidu',
    empty:
      'Hatama alfaiate sira ne’ebé ita hakarak husu. Bele husu to’o tolu iha tempu ida.',
    addLabel: 'Hatama ba lista pedidu',
    add: 'Hatama {name} ba ha’u-nia lista pedidu',
    remove: 'Hasai',
    removeNamed: 'Hasai {name} husi ha’u-nia lista pedidu',
    send: 'Haruka pedidu',
    full: 'Bele husu alfaiate to’o tolu de’it.',
    note: 'Sei la haruka buat ida to’o ita prense formuláriu pedidu.',
```

## Journal (step 6) — `journal`

```ts
    title: 'Jornál',
    heading: 'Jornál',
    intro: 'Dika kona-ba hili, tau matan no hakerek ropa.',
    empty: 'Seidauk iha artigu. Favór fila fali iha tempu badak.',
    readMore: 'Lee artigu',
    back: 'Fila ba jornál',
    categories: 'Kategoria',
    all: 'Artigu hotu',
    sample: 'Artigu amostra hodi haree layout deit. Ne’e la’ós konsellu loos.',
    related: 'Liu tan husi jornál',
    rss: 'Feed RSS',
    published: 'Publika iha',
```

## Gallery (step 6) — `gallery`

```ts
    title: 'Galeria',
    heading: 'Galeria',
    intro: 'Serbisu hatudu ho alfaiate nia lisensa. Loke foto atu haree boot liu, ka vizita alfaiate.',
    empty: 'Seidauk iha foto. Alfaiate nia serbisu sei hatudu iha ne’e bainhira nia fó lisensa.',
    by: 'Husi {name}',
    view: 'Haree foto {name} nian boot liu',
```

## FAQ page (step 6) — `faqPage`

```ts
    title: 'Pergunta sira ne’ebé ema husu',
    intro: 'Resposta badak kona-ba buka alfaiate, folin no pedidu.',
```

## Single lines

- `nav.more` Liu tan, `nav.journal` Jornál, `nav.gallery` Galeria, `nav.faq` Pergunta sira
- `hero.reassure` and the home hero button "Husu Alfaiate ba Uma" (earlier visual pass)
- `request.fromList` "Ita husu alfaiate sira ne'e: {names}."

## Shop (S2, S3) — `shop`

```ts
    title: 'Loja',
    heading: 'Loja',
    intro: 'Ropa, tecidu no asesóriu husi Alfaiate TL. Husu kona-ba item ida no koko hatene detalle ho ema ne’ebé fa’an.',
    empty: 'Seidauk iha produtu. Favór fila fali iha tempu badak.',
    allTypes: 'Item hotu',
    types: 'Tipu',
    sold: 'Fa’an husi {name}',
    platform: 'Alfaiate TL',
    price: 'Folin',
    priceNote: 'Folin define husi ema ne’ebé fa’an',
    noPrice: 'Husu folin',
    unavailable: 'La disponivel agora',
    ask: 'Husu kona-ba item ne’e',
    askMessage: 'Olá, haʼu hakarak husu kona-ba: {name}',
    back: 'Fila ba loja',
    notice: 'Alfaiate TL lista item ne’e. Folin, entrega no fila fali item hatene diretamente ho ema ne’ebé fa’an. La iha pagamentu ka enkomenda iha sítiu ne’e.',
    photoOf: 'Foto husi {name}',
    listTitle: 'Ita-nia lista loja',
    listAdd: 'Tau iha ha’u-nia lista loja',
    listRemove: 'Hasai',
    listRemoveNamed: 'Hasai {name} husi ha’u-nia lista loja',
    listSend: 'Haruka pedidu',
    listFull: 'Ita-nia lista loja la’ós iha fatin (item 3). Hasai ida ka haruka ita-nia pedidu.',
    listNote: 'La iha buat ida haruka to’o ita hakerek no haruka formuláriu.',
```

- `nav.shop` Loja
- `request.fromProducts` (the notice on the request form when shop items are named)
