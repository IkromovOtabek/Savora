// Ochilish uchun 9 post — content-plan.md §3 asosida. To'r: 1 Tun, 2 Ko'k, 3 Tun / 4 Ko'k, 5 Tun, 6 Ko'k / 7 Tun, 8 Ko'k, 9 Tun.
// Joylash: 9 → 4, keyin 3, 2, 1; so'ng 3, 2, 1 ni mahkamlash. Caption va heshteglar: content-plan.md.
// **so'z** — urg'u, ##so'z## — oltin (faqat pul). Demo ekranlardagi ism va summalar — to'qima, «Demo ma'lumot» bilan.
// Faktlar manbasi: content-plan.md §8 (har biri kod/landing bilan tekshirilgan).

const CTA = (title, sub, note) => ({ title, sub, blocks: [{ type: 'cta', note }], align: 'center' });

export const POSTS = [
  {
    n: 1, slug: 'bitta-ilova', type: 'reels', theme: 'tun', eyebrow: 'Savora',
    slides: [{
      title: 'Nasiya, ombor, kassa —\n**bitta ilovada**', titleSize: 76,
      sub: "Daftar va Excel o'rniga — do'koningizning to'liq hisobi bitta tizimda", subSize: 32,
      blocks: [{ type: 'phone', shop: 'Mobi Market', sum: '21 840 000', tags: [{ t: 'Nasiya', gold: true }, { t: 'Ombor' }, { t: 'Kassa' }], rows: [
        { l: 'Aziz K.', sub: 'iPhone 15 · nasiya 6 oy', v: '11 200 000' },
        { l: 'Laylo S.', sub: 'Redmi 13C · nasiya 3 oy', v: '1 920 000' },
        { l: 'Jasur E.', sub: 'Zaryadka ×2 · naqd', v: '378 000' },
      ] }],
      gap: 34,
    }],
  },
  {
    n: 2, slug: 'nasiya-4-qadam', type: 'carousel', theme: 'kok', eyebrow: 'Nasiya',
    slides: [
      { title: 'Nasiya:\nsotuvdan undirishgacha\n**4 qadam**', titleSize: 76, sub: "Daftarsiz va qo'lda hisobsiz: har nasiya jadvalda, har to'lov nazoratda",
        blocks: [{ type: 'spacer', h: 20 }, { type: 'timeline', items: ['Tovar', 'Jadval', 'Mijoz', "To'lov"] }] },
      { pre: [{ type: 'num', value: '01' }], title: 'Tovarni tanlang', sub: "Skaner yoki qidiruv bilan savatga qo'shing — miqdor va chegirma bilan.",
        blocks: [{ type: 'card', title: 'Savat', right: '2 ta tovar', rows: [
          { l: 'Redmi 13C', sub: '128 GB · ×1', v: "2 400 000" },
          { l: "G'ilof", sub: '×1', v: '90 000' },
          { l: 'Chegirma', v: '−40 000' },
        ], total: { l: 'Jami', v: "2 450 000 so'm" } }] },
      { pre: [{ type: 'num', value: '02' }], title: 'Jadval tayyor', sub: "Boshlang'ich to'lov va muddatni tanlang — oylik to'lov va sanalar darhol hisoblanadi.",
        blocks: [{ type: 'card', title: "Nasiya · 3 oy", right: "Boshlang'ich 500 000", rows: [
          { l: '12-dekabr', v: '650 000', s: 'wait' },
          { l: '12-yanvar', v: '650 000', s: 'wait' },
          { l: '12-fevral', v: '650 000', s: 'wait' },
        ] }] },
      { pre: [{ type: 'num', value: '03' }], title: 'Mijoz kartasi', sub: "Jadval va har bir to'lov bitta joyda — kim qancha qarz, qachon to'laydi.",
        blocks: [{ type: 'card', title: 'Umid X.', right: 'Redmi 13C', rows: [
          { l: '12-sentabr', v: '850 000', s: 'ok' },
          { l: '12-oktabr', v: '850 000', s: 'ok' },
          { l: '12-noyabr', v: '850 000', s: 'late' },
        ], total: { l: 'Qoldiq', v: "2 550 000 so'm" } }] },
      { pre: [{ type: 'num', value: '04' }], title: 'Nazorat', sub: "Qisman va muddatidan oldin to'lov qabul qilinadi. Qarzlar uch guruhda:",
        blocks: [{ type: 'card', title: 'Qarzdorlik', rows: [
          { l: "Muddati o'tgan", v: '', s: 'late', st: 'Kechikkan' },
          { l: 'Yaqin (7 kun)', v: '', s: 'due', st: 'Yaqin' },
          { l: 'Muddatida', v: '', s: 'ok', st: 'Muddatida' },
        ] }] },
      { title: "Kechikkanlar —\n**har kuni Telegram'da**", titleSize: 76, sub: 'Mijozga eslatma — bir tugmada: WhatsApp, Telegram yoki SMS.',
        blocks: [{ type: 'tg', lines: ["⏰ Nasiya to'lov muddati o'tdi", 'Mahsulot: Redmi 13C', 'Mijoz: Umid X.', "Muddati o'tgan: 1 oy — ##850 000 so'm##"] }] },
      CTA('14 kun bepul —\n**nasiya moduli bilan**', 'Karta talab qilinmaydi. Sinov tugagach hech narsa avtomatik yechilmaydi.'),
    ],
  },
  {
    n: 3, slug: '14-kun-bepul', type: 'image', theme: 'tun', eyebrow: 'Taklif',
    slides: [{
      pre: [{ type: 'big', value: '14', size: 360 }],
      title: "kun bepul\nsinab ko'ring", titleSize: 92,
      sub: 'Karta talab qilinmaydi. Sinov tugagach hech narsa avtomatik yechilmaydi.',
      blocks: [{ type: 'chips', items: [{ icon: 'calendar', text: '14 kun' }, { icon: 'tariflar', text: 'Kartasiz' }, { icon: 'shield', text: "Ma'lumot saqlanadi" }] }],
      cta: 'Biodagi havola', gap: 30,
    }],
  },
  {
    n: 4, slug: 'daftar-vs-savora', type: 'carousel', theme: 'kok', eyebrow: 'Nasiya',
    slides: [
      { title: "Daftar yo'qolsa,\nqarz ham yo'qoladi", titleSize: 80, sub: 'Daftar, Excel va Savora: olti farq bitta jadvalda',
        blocks: [{ type: 'daftar', lines: ['Aziz — 1 200 000', 'Dilshod 850 ming ?', 'Malika — 2 oy', 'Sardor 400', '...'],
          card: { title: 'Umid X.', right: 'Redmi 13C', rows: [{ l: '12-oktabr', v: '850 000', s: 'ok' }, { l: '12-noyabr', v: '850 000', s: 'ok' }, { l: '12-dekabr', v: '850 000', s: 'wait' }] } }] },
      { title: 'Tanish holatmi?', blocks: [{ type: 'bullets', items: [
        { icon: 'x', text: "Kim, qachon, qancha to'lashi esdan chiqadi" },
        { icon: 'x', text: 'Kechikish faqat oy oxirida bilinadi' },
        { icon: 'x', text: "Daftar yo'qolsa — qarz ham yo'qoladi" },
      ] }] },
      { title: 'Daftar va Savora: 1–3', titleSize: 64, blocks: [{ type: 'table', rows: ['Nasiya jadvali va hisob-kitob avtomatik', "Kechikkan to'lovlar har kuni Telegram'da", 'IMEI va ombor nazorati'] }] },
      { title: 'Daftar va Savora: 4–6', titleSize: 64, blocks: [{ type: 'table', rows: ['Bir nechta filial bitta ekranda', 'Xodimlarga alohida huquqlar', 'Telefondan istalgan joyda'] }] },
      { title: "Eski yozuvlarni\nko'chirishda yordam", titleSize: 76, sub: "Excel yoki daftardagi tovar va qarz ro'yxatini ko'chirishda jamoamiz bepul yordam beradi.",
        blocks: [{ type: 'chips', items: [{ icon: 'excel', text: '.xlsx va .csv' }, { icon: 'chart', text: '5000 qatorgacha' }, { icon: 'users', text: 'Bepul yordam' }] }] },
      CTA("Daftarni\n**Savora'ga almashtiring**", '14 kun bepul. Karta talab qilinmaydi.'),
    ],
  },
  {
    n: 5, slug: 'telegram-eslatma', type: 'image', theme: 'tun', eyebrow: 'Nasiya',
    slides: [{
      title: "Kim kechikdi —\n**har kuni Telegram'da**", titleSize: 80,
      sub: "Muddati o'tgan nasiyalar egaga keladi; mijozga eslatma — bir tugmada.", subSize: 32,
      blocks: [{ type: 'tg', lines: ["⏰ Nasiya to'lov muddati o'tdi", 'Mahsulot: Redmi 13C', 'Mijoz: Umid X.', "Muddati o'tgan: 1 oy — ##850 000 so'm##", 'Eng erta muddat: 12.11.2026', "Umumiy qoldiq: ##2 550 000 so'm##"] }],
      gap: 34,
    }],
  },
  {
    n: 6, slug: 'nasiya-2-daqiqa', type: 'reels', theme: 'kok', eyebrow: 'Nasiya',
    slides: [{
      title: 'Nasiya 2 daqiqada\nrasmiylashadi', titleSize: 80,
      sub: "Tovar, boshlang'ich to'lov, muddat — oylik jadval va sanalar darhol tayyor", subSize: 32,
      blocks: [{ type: 'timer', value: '2:00' }],
      gap: 30,
    }],
  },
  {
    n: 7, slug: 'komissiya-emas-foyda', type: 'carousel', theme: 'tun', eyebrow: 'Misol',
    slides: [
      { title: 'Komissiya emas,\n**foyda sizda qolsin**', titleSize: 80, sub: "10 mln so'mlik telefon, 12 oyga — uch yo'l taqqoslandi", subSize: 32,
        blocks: [{ type: 'cards3', items: [
          { t: 'Daftar / Excel', v: "0 so'm", d: 'dastur xarajati' },
          { t: 'Hamkor BNPL', v: "−3 mln so'm", d: '≈30% komissiya, 12 oy' },
          { t: "O'z nasiyangiz + Savora", v: "649 000 so'm", d: "oyiga, savdodan foiz yo'q", hl: true, gold: true },
        ] }],
        note: "Misol. BNPL komissiyasi taxminiy, ochiq manbalardagi do'kon tariflari asosida.", gap: 34 },
      { title: "1-yo'l:\n**Daftar yoki Excel**", pre: [{ type: 'big', value: "0 so'm", size: 150 }], blocks: [{ type: 'bullets', items: [
        { icon: 'check', text: 'Dastur uchun pul sarflanmaydi' },
        { icon: 'x', text: "To'lov kunlari esdan chiqadi" },
        { icon: 'x', text: 'Kechikish kech bilinadi' },
        { icon: 'x', text: "Daftar yo'qolsa, qarz ham yo'qoladi" },
      ] }] },
      { title: "2-yo'l:\n**Hamkor BNPL**", pre: [{ type: 'big', value: '≈3 mln', size: 150 }], blocks: [{ type: 'bullets', items: [
        { icon: 'check', text: 'Pul darhol tushadi, xavf hamkorda' },
        { icon: 'x', text: "Komissiya ≈30% — 12 oyga ≈3 000 000 so'm" },
        { icon: 'x', text: 'Mijoz hamkorning mijoziga aylanadi' },
      ] }] },
      { title: "3-yo'l:\n**O'z nasiyangiz + Savora**", titleSize: 68, pre: [{ type: 'big', value: '649 000', size: 150, gold: true }], blocks: [{ type: 'bullets', items: [
        { icon: 'check', text: "Oyiga (Pro), savdodan foiz yo'q" },
        { icon: 'check', text: 'Narx va ustama sizniki — 2027 chegaralari ichida' },
        { icon: 'check', text: "Jadval, kechikkanlar ro'yxati, eslatma" },
      ] }] },
      { pre: [{ type: 'chips', items: [{ icon: 'shield', text: 'Halol eslatma' }] }], title: "Kechikish xavfi\ndo'konda qoladi", titleSize: 80,
        sub: "O'z nasiyangizda kechikish xavfi va aylanma mablag' do'konda qoladi. Savora aynan shuni nazorat qilishga yordam beradi: jadval, kechikkanlar ro'yxati, eslatma." },
      CTA('Hisobni o\'zingiz\n**tekshirib ko\'ring**', '14 kun bepul — nasiya moduli bilan. Karta talab qilinmaydi.'),
    ],
  },
  {
    n: 8, slug: 'nasiya-2027-qoidalar', type: 'carousel', theme: 'kok', eyebrow: 'Bilim',
    slides: [
      { title: '2027-yildan nasiyada\nyangi qoidalar', titleSize: 76, sub: "PQ-294 qarori: muddat, summa va ustama chegaralari — oddiy tilda", subSize: 32,
        blocks: [{ type: 'pq', items: [{ v: '12 oy', l: 'eng uzun muddat' }, { v: '250 BHM', l: 'bitta xarid' }, { v: '50%', l: 'yillik chegara' }, { v: "0 so'm", l: 'oldin yopish jarimasi', gold: true }] }] },
      { pre: [{ type: 'big', value: '12 oy', size: 200 }], title: 'Eng uzun muddat', sub: '1-yanvar 2027 dan nasiya muddati 12 oydan oshmasligi kerak.' },
      { pre: [{ type: 'big', value: '250 BHM', size: 170 }], title: 'Bitta xarid chegarasi', sub: "Taxminan 110 mln so'm. Undan katta xarid nasiyaga berilmaydi." },
      { pre: [{ type: 'big', value: '50%', size: 220 }], title: 'Yillik chegara', sub: "Ustama, komissiya va penya — hammasi birga yiliga 50% dan oshmasligi kerak." },
      { pre: [{ type: 'big', value: "0 so'm", size: 200, gold: true }], title: 'Oldin yopish jarimasi', sub: "Mijoz nasiyani muddatidan oldin yopsa — jarima olinmaydi." },
      { pre: [{ type: 'big', value: '500 mln', size: 170 }], title: 'Reyestr talabi\nbo\'lishi mumkin', titleSize: 72,
        sub: "Choraklik aylanmasi 500 mln so'mdan oshgan va savdosining yarmi yoki ko'prog'i nasiya bo'lgan do'konlar Markaziy bank reyestriga kirishi kerak bo'lishi mumkin.", subSize: 30 },
      { title: "Savora'da hozir bor", blocks: [{ type: 'bullets', items: [
        { icon: 'nasiya', text: "Har nasiya jadvali, to'lovi va qoldig'i bitta joyda" },
        { icon: 'bell', text: "Kechikkan to'lovlar har kuni Telegram'da" },
        { icon: 'shield', text: 'Har xodim amali jurnalda: kim sotdi, kim bekor qildi' },
      ] }] },
      CTA('Qoidalarga\n**tayyor bo\'ling**', "Manba: PQ-294, 14.08.2026 (lex.uz); gazeta.uz, 17.08.2026.", "Bu yuridik maslahat emas — aniq holatingizni buxgalter yoki yurist bilan tekshiring."),
    ],
  },
  {
    n: 9, slug: 'ombor-filiallar', type: 'carousel', theme: 'tun', eyebrow: 'Ombor',
    slides: [
      { title: 'Ombor va filiallar —\n**bitta ekranda**', titleSize: 76, sub: "Kirim, qoldiq, IMEI, inventarizatsiya va xodim huquqlari — hammasi nazoratda", subSize: 32,
        blocks: [{ type: 'card', title: 'Ombor', right: '1 248 mahsulot', rows: [
          { l: 'iPhone 15', sub: '128 GB', v: '11 200 000', s: 'in' },
          { l: 'Redmi 13C', sub: '128 GB', v: '1 920 000', s: 'sold' },
          { l: 'Artel muzlatgich', sub: 'HD 345', v: '6 800 000', s: 'move' },
        ] }] },
      { title: 'Kirim va **qoldiq**', blocks: [{ type: 'bullets', items: [
        { icon: 'ombor', text: 'Tovar kirimi va qoldiq hisobi' },
        { icon: 'chart', text: 'Kam qolgan tovarlar hisoboti' },
        { icon: 'filial', text: "Har filial qoldig'i alohida" },
      ] }] },
      { title: 'IMEI va **qora ro\'yxat**', blocks: [{ type: 'bullets', items: [
        { icon: 'ilova', text: "Telefonlar IMEI bo'yicha hisobda" },
        { icon: 'shield', text: "Umumiy qora ro'yxat bilan tekshiruv" },
        { icon: 'kassa', text: 'Skaner yoki kamera bilan tez kiritish' },
      ] }] },
      { title: "Filiallar **o'rtasida**", blocks: [{ type: 'bullets', items: [
        { icon: 'filial', text: "Filiallar o'rtasida tovar berish" },
        { icon: 'nasiya', text: 'Har filial kassasi alohida' },
        { icon: 'chart', text: 'Umumiy hisobot bitta ekranda' },
      ] }] },
      { title: 'Inventarizatsiya\nva **eksport**', blocks: [{ type: 'bullets', items: [
        { icon: 'check', text: "Inventarizatsiya — ombordagi haqiqiy sonni tekshirish" },
        { icon: 'excel', text: "CSV eksport — ma'lumot sizniki" },
      ] }] },
      { title: 'Xodim **huquqlari**', sub: 'Kim nima qila olishini o\'zingiz belgilaysiz. Har amal jurnalda: kim sotdi, kim chegirma berdi, kim bekor qildi.',
        blocks: [{ type: 'chips', items: [{ text: 'Sotish' }, { text: 'Chegirma' }, { text: 'Bekor qilish' }, { text: 'Kelish narxi' }, { text: 'Hisobot' }] }] },
      { title: "Excel'dan **import**", blocks: [{ type: 'bullets', items: [
        { icon: 'excel', text: '.xlsx yoki .csv fayl' },
        { icon: 'chart', text: 'Bir martada 5000 tagacha qator' },
        { icon: 'check', text: 'Ustunlar nomidan o\'zi taniladi' },
      ] }] },
      CTA("Omboringizni\n**tartibga keltiring**", '14 kun bepul. Karta talab qilinmaydi.', "Filiallar: Boshlang'ich — 1, Pro — 5, Biznes — cheksiz."),
    ],
  },
];
