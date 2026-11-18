// «onboarding» bo'limi lug'ati — ro'yxatdan o'tish ustasi (lib/onboardingQuestions.ts).
// questions[<biznes turi>][<savol kaliti>] — kalitlar ONBOARDING_QUESTIONS bilan bir xil (tests/onboardingQuestions.test.ts).
// Sex profili variantlari nomi — d.catalog.industryProfiles (takrorlanmaydi).
// Kalitlar uz va ru'da bir xil bo'lishi shart (ru: typeof uz + tests/i18n.test.ts).

interface Q {
  label: string;
  hint?: string;
  options?: Record<string, string>;
}

const ask = (label: string, hint?: string, options?: Record<string, string>): Q => ({ label, ...(hint ? { hint } : {}), ...(options ? { options } : {}) });

const uzDebt = ask('Mijozlarga qarzga (daftarga) berasizmi?', "Ha — «Daftar» yoqiladi: kim qancha qarz, muddat eslatmasi.");
const uzNasiya = ask("Nasiyaga (bo'lib to'lashga) sotasizmi?", "Ha — nasiya sotuvi va to'lov jadvali yoqiladi (tarif ruxsat bersa).");
const uzBank = ask('Bank krediti orqali ham sotasizmi?', "Ha — «Kredit kassa» bo'limi yoqiladi.");
const uzWarranty = ask('Tovarga kafolat berasizmi?', 'Ha — chek pastiga kafolat sharti yoziladi.');
const uzExpiry = ask('Muddati tugashidan necha kun oldin ogohlantirilsin?', 'Muddati yaqinlashgan tovarlar shu kun bilan hisoblanadi.');
const uzPhotos = ask('Tovar rasmlarini yuklaysizmi?', 'Ha — rasm va kamera yoqiladi (tarif ruxsat bersa).');
const uzCategories = (list: string) => ask("Tayyor kategoriyalar qo'shilsinmi?", list);

