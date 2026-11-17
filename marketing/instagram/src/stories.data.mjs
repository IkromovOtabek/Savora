// Highlight story kadrlari. Faktlar: web/lib/i18n/dict/landing.ts, savora.uz tariflar bo'limi (2026-11-18).
export const STORIES = [
  {
    id: '01-nasiya', icon: 'nasiya', eyebrow: 'Nasiya',
    title: 'Har bir nasiya\n**jadvalda**',
    rows: [
      { t: "Oylik to'lov va sanalar avtomatik" },
      { t: 'Kim qancha qarz — mijoz kartasida' },
      { t: "Kechikkanlar har kuni Telegram'da" },
    ],
  },
  {
    id: '02-ombor', icon: 'ombor', eyebrow: 'Ombor',
    title: 'Qoldiq har doim\n**aniq**',
    rows: [
      { t: 'Tovar qabul qilish va inventar' },
      { t: 'IMEI va shtrix-kod nazorati' },
      { t: "Har filial qoldig'i alohida" },
    ],
  },
  {
    id: '03-kassa', icon: 'kassa', eyebrow: 'Kassa',
    title: 'Tez sotuv,\n**toza hisob**',
    rows: [
      { t: 'Skaner yoki qidiruv bilan savat' },
      { t: 'Naqd, nasiya yoki bank krediti' },
      { t: 'Kunlik tushum bir qarashda' },
    ],
  },
  {
    id: '04-ilova', icon: 'ilova', eyebrow: 'Ilova',
    title: "Do'kon\n**cho'ntagingizda**",
    rows: [
      { t: 'Android ilova', v: 'Bor' },
      { t: 'iPhone (TestFlight)', v: 'Beta' },
      { t: 'Kompyuter va planshet', v: 'Bor' },
    ],
    cta: 'savora.uz/download',
  },
  {
    id: '05-tariflar', icon: 'tariflar', eyebrow: 'Tariflar',
    title: 'Har bir tarif\n**14 kun bepul**',
    rows: [
      { t: "Boshlang'ich · 1 filial", v: "249 000 so'm/oy" },
      { t: 'Pro · 5 filial', v: "649 000 so'm/oy", hl: true },
      { t: 'Biznes · cheksiz', v: "1 290 000 so'm/oy" },
    ],
    cta: 'Karta shart emas',
  },
  {
    id: '06-aloqa', icon: 'aloqa', eyebrow: 'Aloqa',
    title: 'Savolingiz bormi?\n**Yozing**',
    rows: [
      { t: 'Telefon', v: '+998 99 829 60 02' },
      { t: 'Sayt', v: 'savora.uz' },
      { t: "Direct'ga yozing — javob beramiz" },
    ],
    cta: 'Bepul demo',
  },
];
