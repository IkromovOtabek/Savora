/**
 * Katalog lug'ati — kodda id bilan saqlanadigan ro'yxatlarning ko'rinadigan nomlari:
 * modullar (lib/features.ts), huquqlar (lib/permissions.ts), biznes turlari va atamalar (lib/businessTypes.ts).
 * Kod fayllaridagi `label`/`description` o'zbekcha manba bo'lib qoladi; UI tilga qarab shu yerdan oladi:
 *   d.catalog.features[key].label, d.catalog.permissions[key].label, d.catalog.businessTypes[id].label, d.catalog.terms[id].item
 */
import type { FeatureKey } from '../../featureKeys';
import type { PermissionKey, PermissionGroup } from '../../permissions';
import type { BusinessType } from '../../businessTypes';

type Text = { label: string; description: string };
type Terms = { item: string; items: string; addItem: string; codeLabel: string };

const featuresUz: Record<FeatureKey, Text> = {
  sales: { label: 'Sotuv', description: 'Mahsulot sotish — naqd, qarz, nasiya' },
  kassa: { label: 'Kassa', description: "Kunlik tushum va to'lovlar" },
  variant: { label: 'Nasiya sotuvi', description: "Bo'lib to'lash (nasiya) sotuvda" },
  creditKassa: { label: 'Kredit kassa', description: 'Bank krediti va biznes banklari' },
  kirimChiqim: { label: 'Kirim-Chiqim', description: 'Kirim va chiqimlar jurnali' },
  monitoring: { label: 'Hisobot', description: 'Foyda va sotuv statistikasi' },
  products: { label: 'Ombor', description: 'Mahsulotlar va narxlar' },
  inventory: { label: 'Inventarizatsiya', description: 'Ombordagi qoldiqni tekshirish' },
  users: { label: 'Jamoa', description: 'Xodimlar va filiallar' },
  export: { label: 'Eksport', description: 'CSV faylga yuklab olish' },
  mediaUpload: { label: 'Rasm / kamera', description: 'Ombor, mijoz va sotuvga rasm yuklash' },
  transferred: { label: 'Filialga berildi', description: "Filiallar aro berilgan mahsulotlar ro'yxati" },
  audit: { label: 'Amallar', description: 'Xodimlar amallari tarixi (kim, qachon, nima qildi)' },
  daftar: { label: 'Daftar', description: 'Shaxsiy qarz daftari — qarz oldi-berdi, muddat eslatmasi (SMS + Telegram)' },
  nasiya: { label: 'Nasiya', description: "Bo'lib to'lash sotuvlari — summa, oy soni, mijoz va izoh" },
  ai: { label: 'AI yordamchi', description: "Savdo, ombor va nasiya bo'yicha avtomatik tahlil, tavsiya va topshiriqlar" },
  tasks: { label: 'Topshiriqlar', description: 'Jamoa uchun topshiriqlar: kim, qachongacha, holati' },
};

const featuresRu: Record<FeatureKey, Text> = {
  sales: { label: 'Продажи', description: 'Продажа товаров — наличные, долг, рассрочка' },
  kassa: { label: 'Касса', description: 'Дневная выручка и платежи' },
  variant: { label: 'Продажа в рассрочку', description: 'Рассрочка при продаже' },
  creditKassa: { label: 'Кредитная касса', description: 'Банковский кредит и банки-партнёры' },
  kirimChiqim: { label: 'Приход-расход', description: 'Журнал приходов и расходов' },
  monitoring: { label: 'Отчёты', description: 'Статистика прибыли и продаж' },
  products: { label: 'Склад', description: 'Товары и цены' },
  inventory: { label: 'Инвентаризация', description: 'Проверка остатков на складе' },
  users: { label: 'Команда', description: 'Сотрудники и филиалы' },
  export: { label: 'Экспорт', description: 'Выгрузка в CSV' },
  mediaUpload: { label: 'Фото / камера', description: 'Фото для товаров, клиентов и продаж' },
  transferred: { label: 'Передано в филиал', description: 'Список товаров, переданных между филиалами' },
  audit: { label: 'Действия', description: 'История действий сотрудников (кто, когда, что сделал)' },
  daftar: { label: 'Тетрадь', description: 'Личная долговая тетрадь — выдача и возврат, напоминания о сроке (SMS + Telegram)' },
  nasiya: { label: 'Рассрочка', description: 'Продажи в рассрочку — сумма, число месяцев, клиент и примечание' },
  ai: { label: 'AI-помощник', description: 'Автоматический анализ, рекомендации и задачи по продажам, складу и рассрочке' },
  tasks: { label: 'Задачи', description: 'Задачи для команды: кто, до какого срока, статус' },
};

