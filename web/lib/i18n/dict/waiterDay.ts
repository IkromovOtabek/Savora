// «waiterDay» bo'limi lug'ati — ofitsant kabineti «Mening kunim» va ofitsantlar kesimidagi hisobot.
// Kalitlar uz va ru'da bir xil bo'lishi shart (typeof uz tekshiradi).

export const uz = {
  /* ── «Mening kunim» — /app/tables/me (web), mobil «waiter-day» ── */
  metaTitle: 'Mening kunim',
  title: 'Mening kunim',
  /** {name} — ofitsant ismi */
  sub: '{name} · stollaringiz va natijangiz',
  periodAria: 'Davr',
  periods: { today: 'Bugun', week: 'Hafta', month: 'Oy' },
  /** {from}, {to} — kunlar */
  range: '{from} – {to}',
  kpiAria: "Ko'rsatkichlar",
  kpi: {
    orders: 'Yopilgan hisoblar',
    revenue: 'Sotuv',
    avgCheck: "O'rtacha chek",
    guests: 'Mehmonlar',
    serviceCharge: 'Xizmat haqi',
    voids: 'Bekor qilingan taomlar',
  },
  /** {n} — mehmon kiritilmagan hisoblar soni */
  guestsMissing: '{n} ta hisobda kiritilmagan',
  /** {n} — pishgandan keyin bekor qilinganlar */
  voidsLoss: '{n} tasi pishgandan keyin',
  voidsNone: "Yo'q — barakalla!",
  revenueNote: 'Xizmat haqi bilan',
  openTitle: 'Hozir ochiq stollarim',
  openEmpty: "Hozir ochiq stolingiz yo'q.",
  openHint: "Stolni bosing — buyurtma ekrani ochiladi.",
  /** {n} — ochiq stollar soni */
  openCount: '{n} ta ochiq',
  takeaway: 'Saboy',
  /** {n} — mehmonlar */
  guestsN: '{n} mehmon',
  /** {n} — tayyor taomlar */
  ready: '{n} ta tayyor',
  /** {n} — mijoz QR orqali buyurtma qilgan, tasdiqlanmagan taomlar */
  pending: 'QR: {n} ta tasdiqlang',
  /** {n} — oshxonaga yuborilmagan taomlar */
  unsent: '{n} ta yuborilmagan',
  precheck: 'Pre-chek berilgan',
  due: "To'lanadi",
  /** {t} — vaqt */
  openedAt: 'Ochildi {t}',
  closedTitle: 'Yopilgan hisoblarim',
  closedEmpty: "Bu davrda yopilgan hisobingiz yo'q.",
  /** {n} — ko'rsatilgan, {total} — jami */
  closedShown: "Oxirgi {n} tasi ko'rsatildi (jami {total})",
  colTime: 'Vaqt',
  colTable: 'Stol',
  colGuests: 'Mehmon',
  colSum: 'Summa',
  refresh: 'Yangilash',
  /** {t} — vaqt */
  updated: 'Yangilandi {t}',
  noAccess: "Bu sahifa buyurtma oladigan xodim uchun («Buyurtma olish» huquqi).",
  /** Bosh sahifa plitkasi (mobil) */
  tile: 'Mening kunim',

  /* ── Rahbar hisoboti: «Ofitsantlar» jadvali (/app/restaurant/reports) ── */
  report: {
    title: 'Ofitsantlar',
    sub: "Davrda yopilgan (to'langan) hisoblar; bekor qilinganlar — ofitsant stollarida, oshxonaga yuborilgandan keyin",
    colVoids: 'Bekor qilingan',
    colVoidAmount: 'Bekor summasi',
    /** {n} — pishgandan keyin bekor qilinganlar */
    lossTitle: '{n} tasi pishgandan keyin (yo\'qotish)',
  },

  /* ── Xodim qo'shish (/app/users) ── */
  staff: {
    restaurantRoles: 'Restoran rollari',
    otherRoles: 'Boshqa rollar',
    roleNoneShort: 'Rolsiz',
    /** Rol shablonlari — bir qatorli izoh (nima qila oladi) */
    hints: {
      waiter: "O'z stollari: stol ochadi, buyurtma oladi, oshxonaga yuboradi, pre-chek beradi",
      chef: "Oshxona ekrani: taomni «tayyorlanmoqda» / «tayyor» qiladi, stop-list",
      barman: "Bar ekrani va stop-list + peshtaxtada buyurtma oladi",
      cashierRest: "Barcha stollarni ko'radi, to'lov oladi, hisobni bo'ladi, kassa smenasi",
      administrator: "Zal boshlig'i: stol o'tkazish, taomni bekor qilish, chegirma, sozlama, hisobotlar",
      cashier: "Sotuv va to'lov qabul qilish, kassa smenasi, mijozlar",
      seller: "Sotuv, chegirma, mahsulot qo'shish, ombor va mijozlar",
      manager: "Sotuv, ombor, narx, hisobotlar — keng huquqlar",
    },
    /** {n} — huquqlar soni (izohsiz o'z roli) */
    customHint: '{n} ta huquq',
    noneHint: 'Filial standart huquqlari',
    createdTitle: "Xodim qo'shildi",
    /** {name} — xodim ismi */
    createdLead: "Bu ma'lumotni xodimga ({name}) bering — u shu bilan kiradi:",
    login: 'Login',
    password: 'Parol',
    enterAt: 'Kirish',
    copy: 'Nusxa olish',
    copied: 'Nusxa olindi',
    copyFailed: "Nusxa olinmadi — qo'lda yozib oling",
    passwordOnce: "Parol faqat hozir ko'rinadi. Esdan chiqsa — «Tahrirlash» orqali yangisini bering.",
    addAnother: "Yana xodim qo'shish",
    done: 'Tayyor',
  },
};

