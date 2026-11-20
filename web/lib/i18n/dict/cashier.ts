// «cashier» bo'limi lug'ati — restoran kassir oynasi va stollar taxtasidagi «Hisoblar» ko'rinishi.
// Kalitlar uz va ru'da bir xil bo'lishi shart (typeof uz tekshiradi).

export const uz = {
  /* Stollar taxtasi: «Stollar | Hisoblar» almashtirgich */
  viewAria: "Ko'rinish",
  viewTables: 'Stollar',
  viewBills: 'Hisoblar',

  /* Hisoblar jamlamasi */
  sumOpen: 'Ochiq hisoblar',
  sumDue: 'Umumiy summa',
  sumPrecheck: 'Pre-chek kutmoqda',
  sumBillReq: "Hisob so'radi",
  sumAria: 'Hisoblar jamlamasi',
  /** {n}, {sum} — hisoblar soni va summa (sahifa ostsarlavhasi) */
  summaryLine: '{n} ta ochiq hisob · {sum} so\'m',
  noBills: "Ochiq hisob yo'q",
  noBillsHint: "Stol ochilganda yoki saboy qo'shilganda shu yerda ko'rinadi.",
  billsAria: 'Ochiq hisoblar',

  /* Hisob qatori */
  /** {no} — saboy raqami (qisqa) */
  takeawayNo: 'Saboy №{no}',
  /** {no} — saboy raqami, {n} — stol raqami */
  takeawayNoFor: 'Saboy №{no} · {n}-stol',
  billRequested: "Hisob so'radi",
  /** {t} — soat:daqiqa */
  openedAt: 'ochildi {t}',
  /** {n} — mehmonlar */
  guestsN: '{n} mehmon',
  noWaiter: 'Ofitsantsiz',
  /** {n} — bog'langan saboylar soni */
  linkedAria: "Shu stolga bog'langan saboylar: {n}",
  ack: "Ko'rdim",

  /* Kassir oynasi */
  metaTitle: 'Kassa — Savora',
  title: 'Kassa',
  tablesLink: 'Stollar',
  searchPh: 'Stol yoki saboy raqami',
  searchAria: 'Hisob qidirish (stol raqami, saboy raqami yoki ofitsant)',
  queue: "To'lov navbati",
  queueHint: "Pre-chek va hisob so'raganlar birinchi, keyin eng eskisi",
  noMatch: "Qidiruvga mos hisob yo'q",
  pickBill: 'Navbatdan hisobni tanlang',
  pickBillHint: "Taomlar, xizmat haqi va jami shu yerda ko'rinadi. «To'lash» — naqd, karta, aralash yoki bo'lib.",
  backToQueue: 'Navbatga qaytish',
  items: 'Taomlar',
  paidItems: "To'langan taomlar",
  noItems: "Hali taom yo'q",
  openOrder: 'Buyurtmani ochish',
  precheck: 'Pre-chek',
  precheckPrint: 'Pre-chekni chop etish',
  pay: "To'lash",
  discountHint: "Chegirma va hisobni bo'lish — to'lov oynasida",
  pendingQr: "Mijoz QR'dan qo'shgan taom tasdiqlanmagan — avval buyurtma ekranida tasdiqlang yoki rad eting.",
  unsentHint: "Oshxonaga yuborilmagan taom bor — to'lovda avval yuboriladi.",
  linkedTitle: "Shu stol mehmonlarining saboyi",
  linkedHint: 'Alohida hisob — alohida to\'lanadi',
  tableBillOf: "Stol hisobi: {n}-stol",
  closedTitle: 'Hisob yopildi',
  goneHint: "Bu hisob endi navbatda yo'q (to'langan, bekor qilingan yoki boshqa joyda o'zgargan).",
  noShift: "Kassa smenasi ochilmagan — naqd tushum smena hisobiga tushmaydi.",
  openShift: 'Smena ochish',
};

export const ru: typeof uz = {
  viewAria: 'Вид',
  viewTables: 'Столы',
  viewBills: 'Счета',

  sumOpen: 'Открытые счета',
  sumDue: 'Общая сумма',
  sumPrecheck: 'Ждут оплаты (пречек)',
  sumBillReq: 'Просят счёт',
  sumAria: 'Сводка по счетам',
  summaryLine: 'Открытых счетов: {n} · {sum} сум',
  noBills: 'Открытых счетов нет',
  noBillsHint: 'Появятся здесь, когда откроют стол или добавят заказ с собой.',
  billsAria: 'Открытые счета',

  takeawayNo: 'С собой №{no}',
  takeawayNoFor: 'С собой №{no} · стол {n}',
  billRequested: 'Просят счёт',
  openedAt: 'открыт {t}',
  guestsN: 'Гостей: {n}',
  noWaiter: 'Без официанта',
  linkedAria: 'Заказы с собой для этого стола: {n}',
  ack: 'Принято',

  metaTitle: 'Касса — Savora',
  title: 'Касса',
  tablesLink: 'Столы',
  searchPh: 'Номер стола или заказа',
  searchAria: 'Поиск счёта (номер стола, заказа или официант)',
  queue: 'Очередь оплаты',
  queueHint: 'Сначала пречек и запросы счёта, затем самые старые',
  noMatch: 'Нет счетов по запросу',
  pickBill: 'Выберите счёт в очереди',
  pickBillHint: 'Здесь будут блюда, обслуживание и итог. «Оплатить» — наличные, карта, смешанная или раздельная оплата.',
  backToQueue: 'К очереди',
  items: 'Блюда',
  paidItems: 'Оплаченные блюда',
  noItems: 'Блюд пока нет',
  openOrder: 'Открыть заказ',
  precheck: 'Пречек',
  precheckPrint: 'Печать пречека',
  pay: 'Оплатить',
  discountHint: 'Скидка и разделение счёта — в окне оплаты',
  pendingQr: 'Есть неподтверждённые блюда от гостя (QR) — сначала подтвердите или отклоните их в заказе.',
  unsentHint: 'Есть блюда, не отправленные на кухню, — при оплате они отправятся автоматически.',
  linkedTitle: 'Заказ с собой для гостей этого стола',
  linkedHint: 'Отдельный счёт — оплачивается отдельно',
  tableBillOf: 'Счёт стола: стол {n}',
  closedTitle: 'Счёт закрыт',
  goneHint: 'Этого счёта больше нет в очереди (оплачен, отменён или изменён в другом месте).',
  noShift: 'Кассовая смена не открыта — наличные не попадут в отчёт смены.',
  openShift: 'Открыть смену',
};