const permissionsUz: Record<PermissionKey, Text> = {
  'sale.create': { label: 'Sotuv qilish', description: 'Yangi sotuv va tez sotuv' },
  'sale.cancel': { label: 'Sotuvni bekor qilish', description: 'Sotuvni bekor qilib, mahsulotni omborga qaytarish' },
  'sale.discount': { label: 'Chegirma berish', description: 'Sotuv narxidan arzonroq sotish' },
  'sale.editPrice': { label: "Sotuvda narxni o'zgartirish", description: "Tez sotuvda narxni qo'lda kiritish" },
  'payment.accept': { label: "To'lov qabul qilish", description: "Qarz/nasiya bo'yicha to'lov qo'shish" },
  'product.create': { label: "Mahsulot qo'shish", description: 'Omborga yangi mahsulot va CSV import' },
  'product.edit': { label: 'Mahsulotni tahrirlash', description: "Nom, narx, son va holatni o'zgartirish" },
  'product.delete': { label: "Mahsulotni o'chirish", description: "Ombordan butunlay o'chirish" },
  'product.viewCost': { label: "Kelish narxini ko'rish", description: "Kelish narxi va foyda (ro'yxat, batafsil, CSV)" },
  'transfer.create': { label: 'Filialga berish', description: "Mahsulotni boshqa filialga o'tkazish" },
  'kassa.view': { label: "Kassani ko'rish", description: 'Naqd kassa va kunlik tushum' },
  'kirimChiqim.manage': { label: 'Kirim-chiqim', description: "Kirim/chiqim jurnalini ko'rish va yozish (barcha filiallar)" },
  'reports.view': { label: "Hisobotni ko'rish", description: 'Foyda va sotuv statistikasi' },
  'customers.manage': { label: 'Mijozlar', description: "Mijoz qo'shish va tahrirlash" },
  'export.data': { label: 'Eksport (CSV)', description: 'Ombor va sotuvlarni faylga yuklab olish' },
  'audit.view': { label: 'Amallar tarixi', description: 'Xodimlar amallari jurnali' },
  'daftar.manage': { label: 'Daftar', description: 'Shaxsiy qarz daftari yozuvlari' },
  'users.manage': { label: 'Filial va loginlar', description: 'Filial ochish, parol, huquqlarni boshqarish' },
  'ai.view': { label: 'AI yordamchi', description: "AI tahlil va tavsiyalarni ko'rish, qayta tahlil qilish" },
  'tasks.manage': { label: 'Topshiriqlarni boshqarish', description: "Topshiriq yaratish, biriktirish va o'chirish" },
};

const permissionsRu: Record<PermissionKey, Text> = {
  'sale.create': { label: 'Оформлять продажи', description: 'Новая продажа и быстрая продажа' },
  'sale.cancel': { label: 'Отменять продажи', description: 'Отменить продажу и вернуть товар на склад' },
  'sale.discount': { label: 'Давать скидку', description: 'Продавать дешевле установленной цены' },
  'sale.editPrice': { label: 'Менять цену при продаже', description: 'Ввод цены вручную в быстрой продаже' },
  'payment.accept': { label: 'Принимать платежи', description: 'Добавлять платежи по долгу/рассрочке' },
  'product.create': { label: 'Добавлять товары', description: 'Новые товары на склад и импорт CSV' },
  'product.edit': { label: 'Редактировать товары', description: 'Менять название, цену, количество и статус' },
  'product.delete': { label: 'Удалять товары', description: 'Полное удаление со склада' },
  'product.viewCost': { label: 'Видеть закупочную цену', description: 'Закупочная цена и прибыль (список, карточка, CSV)' },
  'transfer.create': { label: 'Передавать в филиал', description: 'Перемещение товара в другой филиал' },
  'kassa.view': { label: 'Видеть кассу', description: 'Наличная касса и дневная выручка' },
  'kirimChiqim.manage': { label: 'Приход-расход', description: 'Просмотр и записи в журнале приходов/расходов (все филиалы)' },
  'reports.view': { label: 'Видеть отчёты', description: 'Статистика прибыли и продаж' },
  'customers.manage': { label: 'Клиенты', description: 'Добавление и редактирование клиентов' },
  'export.data': { label: 'Экспорт (CSV)', description: 'Выгрузка склада и продаж в файл' },
  'audit.view': { label: 'История действий', description: 'Журнал действий сотрудников' },
  'daftar.manage': { label: 'Тетрадь', description: 'Записи личной долговой тетради' },
  'users.manage': { label: 'Филиалы и логины', description: 'Создание филиалов, пароли, управление правами' },
  'ai.view': { label: 'AI-помощник', description: 'Просмотр AI-анализа и рекомендаций, повторный анализ' },
  'tasks.manage': { label: 'Управлять задачами', description: 'Создание, назначение и удаление задач' },
};