export const ru: typeof uz = {
  metaTitle: 'Мой день',
  title: 'Мой день',
  sub: '{name} · ваши столы и результаты',
  periodAria: 'Период',
  periods: { today: 'Сегодня', week: 'Неделя', month: 'Месяц' },
  range: '{from} – {to}',
  kpiAria: 'Показатели',
  kpi: {
    orders: 'Закрытые счета',
    revenue: 'Продажи',
    avgCheck: 'Средний чек',
    guests: 'Гости',
    serviceCharge: 'Обслуживание',
    voids: 'Отменённые блюда',
  },
  guestsMissing: 'в {n} счетах не указано',
  voidsLoss: 'из них {n} после приготовления',
  voidsNone: 'Нет — отлично!',
  revenueNote: 'С обслуживанием',
  openTitle: 'Мои открытые столы',
  openEmpty: 'Сейчас у вас нет открытых столов.',
  openHint: 'Нажмите на стол — откроется экран заказа.',
  openCount: 'открыто: {n}',
  takeaway: 'С собой',
  guestsN: 'гостей: {n}',
  ready: 'готово: {n}',
  pending: 'QR: подтвердите {n}',
  unsent: 'не отправлено: {n}',
  precheck: 'Пре-чек выдан',
  due: 'К оплате',
  openedAt: 'Открыт {t}',
  closedTitle: 'Мои закрытые счета',
  closedEmpty: 'За этот период закрытых счетов нет.',
  closedShown: 'Показаны последние {n} (всего {total})',
  colTime: 'Время',
  colTable: 'Стол',
  colGuests: 'Гости',
  colSum: 'Сумма',
  refresh: 'Обновить',
  updated: 'Обновлено {t}',
  noAccess: 'Эта страница для сотрудника, принимающего заказы (право «Приём заказов»).',
  tile: 'Мой день',

  report: {
    title: 'Официанты',
    sub: 'Закрытые (оплаченные) за период счета; отмены — на столах официанта, после отправки на кухню',
    colVoids: 'Отменено',
    colVoidAmount: 'Сумма отмен',
    lossTitle: 'из них {n} после приготовления (потери)',
  },

  staff: {
    restaurantRoles: 'Роли ресторана',
    otherRoles: 'Другие роли',
    roleNoneShort: 'Без роли',
    hints: {
      waiter: 'Свои столы: открывает стол, принимает заказ, отправляет на кухню, выдаёт пре-чек',
      chef: 'Экран кухни: отмечает «готовится» / «готово», стоп-лист',
      barman: 'Экран бара и стоп-лист + принимает заказ у стойки',
      cashierRest: 'Видит все столы, принимает оплату, делит счёт, кассовая смена',
      administrator: 'Администратор зала: перенос стола, отмена блюд, скидка, настройки, отчёты',
      cashier: 'Продажа и приём оплаты, кассовая смена, клиенты',
      seller: 'Продажа, скидка, добавление товаров, склад и клиенты',
      manager: 'Продажи, склад, цены, отчёты — широкие права',
    },
    customHint: 'прав: {n}',
    noneHint: 'Стандартные права филиала',
    createdTitle: 'Сотрудник добавлен',
    createdLead: 'Передайте эти данные сотруднику ({name}) — с ними он войдёт:',
    login: 'Логин',
    password: 'Пароль',
    enterAt: 'Вход',
    copy: 'Скопировать',
    copied: 'Скопировано',
    copyFailed: 'Не удалось скопировать — перепишите вручную',
    passwordOnce: 'Пароль виден только сейчас. Если забудет — задайте новый через «Редактировать».',
    addAnother: 'Добавить ещё сотрудника',
    done: 'Готово',
  },
};
