# Shriftlar (app/fonts.ts orqali ulanadi)

Build tashqi tarmoqqa bog'liq bo'lmasligi uchun shriftlar repoda turadi (`next/font/local`).
Fayllar Google Fonts'ning variable subset'lari (2026-11-12 da olingan), `unicode-range`'lari `app/fonts.ts` da.

| Fayl | Shrift | Subset | Og'irlik |
|---|---|---|---|
| `plus-jakarta-sans-latin.woff2` | Plus Jakarta Sans | latin | 400–800 |
| `plus-jakarta-sans-latin-ext.woff2` | Plus Jakarta Sans | latin-ext | 400–800 |
| `onest-cyrillic.woff2` | Onest | cyrillic | 100–900 |
| `onest-latin.woff2` | Onest | latin | 100–900 |

Manba: https://fonts.google.com/specimen/Plus+Jakarta+Sans, https://fonts.google.com/specimen/Onest

Litsenziya: ikkala shrift ham SIL Open Font License 1.1 (https://openfontlicense.org) — veb-saytda
ishlatish va qayta tarqatishga ruxsat beradi; mualliflik huquqi tegishli loyiha mualliflariga tegishli.

Yangilash: Google Fonts CSS'ini (`css2?family=...`) Chrome User-Agent bilan oling, kerakli subset'ning
`.woff2` faylini shu nom bilan almashtiring va `unicode-range` o'zgargan bo'lsa `app/fonts.ts` ni yangilang.