const businessTypesUz: Record<BusinessType, Text> = {
  general: { label: 'Umumiy savdo', description: "Har qanday do'kon" },
  phone_shop: { label: "Telefon do'kon", description: 'IMEI, nasiya va bank krediti' },
  electronics: { label: 'Maishiy texnika', description: 'Texnika, nasiya va bank krediti' },
  furniture: { label: 'Mebel', description: "Mebel, buyurtma va bo'lib to'lash" },
  clothing: { label: 'Kiyim-kechak', description: "Kiyim, poyabzal, o'lcham va rang" },
  grocery: { label: 'Oziq-ovqat / minimarket', description: 'Tez sotuv va qarz daftari' },
  building: { label: 'Qurilish mollari', description: 'Optom-chakana, qarz daftari' },
  cosmetics: { label: 'Kosmetika / parfyumeriya', description: 'Kosmetika, atir va rasmli katalog' },
  pharmacy: { label: 'Dorixona', description: 'Dori-darmon savdosi' },
  auto_parts: { label: 'Avto ehtiyot qism', description: 'Avtomobil qismlari' },
  wholesale: { label: 'Optom savdo', description: 'Katta hajmli savdo' },
  restaurant: { label: 'Restoran / kafe', description: 'Ovqat va xizmat savdosi' },
  service: { label: 'Xizmat markazi', description: 'Salon, ustaxona va xizmatlar' },
};

const businessTypesRu: Record<BusinessType, Text> = {
  general: { label: 'Общая торговля', description: 'Любой магазин' },
  phone_shop: { label: 'Магазин телефонов', description: 'IMEI, рассрочка и банковский кредит' },
  electronics: { label: 'Бытовая техника', description: 'Техника, рассрочка и банковский кредит' },
  furniture: { label: 'Мебель', description: 'Мебель, заказы и рассрочка' },
  clothing: { label: 'Одежда и обувь', description: 'Одежда, обувь, размер и цвет' },
  grocery: { label: 'Продукты / минимаркет', description: 'Быстрая продажа и долговая тетрадь' },
  building: { label: 'Стройматериалы', description: 'Опт и розница, долговая тетрадь' },
  cosmetics: { label: 'Косметика / парфюмерия', description: 'Косметика, парфюм и каталог с фото' },
  pharmacy: { label: 'Аптека', description: 'Продажа лекарств' },
  auto_parts: { label: 'Автозапчасти', description: 'Запчасти для автомобилей' },
  wholesale: { label: 'Оптовая торговля', description: 'Торговля крупными партиями' },
  restaurant: { label: 'Ресторан / кафе', description: 'Еда и услуги' },
  service: { label: 'Сервисный центр', description: 'Салон, мастерская и услуги' },
};

const termsUz: Record<BusinessType, Terms> = {
  general: { item: 'Mahsulot', items: 'Ombor', addItem: "Mahsulot qo'shish", codeLabel: 'Kod / shtrix' },
  phone_shop: { item: 'Telefon', items: 'Ombor', addItem: "Telefon qo'shish", codeLabel: 'IMEI' },
  electronics: { item: 'Texnika', items: 'Ombor', addItem: "Texnika qo'shish", codeLabel: 'Seriya / shtrix' },
  furniture: { item: 'Mebel', items: 'Ombor', addItem: "Mebel qo'shish", codeLabel: 'Artikul' },
  clothing: { item: 'Kiyim', items: 'Ombor', addItem: "Kiyim qo'shish", codeLabel: 'Artikul / shtrix' },
  grocery: { item: 'Mahsulot', items: 'Ombor', addItem: "Mahsulot qo'shish", codeLabel: 'Shtrix' },
  building: { item: 'Material', items: 'Ombor', addItem: "Material qo'shish", codeLabel: 'Kod / shtrix' },
  cosmetics: { item: 'Mahsulot', items: 'Ombor', addItem: "Mahsulot qo'shish", codeLabel: 'Shtrix' },
  pharmacy: { item: 'Dori', items: 'Dorixona', addItem: "Dori qo'shish", codeLabel: 'Shtrix' },
  auto_parts: { item: 'Ehtiyot qism', items: 'Ombor', addItem: "Qism qo'shish", codeLabel: 'Kod / shtrix' },
  wholesale: { item: 'Mahsulot', items: 'Ombor', addItem: "Mahsulot qo'shish", codeLabel: 'Kod / shtrix' },
  restaurant: { item: 'Taom', items: 'Menyu', addItem: "Taom qo'shish", codeLabel: 'Kod' },
  service: { item: 'Xizmat', items: 'Xizmatlar', addItem: "Xizmat qo'shish", codeLabel: 'Kod' },
};