export const uz = {
  title: 'Bir nechta savol',
  lead: "Javobingizga qarab do'kon avtomatik sozlanadi. Bilmasangiz — o'tkazib yuboring, standart javob qo'llanadi.",
  yes: 'Ha',
  no: "Yo'q",
  suffix: { percent: '%', sum: "so'm", days: 'kun' },
  sampleData: "Namuna ma'lumot qo'shilsin",
  sampleHint: "Bir nechta namunaviy mahsulot — dasturni sinab ko'rish uchun. Keyin o'chirib yuborish mumkin.",
  /** Namuna mahsulot tarixidagi izoh */
  sampleTag: "Namuna ma'lumot",
  planNote: 'Modullar tanlangan tarif ruxsat bergan doirada yoqiladi.',
  errors: {
    /** {label} — savol matni */
    invalid: "Javob noto'g'ri: «{label}». Qayta tanlang.",
    invalidGeneric: "Sozlash javoblari noto'g'ri. Sahifani yangilab, qayta urinib ko'ring.",
  },
  questions: {
    general: {
      debt: uzDebt,
      weighed: ask('Tovarni kg, metr yoki litrda ham sotasizmi?', "Ha — mahsulotda o'lchov birligi maydoni chiqadi."),
      stockCount: ask("Ombordagi qoldiqni vaqti-vaqti bilan sanaysizmi?", "Ha — «Inventarizatsiya» yoqiladi (tarif ruxsat bersa)."),
    },
    phone_shop: {
      nasiya: uzNasiya,
      bankCredit: uzBank,
      used: ask('B/u (ishlatilgan) telefon qabul qilasizmi?', "Ha — «B/u telefonlar» kategoriyasi qo'shiladi; IMEI qora ro'yxat bo'yicha tekshiriladi."),
    },
    electronics: { nasiya: uzNasiya, bankCredit: uzBank, warranty: uzWarranty },
    furniture: {
      nasiya: uzNasiya,
      variants: ask("Bir model har xil o'lcham yoki rangda bo'ladimi?", "Ha — mahsulotda o'lcham va rang maydonlari chiqadi."),
      warranty: uzWarranty,
    },
    clothing: {
      kind: ask('Nima sotasiz?', "Tayyor kategoriyalar va birliklar (juft) shunga qarab qo'shiladi.", {
        clothes: 'Kiyim',
        shoes: 'Poyabzal',
        both: 'Ikkalasi ham',
      }),
      exchange: ask('10 kun ichida almashtirib berasizmi?', "Ha — chekda «10 kun ichida almashtirish» sharti chiqadi."),
      photos: uzPhotos,
    },
    grocery: {
      scale: ask('Tarozida (kg) tortib sotasizmi?', "Ha — kg, g, l birliklari birinchi ko'rsatiladi."),
      debt: uzDebt,
      expiryDays: uzExpiry,
    },
    building: {
      categories: uzCategories("Sement, armatura, bo'yoq, santexnika, elektr."),
      debt: ask('Ustalar va mijozlarga qarzga berasizmi?', "Ha — «Daftar» yoqiladi."),
    },
    cosmetics: {
      batch: ask('Tovar partiyasini (seriya raqami) yozasizmi?', 'Ha — mahsulotda partiya raqami maydoni chiqadi (qalbaki tovarga qarshi).'),
      expiryDays: uzExpiry,
      photos: uzPhotos,
    },
    pharmacy: {
      expiryDays: uzExpiry,
      categories: uzCategories('Dori-darmon, tibbiy buyumlar, vitaminlar, gigiyena.'),
    },
    auto_parts: {
      oils: ask('Moy va suyuqliklarni litrda sotasizmi?', "Ha — mahsulotda o'lchov birligi maydoni chiqadi."),
      warranty: ask('Qismlarga kafolat berasizmi?', 'Ha — kafolat (oy) maydoni va chekda kafolat sharti.'),
      debt: ask('Ustalarga qarzga berasizmi?', "Ha — «Daftar» yoqiladi."),
    },
    wholesale: {
      debt: ask("Mijozlarga qarzga (keyin to'lashga) berasizmi?", "Ha — «Daftar» yoqiladi."),
      purchasing: ask('Tovarni yetkazib beruvchidan kirim akti bilan qabul qilasizmi?', "Ha — «Kirim va xaridlar» bo'limi yoqiladi."),
    },
    restaurant: {
      service: ask("Mijozga qanday xizmat ko'rsatasiz?", "O'zi xizmatda xizmat haqi olinmaydi.", {
        waiter: 'Ofitsant xizmati',
        self: "O'zi xizmat (kassada)",
      }),
      bar: ask("Bar (alohida ichimliklar bo'limi) bormi?", "Ha — «Bar» stansiyasi qo'shiladi, ichimliklar bar ekraniga boradi."),
      takeaway: ask('Saboy (olib ketish) bormi?'),
      packFee: ask('Saboy qadoq haqi', "Butun buyurtmaga bir marta qo'shiladi. 0 — olinmaydi."),
      serviceCharge: ask('Xizmat haqi necha foiz?', "0 — olinmaydi. Foiz menyuda va chekda oldindan e'lon qilinadi (Raqobat qo'mitasi talabi)."),
    },
    service: {
      kind: ask("Qanday xizmat ko'rsatasiz?", 'Avtoservis va ustaxonada ombor nazorati yoqiladi.', {
        salon: 'Salon / sartaroshxona',
        auto: 'Avtoservis',
        repair: "Ta'mir ustaxonasi",
        other: 'Boshqa',
      }),
      materials: ask('Xizmat bilan birga tovar yoki material ham sotasizmi?', "Ha — ombor qoldig'i nazorati yoqiladi."),
      debt: ask("Mijozlarga qarzga xizmat ko'rsatasizmi?", "Ha — «Daftar» yoqiladi."),
    },
    manufacturing: {
      profile: ask('Nima ishlab chiqarasiz?', 'Birliklar va namunaviy texkarta shunga qarab tanlanadi.'),
      mode: ask("Buyurtma bo'yichami yoki omborgami?", undefined, {
        order: "Buyurtma bo'yicha",
        stock: 'Omborga',
        both: 'Ikkalasi ham',
      }),
      pay: ask("Ishchilarga qanday haq to'laysiz?", "Ishbay yoki aralash — «Ishbay haq» bo'limi yoqiladi (Pro tarifdan).", {
        salary: 'Oylik',
        piece: 'Ishbay',
        mixed: 'Aralash',
      }),
      sales: ask('Qayerga sotasiz?', "Dilerlarga — qarz daftari; buyurtmachiga — nasiya (bo'lib to'lash).", {
        shop: "O'z do'konim",
        dealers: 'Dilerlarga',
        customers: 'Buyurtmachiga',
        mixed: 'Hammasiga',
      }),
      warehouses: ask('Xom ashyo va tayyor mahsulot alohida saqlanadimi?', "Ha — ikkita ombor ochiladi: «Xom ashyo» va «Tayyor mahsulot»."),
    },
  },
  categories: {
    phonesNew: 'Yangi telefonlar',
    phonesUsed: 'B/u telefonlar',
    accessories: 'Aksessuarlar',
    clothes: 'Kiyim',
    shoes: 'Poyabzal',
    cement: 'Sement va qorishmalar',
    rebar: 'Armatura va metall',
    paint: "Bo'yoq va lak",
    plumbing: 'Santexnika',
    electrical: 'Elektr mollari',
    medicines: 'Dori-darmon',
    medicalSupplies: 'Tibbiy buyumlar',
    vitamins: 'Vitaminlar',
    hygiene: 'Gigiyena',
  },
  receipt: {
    warranty: 'Kafolat: chek va qutini saqlang. Kafolat muddati tovar kartasida.',
    exchange10: "Tovar 10 kun ichida chek bilan almashtiriladi (yorlig'i va ko'rinishi saqlangan bo'lsa).",
  },
  warehouses: { raw: 'Xom ashyo ombori', finished: 'Tayyor mahsulot ombori' },
  restaurant: { hall: 'Asosiy zal', kitchen: 'Oshxona', bar: 'Bar' },
};

