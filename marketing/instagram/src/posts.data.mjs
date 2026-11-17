// Profil to'ri: p01 — yuqori chap ... p09 — pastki o'ng. Joylash tartibi teskari: avval p09, oxirida p01.
// p01–p03 mahkamlanadi (pin). Faktlar: web/lib/i18n/dict/landing.ts. **so'z** — urg'u rangi.
export const POSTS = [
  {
    id: 'p01', theme: 'tun', eyebrow: 'Savora nima?',
    title: 'Nasiya, ombor, kassa\n**bitta ilovada**',
    sub: "Do'koningizni daftar va Excel'siz boshqaring.",
    blocks: [{ type: 'chips', items: [
      { icon: 'nasiya', text: 'Nasiya' }, { icon: 'ombor', text: 'Ombor' }, { icon: 'kassa', text: 'Kassa' },
      { icon: 'chart', text: 'Qarz nazorati' }, { icon: 'filial', text: "Ko'p filial" }, { icon: 'ai', text: 'AI yordamchi' },
    ] }],
  },
  {
    id: 'p02', theme: 'kok', eyebrow: 'Nasiya oqimi', titleSize: 80,
    title: "Sotuvdan undirishgacha\n**4 qadam**",
    blocks: [{ type: 'steps', items: [
      { title: 'Tovarni tanlang', text: "Skaner yoki qidiruv bilan savatga qo'shing" },
      { title: 'Jadval tayyor', text: 'Oylik to\'lov va sanalar darhol hisoblanadi' },
      { title: 'Mijoz kartasi', text: 'Kim qancha qarz — bir qarashda' },
      { title: "Pul o'z vaqtida", text: "Kechikkanlar har kuni Telegram'da" },
    ] }],
  },
  {
    id: 'p03', theme: 'oq', eyebrow: 'Bepul sinov',
    blocks: [
      { type: 'big', value: '14 kun', gold: true, label: "bepul sinab ko'ring.\n**Karta talab qilinmaydi.**" },
      { type: 'bullets', items: [
        { icon: 'excel', text: "Excel'dagi ma'lumotlarni ko'chirish mumkin" },
        { icon: 'ilova', text: 'Telefon, planshet va kompyuterda' },
      ] },
    ],
    cta: 'Biodagi havola',
  },
  {
    id: 'p04', theme: 'oq', eyebrow: 'Nasiya jadvali', titleSize: 80,
    title: "Har bir to'lov\n**nazoratda**",
    blocks: [{ type: 'schedule', title: 'Telefon · 12 oy', rows: [
      { m: 'Sentabr', sum: "850 000 so'm", s: 'ok' },
      { m: 'Oktabr', sum: "850 000 so'm", s: 'ok' },
      { m: 'Noyabr', sum: "850 000 so'm", s: 'due' },
      { m: 'Dekabr', sum: "850 000 so'm", s: 'wait' },
    ] }],
    note: "Misol uchun ko'rsatilgan raqamlar.",
  },
  {
    id: 'p05', theme: 'tun', eyebrow: "Nega o'tish kerak", titleSize: 80,
    title: "Daftar va Excel'dan\n**farqi**",
    blocks: [{ type: 'compare',
      left: { title: 'Daftar', items: ['Jadvalni qo\'lda hisoblaysiz', 'Kechikish oy oxirida bilinadi', "Daftar yo'qolsa — qarz ham"] },
      right: { title: 'Savora', items: ['Jadval avtomatik', "Kechikkanlar har kuni Telegram'da", 'Hammasi bulutda saqlanadi'] },
    }],
  },
  {
    id: 'p06', theme: 'kok', eyebrow: 'Eslatma',
    title: "Kechikkan to'lovlar\n**har kuni Telegram'da**",
    blocks: [{ type: 'bullets', items: [
      { icon: 'bell', text: 'Ertalab — kim, qancha, necha kun kechikdi' },
      { icon: 'aloqa', text: 'Mijozga muloyim eslatma — bir tugmada' },
      { icon: 'chart', text: 'Undirish hisoboti bir joyda' },
    ] }],
  },
  {
    id: 'p07', theme: 'kok', eyebrow: 'AI yordamchi',
    title: "Raqamlarni so'rang —\n**javob oling**",
    blocks: [{ type: 'bullets', items: [
      { icon: 'ai', text: '«Bu oy qancha nasiya sotdik?»' },
      { icon: 'ai', text: '«Kim eng ko\'p kechiktiryapti?»' },
      { icon: 'ai', text: '«Qaysi tovar tugayapti?»' },
    ] }],
    note: "Har kim faqat o'z huquqi doirasidagi ma'lumotni ko'radi.",
  },
  {
    id: 'p08', theme: 'oq', eyebrow: "Ko'p filial",
    title: 'Hamma filial\n**bitta ekranda**',
    blocks: [{ type: 'bullets', items: [
      { icon: 'filial', text: "Har filial qoldig'i va savdosi alohida" },
      { icon: 'users', text: 'Xodimlarga alohida huquqlar' },
      { icon: 'shield', text: 'Har amal jurnalda: kim sotdi, kim bekor qildi' },
    ] }],
  },
  {
    id: 'p09', theme: 'tun', eyebrow: 'Mobil ilova',
    title: "Do'kon\n**cho'ntagingizda**",
    sub: 'Savdo, qarz va qoldiqni istalgan joydan kuzating.',
    blocks: [{ type: 'chips', items: [
      { icon: 'ilova', text: 'Android' }, { icon: 'ilova', text: 'iPhone (beta)' }, { icon: 'filial', text: 'Kompyuter' },
    ] }],
    cta: 'Yuklab olish',
  },
];