const termsRu: Record<BusinessType, Terms> = {
  general: { item: 'Товар', items: 'Склад', addItem: 'Добавить товар', codeLabel: 'Код / штрих-код' },
  phone_shop: { item: 'Телефон', items: 'Склад', addItem: 'Добавить телефон', codeLabel: 'IMEI' },
  electronics: { item: 'Техника', items: 'Склад', addItem: 'Добавить технику', codeLabel: 'Серия / штрих-код' },
  furniture: { item: 'Мебель', items: 'Склад', addItem: 'Добавить мебель', codeLabel: 'Артикул' },
  clothing: { item: 'Одежда', items: 'Склад', addItem: 'Добавить одежду', codeLabel: 'Артикул / штрих-код' },
  grocery: { item: 'Товар', items: 'Склад', addItem: 'Добавить товар', codeLabel: 'Штрих-код' },
  building: { item: 'Материал', items: 'Склад', addItem: 'Добавить материал', codeLabel: 'Код / штрих-код' },
  cosmetics: { item: 'Товар', items: 'Склад', addItem: 'Добавить товар', codeLabel: 'Штрих-код' },
  pharmacy: { item: 'Лекарство', items: 'Аптека', addItem: 'Добавить лекарство', codeLabel: 'Штрих-код' },
  auto_parts: { item: 'Запчасть', items: 'Склад', addItem: 'Добавить запчасть', codeLabel: 'Код / штрих-код' },
  wholesale: { item: 'Товар', items: 'Склад', addItem: 'Добавить товар', codeLabel: 'Код / штрих-код' },
  restaurant: { item: 'Блюдо', items: 'Меню', addItem: 'Добавить блюдо', codeLabel: 'Код' },
  service: { item: 'Услуга', items: 'Услуги', addItem: 'Добавить услугу', codeLabel: 'Код' },
};

export const uz = {
  features: featuresUz,
  featureCategories: { savdo: 'Savdo', ombor: 'Ombor', boshqaruv: 'Jamoa', hisobot: 'Hisobot' } as Record<'savdo' | 'ombor' | 'boshqaruv' | 'hisobot', string>,
  permissions: permissionsUz,
  permissionGroups: { savdo: 'Savdo', ombor: 'Ombor', moliya: 'Moliya', boshqaruv: 'Boshqaruv' } as Record<PermissionGroup, string>,
  permissionDenied: "Bu amal uchun huquqingiz yo'q. Do'kon egasiga murojaat qiling.",
  /** {label} — huquq nomi */
  permissionDeniedNamed: "«{label}» huquqi yo'q. Do'kon egasiga murojaat qiling.",
  /** {label} — modul nomi */
  featureDisabledNamed: '«{label}» moduli faol emas. Platforma egasiga murojaat qiling.',
  businessTypes: businessTypesUz,
  terms: termsUz,
  roles: { admin: "Do'kon egasi", user: 'Xodim', super_admin: 'Super admin' } as Record<'admin' | 'user' | 'super_admin', string>,
  planTiers: { free: 'Bepul', starter: 'Start', pro: 'Pro', business: 'Biznes', custom: 'Maxsus' } as Record<'free' | 'starter' | 'pro' | 'business' | 'custom', string>,
};

export const ru: typeof uz = {
  features: featuresRu,
  featureCategories: { savdo: 'Продажи', ombor: 'Склад', boshqaruv: 'Команда', hisobot: 'Отчёты' },
  permissions: permissionsRu,
  permissionGroups: { savdo: 'Продажи', ombor: 'Склад', moliya: 'Финансы', boshqaruv: 'Управление' },
  permissionDenied: 'У вас нет прав на это действие. Обратитесь к владельцу магазина.',
  permissionDeniedNamed: 'Нет права «{label}». Обратитесь к владельцу магазина.',
  featureDisabledNamed: 'Модуль «{label}» не подключён. Обратитесь к владельцу платформы.',
  businessTypes: businessTypesRu,
  terms: termsRu,
  roles: { admin: 'Владелец магазина', user: 'Сотрудник', super_admin: 'Суперадмин' },
  planTiers: { free: 'Бесплатный', starter: 'Старт', pro: 'Про', business: 'Бизнес', custom: 'Индивидуальный' },
};