const ruDebt = ask('Даёте в долг (тетрадь долгов)?', 'Да — включится «Тетрадь»: кто сколько должен, напоминания о сроке.');
const ruNasiya = ask('Продаёте в рассрочку?', 'Да — включатся продажи в рассрочку и график платежей (если позволяет тариф).');
const ruBank = ask('Продаёте и через банковский кредит?', 'Да — включится раздел «Кредитная касса».');
const ruWarranty = ask('Даёте гарантию на товар?', 'Да — внизу чека будет условие гарантии.');
const ruExpiry = ask('За сколько дней до окончания срока предупреждать?', 'Товары с близким сроком считаются по этому числу дней.');
const ruPhotos = ask('Загружаете фото товаров?', 'Да — включатся фото и камера (если позволяет тариф).');
const ruCategories = (list: string) => ask('Добавить готовые категории?', list);

export const ru: typeof uz = {
  title: 'Несколько вопросов',
  lead: 'По вашим ответам магазин настроится автоматически. Не уверены — пропустите, будет ответ по умолчанию.',
  yes: 'Да',
  no: 'Нет',
  suffix: { percent: '%', sum: 'сум', days: 'дн.' },
  sampleData: 'Добавить пример данных',
  sampleHint: 'Несколько товаров-примеров, чтобы попробовать программу. Потом их можно удалить.',
  sampleTag: 'Пример данных',
  planNote: 'Модули включаются в пределах выбранного тарифа.',
  errors: {
    invalid: 'Неверный ответ: «{label}». Выберите снова.',
    invalidGeneric: 'Ответы настройки неверны. Обновите страницу и попробуйте снова.',
  },
  questions: {
    general: {
      debt: ruDebt,
      weighed: ask('Продаёте и на вес, метры или литры?', 'Да — в товаре появится поле единицы измерения.'),
      stockCount: ask('Пересчитываете остатки на складе?', 'Да — включится «Инвентаризация» (если позволяет тариф).'),
    },
    phone_shop: {
      nasiya: ruNasiya,
      bankCredit: ruBank,
      used: ask('Принимаете б/у телефоны?', 'Да — добавится категория «Б/у телефоны»; IMEI проверяется по чёрному списку.'),
    },
    electronics: { nasiya: ruNasiya, bankCredit: ruBank, warranty: ruWarranty },
    furniture: {
      nasiya: ruNasiya,
      variants: ask('Одна модель бывает разных размеров или цветов?', 'Да — в товаре появятся поля размера и цвета.'),
      warranty: ruWarranty,
    },
    clothing: {
      kind: ask('Что продаёте?', 'По ответу добавятся готовые категории и единицы (пара).', {
        clothes: 'Одежда',
        shoes: 'Обувь',
        both: 'И то, и другое',
      }),
      exchange: ask('Обмениваете товар в течение 10 дней?', 'Да — в чеке будет условие «обмен в течение 10 дней».'),
      photos: ruPhotos,
    },
    grocery: {
      scale: ask('Продаёте на весах (кг)?', 'Да — единицы кг, г, л будут первыми.'),
      debt: ruDebt,
      expiryDays: ruExpiry,
    },
    building: {
      categories: ruCategories('Цемент, арматура, краска, сантехника, электрика.'),
      debt: ask('Даёте в долг мастерам и клиентам?', 'Да — включится «Тетрадь».'),
    },
    cosmetics: {
      batch: ask('Записываете партию (номер серии) товара?', 'Да — в товаре появится номер партии (против подделок).'),
      expiryDays: ruExpiry,
      photos: ruPhotos,
    },
    pharmacy: {
      expiryDays: ruExpiry,
      categories: ruCategories('Лекарства, медизделия, витамины, гигиена.'),
    },
    auto_parts: {
      oils: ask('Продаёте масла и жидкости в литрах?', 'Да — в товаре появится поле единицы измерения.'),
      warranty: ask('Даёте гарантию на запчасти?', 'Да — поле гарантии (мес.) и условие гарантии в чеке.'),
      debt: ask('Даёте в долг мастерам?', 'Да — включится «Тетрадь».'),
    },
    wholesale: {
      debt: ask('Отпускаете клиентам в долг (с оплатой позже)?', 'Да — включится «Тетрадь».'),
      purchasing: ask('Принимаете товар от поставщиков актом прихода?', 'Да — включится раздел «Приход и закупки».'),
    },
    restaurant: {
      service: ask('Как обслуживаете гостей?', 'При самообслуживании плата за обслуживание не берётся.', {
        waiter: 'Официанты',
        self: 'Самообслуживание (на кассе)',
      }),
      bar: ask('Есть бар (отдельный раздел напитков)?', 'Да — добавится станция «Бар», напитки уйдут на экран бара.'),
      takeaway: ask('Есть еда навынос (собой)?'),
      packFee: ask('Плата за упаковку навынос', 'Добавляется один раз на весь заказ. 0 — не берётся.'),
      serviceCharge: ask('Сколько процентов за обслуживание?', '0 — не берётся. Процент заранее объявляется в меню и чеке (требование Комитета по конкуренции).'),
    },
    service: {
      kind: ask('Какие услуги оказываете?', 'В автосервисе и мастерской включится контроль склада.', {
        salon: 'Салон / парикмахерская',
        auto: 'Автосервис',
        repair: 'Ремонтная мастерская',
        other: 'Другое',
      }),
      materials: ask('Вместе с услугой продаёте товары или материалы?', 'Да — включится контроль остатков.'),
      debt: ask('Обслуживаете клиентов в долг?', 'Да — включится «Тетрадь».'),
    },
    manufacturing: {
      profile: ask('Что производите?', 'По ответу подбираются единицы и пример техкарты.'),
      mode: ask('Под заказ или на склад?', undefined, {
        order: 'Под заказ',
        stock: 'На склад',
        both: 'И то, и другое',
      }),
      pay: ask('Как платите работникам?', 'Сдельно или смешанно — включится раздел «Сдельная оплата» (с тарифа Pro).', {
        salary: 'Оклад',
        piece: 'Сдельно',
        mixed: 'Смешанно',
      }),
      sales: ask('Кому продаёте?', 'Дилерам — тетрадь долгов; заказчикам — рассрочка.', {
        shop: 'Свой магазин',
        dealers: 'Дилерам',
        customers: 'Заказчикам',
        mixed: 'Всем',
      }),
      warehouses: ask('Сырьё и готовая продукция хранятся отдельно?', 'Да — откроются два склада: «Сырьё» и «Готовая продукция».'),
    },
  },
  categories: {
    phonesNew: 'Новые телефоны',
    phonesUsed: 'Б/у телефоны',
    accessories: 'Аксессуары',
    clothes: 'Одежда',
    shoes: 'Обувь',
    cement: 'Цемент и смеси',
    rebar: 'Арматура и металл',
    paint: 'Краски и лаки',
    plumbing: 'Сантехника',
    electrical: 'Электротовары',
    medicines: 'Лекарства',
    medicalSupplies: 'Медизделия',
    vitamins: 'Витамины',
    hygiene: 'Гигиена',
  },
  receipt: {
    warranty: 'Гарантия: сохраняйте чек и коробку. Срок гарантии — в карточке товара.',
    exchange10: 'Обмен в течение 10 дней по чеку (если сохранены ярлык и вид товара).',
  },
  warehouses: { raw: 'Склад сырья', finished: 'Склад готовой продукции' },
  restaurant: { hall: 'Основной зал', kitchen: 'Кухня', bar: 'Бар' },
};
