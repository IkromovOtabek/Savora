// «notify» bo'limi lug'ati — bildirishnomalar: qo'ng'iroqcha (web sarlavhasi), mobil ro'yxat, push matnlari, ovoz sozlamasi.
// Kalitlar uz va ru'da bir xil bo'lishi shart (typeof uz tekshiradi).
// Matn bazaga yozilmaydi: `kind` + `params` saqlanadi, sarlavha/matn shu yerdan (lib/notifyView.ts → notifyText).

export const uz = {
  bell: {
    label: 'Bildirishnomalar',
    /** {n} — o'qilmaganlar soni */
    labelUnread: 'Bildirishnomalar: {n} ta yangi',
    title: 'Bildirishnomalar',
    markAll: "Hammasini o'qildi",
    empty: "Hozircha bildirishnoma yo'q",
    emptyHint: "Mijoz chaqiruvi, hisob so'rovi va kam qolgan mahsulotlar shu yerda ko'rinadi.",
    loadError: "Bildirishnomalarni yuklab bo'lmadi.",
    retry: 'Qayta urinish',
    open: 'Ochish',
    close: 'Yopish',
    sound: 'Ovoz',
    soundOn: 'Ovoz yoqiq',
    soundOff: "Ovoz o'chiq",
    soundHint: "Yangi xabar kelganda qisqa signal (shu qurilmada)",
    soundLocked: 'Ovoz chiqishi uchun sahifaga bir marta teging',
    unread: 'Yangi',
    handled: "Ko'rildi",
  },
  ago: {
    now: 'Hozirgina',
    minutes: '{n} daqiqa oldin',
    hours: '{n} soat oldin',
    days: '{n} kun oldin',
  },
  /** Har tur uchun sarlavha va matn ({…} — `params`) */
  kinds: {
    waiterCall: { title: 'Ofitsant chaqirilmoqda', body: '{table}-stol ofitsantni chaqiryapti' },
    billCall: { title: "Hisob so'raldi", body: "{table}-stol hisobni so'ramoqda" },
    lowStock: { title: 'Kam qoldi: {product}', body: 'Omborda {qty} qoldi (minimal — {min})' },
    dishLow: { title: 'Kam qoldi: {dish}', body: 'Xom ashyo yana {portions} porsiyaga yetadi' },
    dishOut: { title: 'Tugadi: {dish}', body: "Xom ashyo tugadi — menyuda «Tugagan» bo'lib turadi" },
    reservationSoon: { title: 'Bron yaqinlashdi: {time}', body: '{table}-stol — {name}, {guests} kishi', bodyNoTable: '{name}, {guests} kishi' },
  },
  /** Bir nechta filialli do'konda matn oxiriga */
  branchSuffix: ' · {branch}',
  errors: {
    badInput: "Noto'g'ri so'rov.",
    notFound: 'Bildirishnoma topilmadi.',
  },
  /** Restoran sozlamalari → Umumiy */
  settings: {
    title: 'Bildirishnomalar',
    hint: "Xabarlar sarlavhadagi qo'ng'iroqchada va telefon ilovasida (push) chiqadi.",
    lowPortions: 'Taom kam qolganda ogohlantirish',
    lowPortionsUnit: 'porsiya',
    lowPortionsHint: "Taomga shuncha yoki kamroq porsiya qolganda va tugaganda egasi va menyu xodimlariga xabar boradi. 0 — o'chiq.",
    lowPortionsBad: "0 dan 1000 gacha butun son kiriting",
    minStockHint: "Xom ashyo uchun: mahsulot sahifasida «Minimal qoldiq» kiritilgan bo'lsa, qoldiq undan tushganda ham xabar keladi.",
  },
};

export const ru: typeof uz = {
  bell: {
    label: 'Уведомления',
    labelUnread: 'Уведомления: новых — {n}',
    title: 'Уведомления',
    markAll: 'Прочитать все',
    empty: 'Пока уведомлений нет',
    emptyHint: 'Здесь появятся вызовы гостей, запросы счёта и заканчивающиеся продукты.',
    loadError: 'Не удалось загрузить уведомления.',
    retry: 'Повторить',
    open: 'Открыть',
    close: 'Закрыть',
    sound: 'Звук',
    soundOn: 'Звук включён',
    soundOff: 'Звук выключен',
    soundHint: 'Короткий сигнал при новом уведомлении (на этом устройстве)',
    soundLocked: 'Чтобы включился звук, коснитесь страницы один раз',
    unread: 'Новое',
    handled: 'Принято',
  },
  ago: {
    now: 'Только что',
    minutes: '{n} мин назад',
    hours: '{n} ч назад',
    days: '{n} дн назад',
  },
  kinds: {
    waiterCall: { title: 'Зовут официанта', body: 'Стол {table} зовёт официанта' },
    billCall: { title: 'Просят счёт', body: 'Стол {table} просит счёт' },
    lowStock: { title: 'Заканчивается: {product}', body: 'На складе осталось {qty} (минимум — {min})' },
    dishLow: { title: 'Заканчивается: {dish}', body: 'Сырья хватит ещё на {portions} порц.' },
    dishOut: { title: 'Закончилось: {dish}', body: 'Сырьё закончилось — в меню блюдо отмечено «Закончилось»' },
    reservationSoon: { title: 'Скоро бронь: {time}', body: 'Стол {table} — {name}, гостей: {guests}', bodyNoTable: '{name}, гостей: {guests}' },
  },
  branchSuffix: ' · {branch}',
  errors: {
    badInput: 'Неверный запрос.',
    notFound: 'Уведомление не найдено.',
  },
  settings: {
    title: 'Уведомления',
    hint: 'Уведомления приходят в колокольчик в шапке и в мобильное приложение (push).',
    lowPortions: 'Предупреждать, когда блюдо заканчивается',
    lowPortionsUnit: 'порц.',
    lowPortionsHint: 'Когда на блюдо остаётся столько порций или меньше (и когда оно закончилось), владелец и сотрудники меню получат уведомление. 0 — выключено.',
    lowPortionsBad: 'Введите целое число от 0 до 1000',
    minStockHint: 'Для сырья: если на странице товара задан «Минимальный остаток», уведомление придёт и когда остаток опустится ниже него.',
  },
};
