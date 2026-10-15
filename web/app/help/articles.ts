/**
 * Yordam markazi maqolalari — oddiy ma'lumot (klientda qidiruv uchun matn ko'rinishida).
 * Yangi maqola qo'shish: tegishli guruhga obyekt qo'shing. `id` — URL anchor (#id).
 */

export const HELP_GROUPS = [
  'Boshlash',
  'Sotuv',
  'Nasiya',
  'Ombor',
  'Moliya',
  'AI yordamchi va topshiriqlar',
  'Mobil ilova',
  'Xavfsizlik',
  'Tariflar va to\'lov',
] as const;

export type HelpGroup = (typeof HELP_GROUPS)[number];

export interface HelpArticle {
  id: string;
  group: HelpGroup;
  title: string;
  summary: string;
  steps?: string[];
  paras?: string[];
  table?: { head: string[]; rows: string[][] };
  tip?: string;
  /** Qidiruv uchun qo'shimcha so'zlar (sinonimlar, ruscha atamalar lotinda) */
  keywords?: string;
}

export function helpArticles(trialDays: number): HelpArticle[] {
  return [
    // ── Boshlash ─────────────────────────────────────────────
    {
      id: 'royxatdan-otish',
      group: 'Boshlash',
      title: 'Ro\'yxatdan o\'tish',
      summary: `Do'kon kabinetini 2 daqiqada oching — ${trialDays} kun bepul, karta kerak emas.`,
      steps: [
        'savora.uz saytida «Bepul boshlash» tugmasini bosing.',
        'Do\'kon nomi, ismingiz, telefon raqamingiz va biznes turini kiriting.',
        'Login va parol o\'ylab toping — parol kamida 8 belgi bo\'lsin.',
        'Do\'kon manzili (slug) avtomatik taklif qilinadi, xohlasangiz o\'zgartiring.',
        '«Ro\'yxatdan o\'tish» — kabinet darhol ochiladi va sinov muddati boshlanadi.',
      ],
      tip: 'Login va parolni xavfsiz joyga yozib qo\'ying. Parolni unutsangiz, Telegram bog\'langan bo\'lsa «Parolni tiklash» orqali yangilaysiz.',
      keywords: 'registratsiya akkaunt ochish kabinet login parol slug',
    },
    {
      id: 'biznes-turi',
      group: 'Boshlash',
      title: 'Biznes turini tanlash',
      summary: '13 ta yo\'nalish: menyu, atamalar va modullar sohangizga moslashadi.',
      paras: [
        'Biznes turi qaysi bo\'limlar ochiq bo\'lishini va ular qanday nomlanishini belgilaydi. Masalan, telefon do\'konida «IMEI» va «Nasiya», oziq-ovqat do\'konida «Qarz daftari», restoranda «Menyu» ko\'rinadi.',
        'Tarifingiz ruxsat bergan modullar ichidan faqat sohangizga keraklilari yoqiladi — menyu ortiqcha bo\'limlarsiz, sodda bo\'ladi.',
      ],
      steps: [
        'Ro\'yxatdan o\'tishda ro\'yxatdan sohangizni tanlang.',
        'Keyin o\'zgartirish kerak bo\'lsa — yordam xizmatiga yozing, modullar yangi turga moslab qayta sozlanadi. Ma\'lumotlaringiz o\'chmaydi.',
      ],
      keywords: 'soha yo\'nalish telefon mebel kiyim dorixona restoran modul preset',
    },
    {
      id: 'filial',
      group: 'Boshlash',
      title: 'Filial qo\'shish',
      summary: 'Har bir do\'kon nuqtasi — alohida filial: o\'z ombori, kassasi va hisoboti.',
      steps: [
        'Menyudan «Filiallar» bo\'limini oching.',
        '«Filial qo\'shish» — nomi va manzilini kiriting.',
        'Kerak bo\'lsa filial uchun alohida login yarating (keyingi maqola).',
      ],
      tip: 'Filiallar soni tarifga bog\'liq. Limitga yetsangiz, tizim ogohlantiradi va tarifni oshirishni taklif qiladi.',
      keywords: 'branch nuqta do\'kon qo\'shish',
    },
    {
      id: 'xodim',
      group: 'Boshlash',
      title: 'Xodim qo\'shish va huquqlar',
      summary: 'Har bir xodimga alohida login — kim nima qilishini o\'zingiz belgilaysiz.',
      steps: [
        '«Filiallar» bo\'limida filialni tanlab, «Login qo\'shish» ni bosing.',
        'Xodim ismi, login va vaqtinchalik parolni kiriting.',
        'Huquqlarni belgilang: sotish, chegirma berish, sotuvni bekor qilish, kelish narxini ko\'rish, kassa, hisobot va boshqalar.',
        'Login va parolni xodimga bering — u faqat o\'z filialini ko\'radi.',
      ],
      tip: 'Har bir xodim o\'z logini bilan ishlasa, «Amallar» jurnalida kim nima qilgani aniq ko\'rinadi. Xodim ishdan ketsa — loginini darhol o\'chiring.',
      keywords: 'sotuvchi kassir user rol ruxsat permission parol',
    },

    // ── Sotuv ────────────────────────────────────────────────
    {
      id: 'pos',
      group: 'Sotuv',
      title: 'Sotuv qilish (kassa)',
      summary: 'Skaner yoki qidiruv bilan savatga qo\'shing, to\'lov turini tanlang.',
      steps: [
        '«Sotuvlar» → «Yangi sotuv» yoki bosh sahifadagi «Sotish» tugmasi.',
        'Tovarni shtrix-kod/IMEI skaneri, kamera yoki nom bo\'yicha qidiruv bilan qo\'shing.',
        'Miqdor va chegirmani kiriting (chegirma huquqi bo\'lsa).',
        'To\'lov turini tanlang: naqd, karta, nasiya (bo\'lib to\'lash) yoki bank krediti.',
        'Mijozni tanlang yoki yangisini telefon raqami bilan qo\'shing — nasiyada majburiy.',
        '«Sotish» — qoldiq avtomatik kamayadi, kassaga tushum yoziladi.',
      ],
      keywords: 'pos savat kassa skaner shtrix barcode sotish tez sotuv',
    },
    {
      id: 'chek',
      group: 'Sotuv',
      title: 'Chek chop etish',
      summary: 'Har sotuv uchun chek: printerdan chop eting yoki mijozga yuboring.',
      steps: [
        'Sotuv saqlangach, sotuv sahifasida «Chek» tugmasini bosing.',
        '«Chop etish» — brauzer orqali ulangan printerga (58/80 mm termoprinter ham) chiqadi.',
        'Chekni rasm yoki havola ko\'rinishida mijozga Telegram orqali yuborishingiz mumkin.',
      ],
      tip: 'Savora cheki — ichki hujjat. Qonun talab qiladigan fiskal chekni onlayn-NKM yoki virtual kassa orqali bering.',
      keywords: 'chek kvitansiya printer print fiskal',
    },
    {
      id: 'qaytarish',
      group: 'Sotuv',
      title: 'Qaytarish va sotuvni bekor qilish',
      summary: 'Xato sotuv yoki qaytarilgan tovar — tovar omborga qaytadi, hisob tuzatiladi.',
      steps: [
        '«Sotuvlar» ro\'yxatidan kerakli sotuvni oching.',
        '«Sotuvni bekor qilish» tugmasini bosing va tasdiqlang.',
        'Tovar omborga qaytadi, kassa va qarz hisobi avtomatik tuzatiladi.',
      ],
      tip: 'Bekor qilish huquqini faqat ishonchli xodimlarga bering. Har bir bekor qilish «Amallar» jurnaliga yoziladi. Iste\'molchiga pulni qaytarish tartibi «Iste\'molchilar huquqlarini himoya qilish to\'g\'risida»gi qonunga mos bo\'lishi kerak.',
      keywords: 'vozvrat qaytarish bekor otmena refund',
    },

    // ── Nasiya ───────────────────────────────────────────────
    {
      id: 'nasiya-jadval',
      group: 'Nasiya',
      title: 'Nasiya (bo\'lib to\'lash) jadvali',
      summary: 'Boshlang\'ich to\'lov va oylar soni — oylik summa va sanalar o\'zi hisoblanadi.',
      steps: [
        'Sotuvda to\'lov turini «Nasiya» qiling.',
        'Mijozni tanlang (F.I.Sh., telefon).',
        'Boshlang\'ich to\'lov va muddatni (oylar) kiriting — oylik to\'lov va sanalar darhol ko\'rinadi.',
        'Saqlang. Jadval «Nasiya» bo\'limida: har oy «To\'landi», «Qisman», «Kutilmoqda» yoki «Muddati o\'tgan».',
        'Mijoz to\'lov qilganda sotuv sahifasida «To\'lov qo\'shish» — summa eng eski oydan boshlab yopiladi.',
      ],
      keywords: 'rassrochka bo\'lib to\'lash grafik jadval oylik muddat',
    },
    {
      id: 'ustama',
      group: 'Nasiya',
      title: 'Ustama (nasiya narxi)',
      summary: 'Nasiya narxini oldindan hisoblang va xaridorga ochiq ko\'rsating.',
      paras: [
        'Nasiyadagi qo\'shimcha summa (ustama) sotuv narxiga kiritiladi: masalan, naqd narx 10 000 000, 6 oyga nasiya narxi 11 500 000 so\'m.',
        'Xaridorga har doim naqd narx, ustama summasi va jami summani alohida ayting. 2027-yildan bu majburiy talab (pastdagi maqola).',
      ],
      tip: 'Ustama, komissiya va penya birgalikda yiliga 50% dan oshmasin — 2027-yildan bu qonuniy chegara.',
      keywords: 'ustama foiz natsenka nasiya narxi markup',
    },
    {
      id: 'eslatma',
      group: 'Nasiya',
      title: 'To\'lov eslatmalari',
      summary: 'Muddati kelgan va kechikkan to\'lovlar haqida Telegram xabari; mijozga bir tugmada eslatma.',
      steps: [
        '«Kabinet» → «Telegram» bo\'limida do\'kon egasi hisobini botga bog\'lang.',
        'Har kuni ertalab muddati kelgan va kechikkan to\'lovlar ro\'yxati Telegram\'ga keladi.',
        'Mijozga eslatish: «Qarzdorlik» yoki nasiya kartasida «Eslatma» tugmasi — tayyor matn Telegram yoki SMS ilovasida ochiladi.',
        'Qarz daftarida (Daftar) qarzdorga SMS eslatma avtomatik yuboriladi (SMS ulangan bo\'lsa).',
      ],
      tip: 'Eslatmalarni kunduzi (09:00–20:00) yuboring, muloyim ohangda. Qarzni boshqalarga oshkor qilish va tahdid qilish qonunga zid.',
      keywords: 'sms telegram napominanie eslatma qarzdor kechikish',
    },
    {
      id: 'pq-294',
      group: 'Nasiya',
      title: '2027-yildan nasiya qoidalari (PQ-294)',
      summary: 'Prezidentning 14.08.2026 dagi PQ-294 qarori: 1-yanvar 2027 dan muddatli to\'lov uchun yangi chegaralar.',
      paras: [
        'Qaror banklar va mikromoliya tashkilotlaridan tashqari muddatli to\'lov (nasiya, BNPL) xizmatini ko\'rsatuvchilar uchun qoidalar belgilaydi. Ular Markaziy bankning maxsus reyestriga kiradi.',
        'O\'z tovarini nasiyaga sotadigan do\'kon ham operator talablariga tushishi mumkin — agar choraklik aylanmasi 500 mln so\'mdan oshsa va nasiya savdosi ulushi 50% yoki undan ko\'p bo\'lsa.',
      ],
      table: {
        head: ['Talab', 'Oddiy tilda'],
        rows: [
          ['Muddat — 12 oygacha', '12 oydan uzun nasiya bermang.'],
          ['Summa — 250 BHM gacha', 'Bitta xarid taxminan 110 mln so\'mdan oshmasin (BHM o\'zgarsa, chegara ham o\'zgaradi).'],
          ['Qo\'shimcha to\'lovlar — yiliga 50% gacha', 'Ustama, komissiya, penya va jarimalar birga qo\'shib hisoblanadi.'],
          ['Oldin yopish — jarimasiz', 'Xaridor istalgan vaqtda qarzni yopsa, jarima yoki qo\'shimcha haq olinmaydi.'],
          ['Raqamli identifikatsiya', 'Xaridor shaxsi raqamli usulda tasdiqlanadi.'],
          ['Kredit byurosi', 'Nasiya ma\'lumotlari kredit byurosiga taqdim etiladi.'],
          ['Ko\'chmas mulk', 'Ko\'chmas mulk bu tartibda nasiyaga berilmaydi.'],
        ],
      },
      tip: 'Savora jadvalni 12 oy ichida tuzishga, narx tarkibini alohida ko\'rsatishga va aylanma ulushini kuzatishga yordam beradi. Do\'koningiz operator bo\'ladimi — buxgalter yoki yurist bilan aniqlang. Bu maqola yuridik maslahat emas.',
      keywords: 'pq-294 pq294 qonun qaror 2027 markaziy bank bnpl limit 12 oy 50% 250 bhm reyestr operator',
    },
    {
      id: 'daftar',
      group: 'Nasiya',
      title: 'Qarz daftari',
      summary: 'Do\'kon qarzi (jadvalsiz) — oziq-ovqat, qurilish, avto qismlar uchun.',
      steps: [
        'Menyudan «Daftar» bo\'limini oching.',
        'Qarzdorni (ism, telefon) va summani yozing, qaytarish sanasini belgilang.',
        'To\'lov kelganda yozuvni yangilang — qoldiq qayta hisoblanadi.',
      ],
      keywords: 'qarz daftar dolg nasiya jadvalsiz',
    },

    // ── Ombor ────────────────────────────────────────────────
    {
      id: 'mahsulot',
      group: 'Ombor',
      title: 'Mahsulot qo\'shish va import',
      summary: 'Bittalab kiriting; ko\'p tovarni ko\'chirishda yordam beramiz.',
      steps: [
        '«Ombor» → «Mahsulot qo\'shish»: nomi, kelish va sotuv narxi, miqdor, shtrix-kod, rasm.',
        'Ko\'p tovar bo\'lsa — Excel ro\'yxatingizni yordam xizmatiga yuboring, biz yuklab beramiz.',
        'Qoldiqlar, kam qolgan tovarlar va tarix «Ombor» sahifasida ko\'rinadi.',
      ],
      tip: 'Telefon do\'konida tovar nomi bilan birga IMEI ham kiritiladi — keyingi maqolani o\'qing.',
      keywords: 'tovar mahsulot import excel csv qo\'shish narx',
    },
    {
      id: 'imei',
      group: 'Ombor',
      title: 'IMEI bilan ishlash',
      summary: 'Telefon do\'konlari uchun: har bir qurilma IMEI bo\'yicha hisobda.',
      steps: [
        'Telefon qo\'shishda IMEI ni skaner yoki qo\'lda kiriting — bitta IMEI ikki marta kiritilmaydi.',
        'Sotuvda IMEI skaner qilinsa, aynan o\'sha qurilma savatga tushadi.',
        '«IMEI qidirish» — ro\'yxatni bir yo\'la tekshirish va qora ro\'yxat (o\'g\'irlangan, muammoli qurilmalar).',
      ],
      tip: 'Sotishdan oldin qurilma UZIMEI tizimida ro\'yxatdan o\'tganini tekshiring — aks holda xaridorga bojxona to\'lovi tushishi mumkin.',
      keywords: 'imei telefon qora ro\'yxat blacklist uzimei',
    },
    {
      id: 'inventar',
      group: 'Ombor',
      title: 'Inventar (qoldiq nazorati)',
      summary: 'Filiallar bo\'yicha qoldiq va ombordagi tovar qiymati bir ekranda.',
      steps: [
        '«Inventar» bo\'limida har filialdagi qoldiq va ombordagi tovarlarning sotuv qiymatini ko\'ring.',
        'Davriy sanoq qiling: tovarlarni sanab, tizimdagi qoldiq bilan solishtiring.',
        'Farq chiqsa — tovar sahifasida miqdorni tuzating; o\'zgarish tovar tarixida saqlanadi.',
      ],
      keywords: 'inventar sanash revizia qoldiq',
    },
    {
      id: 'transfer',
      group: 'Ombor',
      title: 'Filiallar aro tovar berish',
      summary: 'Tovarni bir filialdan boshqasiga o\'tkazing — har ikkisining qoldig\'i yangilanadi.',
      steps: [
        'Ombordagi tovar qatorida yoki tovar sahifasida «Sotish / Filialga berish» ni bosing.',
        'Qabul qiluvchi filialni tanlang va tasdiqlang (huquq «Filialga berish» bo\'lishi kerak).',
        'Berilgan tovarlar «Filialga berildi» bo\'limida ko\'rinadi.',
      ],
      keywords: 'transfer ko\'chirish filial peremeshchenie',
    },

    // ── Moliya ───────────────────────────────────────────────
    {
      id: 'kassa',
      group: 'Moliya',
      title: 'Naqd kassa va kirim-chiqim',
      summary: 'Har filial kassasi: tushum, xarajat va qoldiq.',
      steps: [
        '«Naqd kassa» — filial bo\'yicha kunlik tushum va qoldiq.',
        '«Kirim-chiqim» — ijara, maosh, yetkazib beruvchiga to\'lov kabi xarajat va qo\'shimcha kirimlarni yozing.',
        'Sana filtri bilan istalgan davrni ko\'ring.',
      ],
      keywords: 'kassa naqd xarajat kirim chiqim rasxod',
    },
    {
      id: 'kredit-kassa',
      group: 'Moliya',
      title: 'Kredit kassa (bank krediti)',
      summary: 'Bank yoki hamkor orqali kreditga sotuvlar va bankdan kutilayotgan pul.',
      steps: [
        '«Kredit kassa» da hamkor bank yoki tashkilotlarni qo\'shing.',
        'Sotuvda to\'lov turini «Kredit» qilib bankni tanlang.',
        'Bank pul o\'tkazganda tushumni belgilang — har bank bo\'yicha qoldiq ko\'rinadi.',
      ],
      keywords: 'kredit bank bnpl uzum alif kredit kassa',
    },
    {
      id: 'hisobot',
      group: 'Moliya',
      title: 'Hisobotlar',
      summary: 'Tushum, foyda, qarzdorlik va filiallar taqqoslanishi.',
      steps: [
        '«Hisobot» bo\'limini oching, davr va filialni tanlang.',
        'Tushum, sotuvlar soni, o\'rtacha chek va foydani ko\'ring.',
        'Sotuv va mahsulot ro\'yxatlarini CSV ga yuklab oling (tarifga bog\'liq).',
      ],
      keywords: 'hisobot otchet foyda tushum monitoring eksport csv',
    },

    // ── AI ───────────────────────────────────────────────────
    {
      id: 'ai-yordamchi',
      group: 'AI yordamchi va topshiriqlar',
      title: 'AI yordamchi',
      summary: 'Do\'koningiz raqamlari bo\'yicha savolga oddiy tilda javob.',
      paras: [
        'AI yordamchi do\'kon ma\'lumotlari asosida ishlaydi: «Bu hafta eng ko\'p nima sotildi?», «Qaysi nasiyalar kechikmoqda?», «Qaysi tovar tugayapti?» kabi savollarga javob beradi va e\'tibor talab qiladigan joylarni ko\'rsatadi.',
        'Yordamchi faqat sizning huquqlaringiz doirasidagi ma\'lumotni ko\'radi: filial xodimi — faqat o\'z filialini.',
      ],
      tip: 'Bu modul bosqichma-bosqich ishga tushirilmoqda; tarifingizda yoqilganda menyuda paydo bo\'ladi.',
      keywords: 'ai sun\'iy intellekt yordamchi tahlil analitika chat',
    },
    {
      id: 'topshiriqlar',
      group: 'AI yordamchi va topshiriqlar',
      title: 'Topshiriqlar',
      summary: 'Ega, direktor va xodimlar uchun vazifalar: kim, nima, qachongacha.',
      steps: [
        'Rahbar topshiriq yaratadi: masalan, «Kechikkan 5 ta mijozga qo\'ng\'iroq qilish» yoki «Inventarizatsiya».',
        'Mas\'ul xodim va muddatni belgilaydi.',
        'Xodim bajarib belgilaydi, rahbar natijani ko\'radi.',
      ],
      tip: 'AI yordamchi tahlil natijasida topshiriq taklif qilishi mumkin — siz tasdiqlaysiz.',
      keywords: 'vazifa topshiriq task zadacha xodim direktor',
    },

    // ── Mobil ────────────────────────────────────────────────
    {
      id: 'mobil',
      group: 'Mobil ilova',
      title: 'Telefondan ishlash',
      summary: 'Brauzer, Telegram mini-ilova va mobil ilova.',
      paras: [
        'Savora telefon brauzerida to\'liq ishlaydi. Bosh ekranga qo\'shsangiz (Ulashish → «Bosh ekranga qo\'shish»), ilova kabi ochiladi.',
        'Telegram mini-ilova: botda «Savora\'ni ochish» tugmasi — parol kiritmasdan kabinetga kirasiz (hisob bog\'langan bo\'lsa).',
        'Mobil ilova (iOS va Android) — ega va filial uchun: bugungi tushum, ombor, sotuvlar, nasiya, skaner. Do\'konlarda paydo bo\'lgach, havola shu yerda bo\'ladi.',
      ],
      keywords: 'mobil telefon ilova android ios telegram mini app pwa',
    },

    // ── Xavfsizlik ───────────────────────────────────────────
    {
      id: 'xavfsizlik',
      group: 'Xavfsizlik',
      title: 'Ma\'lumotlaringiz xavfsizligi',
      summary: 'Alohida baza, shifrlangan parollar, huquqlar va zaxira.',
      paras: [
        'Har bir do\'kon ma\'lumoti alohida bazada — boshqa do\'kon ko\'ra olmaydi.',
        'Parollar shifrlangan xesh ko\'rinishida saqlanadi; Savora xodimlari ham parolingizni bilmaydi.',
        'Muntazam zaxira nusxa olinadi. Ma\'lumot sizniki: istalgan vaqtda eksport qilasiz.',
      ],
      steps: [
        'Kuchli parol qo\'ying va hech kimga bermang.',
        'Har xodimga alohida login bering, umumiy loginni ishlatmang.',
        '«Amallar» jurnalini vaqti-vaqti bilan ko\'rib turing.',
        'Telefoningiz yo\'qolsa — darhol parolni o\'zgartiring.',
      ],
      keywords: 'xavfsizlik parol baza zaxira backup shifrlash',
    },
    {
      id: 'shaxsiy-malumot',
      group: 'Xavfsizlik',
      title: 'Xaridorlar ma\'lumoti va rozilik',
      summary: 'Xaridor ma\'lumotining egasi — do\'kon. Rozilik olish sizning vazifangiz.',
      steps: [
        'Xaridordan ma\'lumotini saqlash va eslatma yuborishga rozilik oling (shartnoma yoki ariza bandida).',
        'Faqat kerakli ma\'lumotni kiriting.',
        'Reklama SMS uchun alohida rozilik kerak; eslatma va chek — xizmat xabari.',
      ],
      tip: 'Batafsil: Maxfiylik siyosati (savora.uz/privacy).',
      keywords: 'shaxsiy ma\'lumot rozilik personal data maxfiylik',
    },

    // ── Tariflar ─────────────────────────────────────────────
    {
      id: 'tariflar',
      group: 'Tariflar va to\'lov',
      title: 'Tariflar va sinov muddati',
      summary: `${trialDays} kun bepul, keyin o'zingiz tanlaysiz — avtomatik yechish yo'q.`,
      paras: [
        `Sinov ${trialDays} kun davom etadi, karta talab qilinmaydi. Tariflar filial, xodim va mahsulot soni hamda modullar bilan farqlanadi — narxlar savora.uz sahifasida.`,
        'Sinov tugagach kabinet cheklanadi, ma\'lumotlaringiz esa saqlanib turadi — to\'lov qilishingiz bilan hammasi joyida.',
      ],
      keywords: 'tarif narx sinov trial bepul obuna',
    },
    {
      id: 'tolov',
      group: 'Tariflar va to\'lov',
      title: 'Obuna uchun to\'lash',
      summary: 'Rekvizitlarga to\'lab, chekni kabinetga yuklang.',
      steps: [
        '«Kabinet» → «Obuna va to\'lov» bo\'limida tarif va davrni (oylik yoki yillik) tanlang.',
        'Ko\'rsatilgan rekvizitlarga to\'lov qiling.',
        'To\'lov cheki rasmini yuklang — tasdiqlangach obuna muddati uzayadi.',
      ],
      tip: 'Yillik to\'lovda chegirma bor. Do\'stingizni taklif qilsangiz — bonus oy olasiz (referal dastur).',
      keywords: 'to\'lov oplata chek obuna uzaytirish yillik referal',
    },
  ];
}
