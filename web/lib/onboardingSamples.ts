/**
 * Ro'yxatdan o'tish ustasi — «Namuna ma'lumot qo'shilsin» (ixtiyoriy, standart o'chiq).
 * Har tur uchun 5–7 ta namunaviy mahsulot; restoran: zal + 4 stol, omborda xom ashyo, menyuda retseptli taomlar, tayyor tovar
 * (non, ichimlik) va xizmat (choy) — menyu va ombor ajratilgan (lib/restaurant/menuFlags.ts); sex: xom ashyo + tayyor
 * mahsulot + 1 texkarta.
 *
 * IDEMPOTENT: har namuna `Product.itemCode = NAMUNA-<kod>` bilan yoziladi va (o'chirilgan bo'lsa ham) qayta
 * yaratilmaydi; zal nomi, stansiya nomi, texkarta nomi bo'yicha tekshiriladi; stollar band raqamni o'tkazib yuboradi.
 * Restoran va sex obyektlari FAQAT mavjud lib/restaurant/setup.ts va lib/production/recipes.ts funksiyalari orqali.
 * Mahsulot nomlari — ma'lumot (UI matni emas), shuning uchun shu yerda uz/ru juftligi bilan.
 */
import type { Types } from 'mongoose';
import type { getTenantModels } from './tenantDb';
import type { SessionUser } from './session';
import type { OrgFeatures } from './featureKeys';
import type { PermissionKey } from './permissions';
import type { Dict } from './i18n/dict';
import type { Locale } from './i18n/config';
import type { IndustryProfile, ProductUnit } from './businessTypes';
import type { OnboardingPlan, SetupCategoryKey } from './onboardingQuestions';
import { generateProductCode, generateSku } from './productId';
import { ensureMainBranchId } from './mainBranch';
import { CATALOG_COLLATION } from './models/tenant/ProductCategory';

export type TenantModels = Awaited<ReturnType<typeof getTenantModels>>;

type Name = { uz: string; ru: string };
export interface SampleItem {
  code: string;
  name: Name;
  cost: number;
  price: number;
  /** goods — qoldiq bilan (standart); service — cheksiz (xizmat, taom) */
  kind?: 'goods' | 'service';
  qty?: number;
  unit?: ProductUnit;
  cat?: SetupCategoryKey;
  /** Restoran: ichimlik — bar stansiyasiga (bo'lsa) */
  drink?: boolean;
}

const n = (uz: string, ru: string): Name => ({ uz, ru });
const svc = (code: string, name: Name, price: number): SampleItem => ({ code, name, cost: 0, price, kind: 'service' });

export const SAMPLE_PRODUCTS: Record<string, SampleItem[]> = {
  general: [
    { code: 'GEN-SHAKAR', name: n('Shakar 1 kg', 'Сахар 1 кг'), cost: 11000, price: 13000, qty: 20 },
    { code: 'GEN-GURUCH', name: n('Guruch', 'Рис'), cost: 14000, price: 17000, qty: 25, unit: 'kg' },
    { code: 'GEN-KUKUN', name: n('Kir yuvish kukuni 3 kg', 'Стиральный порошок 3 кг'), cost: 42000, price: 52000, qty: 8 },
    { code: 'GEN-SOVUN', name: n('Sovun', 'Мыло'), cost: 4000, price: 5500, qty: 30 },
    { code: 'GEN-GUGURT', name: n('Gugurt', 'Спички'), cost: 1500, price: 2500, qty: 40 },
    { code: 'GEN-BATAREYKA', name: n('Batareyka AA', 'Батарейка AA'), cost: 3000, price: 5000, qty: 24 },
  ],
  phone_shop: [
    { code: 'TEL-IP13', name: n('iPhone 13 128 GB', 'iPhone 13 128 ГБ'), cost: 6_500_000, price: 7_200_000, cat: 'phonesNew' },
    { code: 'TEL-A55', name: n('Samsung Galaxy A55', 'Samsung Galaxy A55'), cost: 3_900_000, price: 4_400_000, cat: 'phonesNew' },
    { code: 'TEL-RN13', name: n('Redmi Note 13', 'Redmi Note 13'), cost: 2_300_000, price: 2_650_000, cat: 'phonesNew' },
    { code: 'TEL-IP11BU', name: n('iPhone 11 64 GB (b/u)', 'iPhone 11 64 ГБ (б/у)'), cost: 2_800_000, price: 3_300_000, cat: 'phonesUsed' },
    { code: 'TEL-CHEXOL', name: n("G'ilof (chexol)", 'Чехол'), cost: 20000, price: 45000, qty: 15, cat: 'accessories' },
    { code: 'TEL-ZARYAD', name: n('Zaryadlovchi 20W', 'Зарядное устройство 20W'), cost: 45000, price: 85000, qty: 10, cat: 'accessories' },
    { code: 'TEL-OYNA', name: n('Himoya oynasi', 'Защитное стекло'), cost: 8000, price: 25000, qty: 30, cat: 'accessories' },
  ],
  electronics: [
    { code: 'TEX-MUZ', name: n('Muzlatgich 300 l', 'Холодильник 300 л'), cost: 4_200_000, price: 4_900_000, qty: 2 },
    { code: 'TEX-KIR', name: n('Kir yuvish mashinasi 7 kg', 'Стиральная машина 7 кг'), cost: 3_600_000, price: 4_200_000, qty: 2 },
    { code: 'TEX-TV43', name: n('Televizor 43"', 'Телевизор 43"'), cost: 2_900_000, price: 3_400_000, qty: 3 },
    { code: 'TEX-CHANG', name: n('Changyutgich', 'Пылесос'), cost: 900_000, price: 1_150_000, qty: 4 },
    { code: 'TEX-MIKRO', name: n("Mikroto'lqinli pech", 'Микроволновая печь'), cost: 750_000, price: 950_000, qty: 3 },
  ],
  furniture: [
    { code: 'MEB-DIVAN', name: n('Divan «Komfort»', 'Диван «Комфорт»'), cost: 3_200_000, price: 4_100_000, qty: 2 },
    { code: 'MEB-YOTOQ', name: n("Yotoqxona to'plami", 'Спальный гарнитур'), cost: 9_500_000, price: 12_000_000, qty: 1 },
    { code: 'MEB-STOL', name: n('Oshxona stoli + 4 stul', 'Кухонный стол + 4 стула'), cost: 1_800_000, price: 2_400_000, qty: 3 },
    { code: 'MEB-SHKAF', name: n('Shkaf-kupe 2 m', 'Шкаф-купе 2 м'), cost: 2_700_000, price: 3_500_000, qty: 2 },
    { code: 'MEB-MATRAS', name: n('Matras 160×200', 'Матрас 160×200'), cost: 1_300_000, price: 1_750_000, qty: 4 },
  ],
  clothing: [
    { code: 'KIY-KOYLAK', name: n("Erkaklar ko'ylagi", 'Мужская рубашка'), cost: 90000, price: 160000, qty: 10, cat: 'clothes' },
    { code: 'KIY-PLATYE', name: n("Ayollar ko'ylagi", 'Женское платье'), cost: 150000, price: 260000, qty: 8, cat: 'clothes' },
    { code: 'KIY-JINSI', name: n('Jinsi shim', 'Джинсы'), cost: 120000, price: 220000, qty: 12, cat: 'clothes' },
    { code: 'KIY-KROSS', name: n('Krossovka', 'Кроссовки'), cost: 200000, price: 350000, qty: 6, unit: 'juft', cat: 'shoes' },
    { code: 'KIY-TUFLI', name: n('Tufli', 'Туфли'), cost: 180000, price: 320000, qty: 5, unit: 'juft', cat: 'shoes' },
    { code: 'KIY-KAMAR', name: n('Kamar', 'Ремень'), cost: 40000, price: 80000, qty: 15, cat: 'accessories' },
  ],
  grocery: [
    { code: 'OZQ-NON', name: n('Non', 'Лепёшка'), cost: 3000, price: 4000, qty: 50 },
    { code: 'OZQ-SUT', name: n('Sut 1 l', 'Молоко 1 л'), cost: 9000, price: 11000, qty: 20 },
    { code: 'OZQ-TUXUM', name: n('Tuxum (10 dona)', 'Яйца (10 шт)'), cost: 13000, price: 16000, qty: 15 },
    { code: 'OZQ-GURUCH', name: n('Guruch', 'Рис'), cost: 14000, price: 17000, qty: 30, unit: 'kg' },
    { code: 'OZQ-KARTOSHKA', name: n('Kartoshka', 'Картофель'), cost: 4000, price: 6000, qty: 50, unit: 'kg' },
    { code: 'OZQ-COLA', name: n('Coca-Cola 1,5 l', 'Coca-Cola 1,5 л'), cost: 11000, price: 14000, qty: 24 },
    { code: 'OZQ-SHAKAR', name: n('Shakar', 'Сахар'), cost: 10500, price: 12500, qty: 40, unit: 'kg' },
  ],
  building: [
    { code: 'QUR-SEMENT', name: n('Sement M400 (50 kg)', 'Цемент М400 (50 кг)'), cost: 52000, price: 60000, qty: 100, unit: 'qop', cat: 'cement' },
    { code: 'QUR-ARMATURA', name: n('Armatura 12 mm', 'Арматура 12 мм'), cost: 9500, price: 11500, qty: 500, unit: 'm', cat: 'rebar' },
    { code: 'QUR-BOYOQ', name: n("Emulsiya bo'yoq 10 l", 'Водоэмульсионная краска 10 л'), cost: 140000, price: 175000, qty: 10, cat: 'paint' },
    { code: 'QUR-KRAN', name: n('Smesitel (kran)', 'Смеситель'), cost: 180000, price: 250000, qty: 6, cat: 'plumbing' },
    { code: 'QUR-KABEL', name: n('Kabel 2×2,5', 'Кабель 2×2,5'), cost: 6000, price: 8500, qty: 300, unit: 'm', cat: 'electrical' },
    { code: 'QUR-GIPS', name: n('Gipsokarton', 'Гипсокартон'), cost: 55000, price: 68000, qty: 40, unit: 'list' },
  ],
  cosmetics: [
    { code: 'KOS-ATIR', name: n('Atir 50 ml', 'Парфюм 50 мл'), cost: 250000, price: 390000, qty: 5 },
    { code: 'KOS-KREM', name: n('Yuz kremi', 'Крем для лица'), cost: 60000, price: 95000, qty: 12 },
    { code: 'KOS-SHAMPUN', name: n('Shampun 400 ml', 'Шампунь 400 мл'), cost: 35000, price: 52000, qty: 20 },
    { code: 'KOS-POMADA', name: n("Lab bo'yog'i", 'Помада'), cost: 40000, price: 70000, qty: 15 },
    { code: 'KOS-TUSH', name: n('Tush', 'Тушь'), cost: 45000, price: 75000, qty: 10 },
  ],
  pharmacy: [
    { code: 'DOR-PARA', name: n('Paratsetamol 500 mg', 'Парацетамол 500 мг'), cost: 4000, price: 6000, qty: 50, cat: 'medicines' },
    { code: 'DOR-IBU', name: n('Ibuprofen 200 mg', 'Ибупрофен 200 мг'), cost: 9000, price: 13000, qty: 30, cat: 'medicines' },
    { code: 'DOR-VITC', name: n('Vitamin C', 'Витамин C'), cost: 18000, price: 26000, qty: 20, cat: 'vitamins' },
    { code: 'DOR-NIQOB', name: n('Tibbiy niqob (50 dona)', 'Медицинские маски (50 шт)'), cost: 15000, price: 25000, qty: 20, cat: 'medicalSupplies' },
    { code: 'DOR-BINT', name: n('Bint 7×14', 'Бинт 7×14'), cost: 2500, price: 4000, qty: 40, cat: 'medicalSupplies' },
    { code: 'DOR-ANTISEP', name: n('Antiseptik 100 ml', 'Антисептик 100 мл'), cost: 8000, price: 12000, qty: 25, cat: 'hygiene' },
  ],
  auto_parts: [
    { code: 'AVT-FILTR', name: n('Moy filtri', 'Масляный фильтр'), cost: 35000, price: 55000, qty: 20 },
    { code: 'AVT-MOY', name: n('Motor moyi 5W-30', 'Моторное масло 5W-30'), cost: 70000, price: 95000, qty: 40, unit: 'l' },
    { code: 'AVT-KOLODKA', name: n('Tormoz kolodkasi', 'Тормозные колодки'), cost: 120000, price: 180000, qty: 10 },
    { code: 'AVT-AKB', name: n('Akkumulyator 60 Ah', 'Аккумулятор 60 Ач'), cost: 750000, price: 950000, qty: 4 },
    { code: 'AVT-SVECHA', name: n('Svecha', 'Свеча зажигания'), cost: 25000, price: 40000, qty: 30 },
    { code: 'AVT-ANTIFRIZ', name: n('Antifriz', 'Антифриз'), cost: 30000, price: 45000, qty: 20, unit: 'l' },
  ],
  wholesale: [
    { code: 'OPT-UN', name: n('Un 50 kg', 'Мука 50 кг'), cost: 280000, price: 310000, qty: 40, unit: 'qop' },
    { code: 'OPT-SHAKAR', name: n('Shakar 50 kg', 'Сахар 50 кг'), cost: 520000, price: 560000, qty: 20, unit: 'qop' },
    { code: 'OPT-YOG', name: n("O'simlik yog'i 5 l", 'Подсолнечное масло 5 л'), cost: 95000, price: 105000, qty: 30 },
    { code: 'OPT-CHOY', name: n('Choy (quti)', 'Чай (коробка)'), cost: 180000, price: 210000, qty: 15, unit: 'quti' },
    { code: 'OPT-MAKARON', name: n('Makaron (quti 10 kg)', 'Макароны (коробка 10 кг)'), cost: 95000, price: 110000, qty: 25, unit: 'quti' },
  ],
  'service.salon': [
    svc('SRV-SOCH', n('Soch olish', 'Стрижка'), 60000),
    svc('SRV-SOQOL', n('Soqol olish', 'Бритьё'), 40000),
    svc('SRV-BOYASH', n("Soch bo'yash", 'Окрашивание волос'), 150000),
    svc('SRV-MANIKYUR', n('Manikyur', 'Маникюр'), 80000),
    { code: 'SRV-SHAMPUN', name: n('Shampun (sotuv)', 'Шампунь (продажа)'), cost: 30000, price: 50000, qty: 10 },
  ],
  'service.auto': [
    svc('SRV-MOYALM', n('Moy almashtirish', 'Замена масла'), 50000),
    svc('SRV-DIAG', n('Diagnostika', 'Диагностика'), 100000),
    svc('SRV-BALANS', n("G'ildirak balansi", 'Балансировка колёс'), 60000),
    { code: 'SRV-MOY', name: n('Motor moyi 5W-30', 'Моторное масло 5W-30'), cost: 70000, price: 95000, qty: 20, unit: 'l' },
    { code: 'SRV-FILTR', name: n('Moy filtri', 'Масляный фильтр'), cost: 35000, price: 55000, qty: 10 },
  ],
  'service.repair': [
    svc('SRV-EKRAN', n('Ekran almashtirish', 'Замена экрана'), 150000),
    svc('SRV-BATAREYA', n('Batareya almashtirish', 'Замена батареи'), 100000),
    svc('SRV-DIAGTEL', n('Diagnostika', 'Диагностика'), 50000),
    { code: 'SRV-EKRANZAP', name: n('Ekran (ehtiyot qism)', 'Экран (запчасть)'), cost: 400000, price: 550000, qty: 3 },
    { code: 'SRV-BATZAP', name: n('Batareya (ehtiyot qism)', 'Батарея (запчасть)'), cost: 120000, price: 180000, qty: 5 },
  ],
  'service.other': [
    svc('SRV-KONS', n('Konsultatsiya', 'Консультация'), 100000),
    svc('SRV-SOAT', n('Xizmat (1 soat)', 'Услуга (1 час)'), 80000),
    svc('SRV-CHAQ', n('Chaqiruv', 'Выезд'), 50000),
    svc('SRV-YETKAZ', n('Yetkazib berish', 'Доставка'), 30000),
    { code: 'SRV-MATERIAL', name: n('Material', 'Материал'), cost: 10000, price: 15000, qty: 10 },
  ],
};

/** Sex: xom ashyo + tayyor mahsulot + 1 texkarta (profil bo'yicha) */
interface SampleRecipe {
  materials: (SampleItem & { perBatch: number; lossPct?: number })[];
  output: SampleItem;
  recipe: { name: Name; outputQty: number; operations: { name: Name; rate: number }[] };
}

const mat = (code: string, name: Name, cost: number, qty: number, unit: ProductUnit, perBatch: number, lossPct?: number) =>
  ({ code, name, cost, price: cost, qty, unit, perBatch, ...(lossPct ? { lossPct } : {}) });

export const SAMPLE_RECIPES: Record<IndustryProfile, SampleRecipe> = {
  bakery: {
    materials: [
      mat('SEX-UN', n('Un', 'Мука'), 6000, 100, 'kg', 40),
      mat('SEX-XAMIRTURUSH', n('Xamirturush', 'Дрожжи'), 40000, 2, 'kg', 0.5),
      mat('SEX-TUZ', n('Tuz', 'Соль'), 3000, 5, 'kg', 0.8),
    ],
    output: { code: 'SEX-NON', name: n('Non', 'Лепёшка'), cost: 0, price: 4000, qty: 10, unit: 'dona' },
    recipe: { name: n('Non (100 dona)', 'Лепёшка (100 шт)'), outputQty: 100, operations: [{ name: n('Non yopish', 'Выпечка'), rate: 300 }] },
  },
  furniture_shop: {
    materials: [
      mat('SEX-LDSP', n('LDSP list', 'ЛДСП лист'), 350000, 20, 'list', 1.5),
      mat('SEX-KROMKA', n('Kromka', 'Кромка'), 3000, 200, 'm', 18, 5),
      mat('SEX-FURNITURA', n("Furnitura to'plami", 'Комплект фурнитуры'), 50000, 20, 'dona', 1),
    ],
    output: { code: 'SEX-SHKAF', name: n('Shkaf (2 eshikli)', 'Шкаф (2 двери)'), cost: 0, price: 2_500_000, qty: 1, unit: 'dona' },
    recipe: {
      name: n('Shkaf (2 eshikli)', 'Шкаф (2 двери)'),
      outputQty: 1,
      operations: [{ name: n('Bichish', 'Раскрой'), rate: 50000 }, { name: n("Yig'ish", 'Сборка'), rate: 100000 }],
    },
  },
  sewing: {
    materials: [
      mat('SEX-MATO', n('Mato', 'Ткань'), 25000, 300, 'm', 1.8, 5),
      mat('SEX-IP', n('Ip', 'Нитки'), 5000, 50, 'dona', 0.1),
      mat('SEX-TUGMA', n('Tugma', 'Пуговица'), 300, 1000, 'dona', 7),
    ],
    output: { code: 'SEX-KOYLAK', name: n("Ko'ylak", 'Рубашка'), cost: 0, price: 150000, qty: 5, unit: 'dona' },
    recipe: {
      name: n("Ko'ylak", 'Рубашка'),
      outputQty: 1,
      operations: [{ name: n('Bichish', 'Раскрой'), rate: 5000 }, { name: n('Tikish', 'Пошив'), rate: 15000 }],
    },
  },
  meat: {
    materials: [
      mat('SEX-GOSHT', n("Mol go'shti", 'Говядина'), 95000, 50, 'kg', 9, 5),
      mat('SEX-ZIRAVOR', n('Ziravor', 'Специи'), 60000, 5, 'kg', 0.3),
      mat('SEX-QOBIQ', n('Qobiq', 'Оболочка'), 4000, 200, 'm', 12),
    ],
    output: { code: 'SEX-KOLBASA', name: n('Kolbasa', 'Колбаса'), cost: 0, price: 140000, qty: 5, unit: 'kg' },
    recipe: { name: n('Kolbasa (10 kg)', 'Колбаса (10 кг)'), outputQty: 10, operations: [{ name: n('Tayyorlash', 'Приготовление'), rate: 3000 }] },
  },
  plastics_building: {
    materials: [
      mat('SEX-GRANULA', n('Granula', 'Гранулы'), 18000, 500, 'kg', 30, 2),
      mat('SEX-BOYOQ', n("Bo'yoq (pigment)", 'Краситель'), 45000, 20, 'kg', 0.5),
    ],
    output: { code: 'SEX-IDISH', name: n('Plastik idish', 'Пластиковая ёмкость'), cost: 0, price: 25000, qty: 20, unit: 'dona' },
    recipe: { name: n('Plastik idish (100 dona)', 'Пластиковая ёмкость (100 шт)'), outputQty: 100, operations: [{ name: n('Quyish', 'Литьё'), rate: 500 }] },
  },
  other_production: {
    materials: [
      mat('SEX-XOMA', n('Xom ashyo A', 'Сырьё A'), 10000, 100, 'kg', 5),
      mat('SEX-XOMB', n('Xom ashyo B', 'Сырьё B'), 2000, 200, 'dona', 10),
    ],
    output: { code: 'SEX-TAYYOR', name: n('Tayyor mahsulot', 'Готовое изделие'), cost: 0, price: 50000, qty: 5, unit: 'dona' },
    recipe: { name: n('Tayyor mahsulot (10 dona)', 'Готовое изделие (10 шт)'), outputQty: 10, operations: [{ name: n("Yig'ish", 'Сборка'), rate: 3000 }] },
  },
};

/**
 * Restoran namunasi: xom ashyo — omborda (menyuda emas); taomlar — retsept bilan (`bundle`, 1 porsiyaga xom ashyo
 * asosiy birlikda: kg, l); non va ichimlik — tayyor tovar (omborda va menyuda); choy — retseptsiz xizmat.
 * `drink` — bar stansiyasiga (bo'lmasa — oshxona); `noStation` — stansiyasiz (yuborilganda darhol beriladi).
 */
export interface SampleDish { code: string; name: Name; price: number; recipe: [string, number][] }
export const SAMPLE_RESTAURANT: {
  raw: SampleItem[];
  dishes: SampleDish[];
  goods: (SampleItem & { noStation?: boolean })[];
  services: SampleItem[];
} = {
  raw: [
    { code: 'RES-GURUCH', name: n('Guruch', 'Рис'), cost: 16000, price: 0, qty: 25, unit: 'kg' },
    { code: 'RES-GOSHT', name: n("Mol go'shti", 'Говядина'), cost: 95000, price: 0, qty: 10, unit: 'kg' },
    { code: 'RES-SABZI', name: n('Sabzi', 'Морковь'), cost: 5000, price: 0, qty: 15, unit: 'kg' },
    { code: 'RES-PIYOZ', name: n('Piyoz', 'Лук'), cost: 4000, price: 0, qty: 10, unit: 'kg' },
    { code: 'RES-YOG', name: n("O'simlik yog'i", 'Подсолнечное масло'), cost: 22000, price: 0, qty: 10, unit: 'l' },
    { code: 'RES-UN', name: n('Un', 'Мука'), cost: 7000, price: 0, qty: 25, unit: 'kg' },
    { code: 'RES-POMIDOR', name: n('Pomidor', 'Помидоры'), cost: 12000, price: 0, qty: 5, unit: 'kg' },
    { code: 'RES-BODRING', name: n('Bodring', 'Огурцы'), cost: 10000, price: 0, qty: 5, unit: 'kg' },
  ],
  dishes: [
    { code: 'RES-OSH', name: n('Osh', 'Плов'), price: 45000, recipe: [['RES-GURUCH', 0.15], ['RES-GOSHT', 0.1], ['RES-SABZI', 0.1], ['RES-YOG', 0.03], ['RES-PIYOZ', 0.03]] },
    { code: 'RES-LAGMON', name: n("Lag'mon", 'Лагман'), price: 38000, recipe: [['RES-UN', 0.12], ['RES-GOSHT', 0.08], ['RES-PIYOZ', 0.03], ['RES-POMIDOR', 0.05], ['RES-YOG', 0.02]] },
    { code: 'RES-SOMSA', name: n('Somsa', 'Самса'), price: 12000, recipe: [['RES-UN', 0.08], ['RES-GOSHT', 0.05], ['RES-PIYOZ', 0.03], ['RES-YOG', 0.01]] },
    { code: 'RES-ACHCHIQ', name: n('Achchiq-chuchuk', 'Ачичук'), price: 15000, recipe: [['RES-POMIDOR', 0.15], ['RES-BODRING', 0.1], ['RES-PIYOZ', 0.03]] },
  ],
  goods: [
    { code: 'RES-NON', name: n('Non', 'Лепёшка'), cost: 3000, price: 5000, qty: 40, noStation: true },
    { code: 'RES-COLA', name: n('Coca-Cola 0,5 l', 'Coca-Cola 0,5 л'), cost: 6500, price: 10000, qty: 24, drink: true },
  ],
  services: [{ ...svc('RES-CHOY', n("Ko'k choy (choynak)", 'Зелёный чай (чайник)'), 8000), cost: 1500, drink: true }],
};

export const SAMPLE_PREFIX = 'NAMUNA-';

/* ───────────────────────────── yozish ───────────────────────────── */

export interface SetupCtx {
  m: TenantModels;
  user: SessionUser;
  orgId: string;
  orgSlug: string;
  orgName: string;
  businessType: string;
  features: OrgFeatures;
  perms: ReadonlySet<PermissionKey>;
  d: Dict;
  locale: Locale;
}

/** Kategoriya (yuqori daraja, nom bo'yicha katta-kichik harfsiz) — bo'lmasa yaratadi; id qaytaradi */
export async function ensureCategory(ctx: Pick<SetupCtx, 'm' | 'user'>, name: string): Promise<Types.ObjectId> {
  const { ProductCategory } = ctx.m;
  const find = () => ProductCategory.findOne({ parentId: null, name }).collation(CATALOG_COLLATION).select('_id').lean();
  const found = await find();
  if (found) return found._id;
  try {
    const c = await ProductCategory.create({ name, parentId: null, createdBy: ctx.user.username });
    return c._id;
  } catch (err) {
    // Parallel yaratilgan (unikal indeks)
    const again = await find();
    if (again) return again._id;
    throw err;
  }
}

/** Bitta namuna mahsulot (itemCode bo'yicha idempotent). Yangi yaratilsa — id, bor bo'lsa — mavjud id */
async function ensureSampleProduct(
  ctx: SetupCtx,
  item: SampleItem,
  branchId: string,
  extra: {
    categoryId?: Types.ObjectId; category?: string; expiryDate?: Date;
    /** Restoran: menyuda yoki yo'q (Product.menuItem) */
    menuItem?: boolean;
    /** Restoran: retseptli taom (bundle) */
    bundleItems?: { productId: string; qty: number }[];
  } = {},
): Promise<{ id: string; created: boolean }> {
  const { Product } = ctx.m;
  const itemCode = `${SAMPLE_PREFIX}${item.code}`;
  const existing = await Product.findOne({ itemCode }).setOptions({ withDeleted: true }).select('_id').lean();
  if (existing) return { id: String(existing._id), created: false };
  const goods = (item.kind ?? 'goods') === 'goods' && !extra.bundleItems;
  const doc = await Product.create({
    productId: generateProductCode(),
    itemCode,
    imei: generateSku(),
    kind: extra.bundleItems ? 'bundle' : item.kind ?? 'goods',
    ...(extra.bundleItems ? { bundleItems: extra.bundleItems } : {}),
    ...(extra.menuItem !== undefined ? { menuItem: extra.menuItem } : {}),
    name: item.name[ctx.locale],
    purchasePrice: item.cost,
    salePrice: item.price,
    trackQuantity: goods,
    quantity: goods ? item.qty ?? 1 : 1,
    soldQuantity: 0,
    status: 'in_stock',
    branchId,
    unit: item.unit ?? 'dona',
    ...(extra.categoryId ? { categoryId: extra.categoryId, category: extra.category } : {}),
    ...(extra.expiryDate ? { expiryDate: extra.expiryDate } : {}),
    createdBy: ctx.user.username,
    history: [{ action: 'created', detail: ctx.d.onboarding.sampleTag, by: ctx.user.username, at: new Date() }],
  });
  return { id: String(doc._id), created: true };
}

export interface SampleResult {
  products: number;
  tables: number;
  recipes: number;
}

/**
 * Namuna ma'lumot. Xato bo'lsa — tashlanadi (chaqiruvchi log qiladi). Takror chaqirish xavfsiz.
 * `warehouses` — sex omborlari (bo'lsa: xom ashyo — asosiy, tayyor — ikkinchisi).
 */
export async function seedSampleData(
  ctx: SetupCtx,
  plan: Pick<OnboardingPlan, 'categories' | 'restaurant' | 'industryProfile'>,
  opts: { serviceKind?: string; finishedBranchId?: string | null } = {},
): Promise<SampleResult> {
  const res: SampleResult = { products: 0, tables: 0, recipes: 0 };
  const mainId = await ensureMainBranchId(ctx.m.Branch);
  const bt = ctx.businessType;

  if (bt === 'restaurant') return seedRestaurant(ctx, res);
  if (bt === 'manufacturing') return seedManufacturing(ctx, res, plan.industryProfile ?? 'other_production', mainId, opts.finishedBranchId ?? mainId);

  const listKey = bt === 'service' ? `service.${opts.serviceKind ?? 'other'}` : bt;
  const items = SAMPLE_PRODUCTS[listKey] ?? SAMPLE_PRODUCTS.general;
  // Kategoriya tanlovi bo'lgan turda — tanlanmagan kategoriyadagi namuna o'tkazib yuboriladi (masalan, faqat kiyim)
  const allowed = new Set(plan.categories);
  const expiry = bt === 'pharmacy' ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) : undefined;
  for (const item of items) {
    if (item.cat && allowed.size && !allowed.has(item.cat)) continue;
    let cat: { categoryId?: Types.ObjectId; category?: string } = {};
    if (item.cat && allowed.has(item.cat)) {
      const name = ctx.d.onboarding.categories[item.cat];
      cat = { categoryId: await ensureCategory(ctx, name), category: name };
    }
    const r = await ensureSampleProduct(ctx, item, mainId, { ...cat, ...(expiry ? { expiryDate: expiry } : {}) });
    if (r.created) res.products++;
  }
  return res;
}

async function seedRestaurant(ctx: SetupCtx, res: SampleResult): Promise<SampleResult> {
  const setup = await import('./restaurant/setup');
  const { ensureMenuFlags } = await import('./restaurant/menuFlags');
  const rctx = { user: ctx.user, orgId: ctx.orgId, orgSlug: ctx.orgSlug, m: ctx.m, perms: ctx.perms, features: ctx.features, d: ctx.d, via: ' (namuna)' };
  const stations = await ctx.m.KitchenStation.find({ active: true }).select('_id kind').lean();
  const kitchenId = stations.find((s) => s.kind === 'kitchen')?._id;
  const barId = stations.find((s) => s.kind === 'bar')?._id ?? kitchenId;
  const mainId = await ensureMainBranchId(ctx.m.Branch);
  const S = SAMPLE_RESTAURANT;
  // Menyu belgilari rejimi (yangi do'kon — migratsiya bo'sh, faqat versiya qo'yiladi)
  await ensureMenuFlags(ctx.m);

  // Taom/tovar/xizmat menyuga: stansiya (ichimlik — bar, non — stansiyasiz, qolgan — oshxona)
  const toMenu = async (id: string, drink?: boolean, noStation?: boolean) => {
    const st = noStation ? undefined : drink ? barId : kitchenId;
    if (st && ctx.features.tables) {
      const u = await setup.updateMenuItem(rctx, id, { stationId: String(st) });
      if (!u.ok) throw new Error(`menu item: ${u.code}`);
    }
  };

  // 1) Xom ashyo — omborda, menyuda emas
  const rawIds = new Map<string, string>();
  for (const item of S.raw) {
    const r = await ensureSampleProduct(ctx, item, mainId, { menuItem: false });
    rawIds.set(item.code, r.id);
    if (r.created) res.products++;
  }
  // 2) Taomlar — retsept bilan (o'z qoldig'i yo'q; tannarx — retseptdan)
  for (const dish of S.dishes) {
    const bundleItems = dish.recipe.map(([code, qty]) => ({ productId: rawIds.get(code)!, qty }));
    const cost = dish.recipe.reduce((sum, [code, qty]) => sum + Math.round((S.raw.find((x) => x.code === code)?.cost ?? 0) * qty), 0);
    const r = await ensureSampleProduct(ctx, { code: dish.code, name: dish.name, cost, price: dish.price, kind: 'goods' }, mainId, { menuItem: true, bundleItems });
    if (!r.created) continue;
    res.products++;
    await toMenu(r.id);
  }
  // 3) Tayyor tovar (omborda va menyuda) va xizmat (choy)
  for (const item of [...S.goods, ...S.services]) {
    const r = await ensureSampleProduct(ctx, item, mainId, { menuItem: true });
    if (!r.created) continue;
    res.products++;
    await toMenu(r.id, item.drink, 'noStation' in item ? !!item.noStation : false);
  }

  // Zal + 4 stol (stollar moduli yoqiq bo'lsa)
  if (ctx.features.tables) {
    const hallName = ctx.d.onboarding.restaurant.hall;
    const hall = await ctx.m.Hall.findOne({ name: hallName }).select('_id').lean();
    let hallId = hall ? String(hall._id) : null;
    if (!hallId) {
      const h = await setup.saveHall(rctx, { name: hallName });
      if (!h.ok) throw new Error(`hall: ${h.code}`);
      hallId = h.data.id;
    }
    const t = await setup.createTablesRange(rctx, { hallId, from: 1, to: 4, seats: 4 });
    if (!t.ok) throw new Error(`tables: ${t.code}`);
    res.tables = t.data.created;
  }
  return res;
}

async function seedManufacturing(ctx: SetupCtx, res: SampleResult, profile: IndustryProfile, rawId: string, finishedId: string): Promise<SampleResult> {
  const s = SAMPLE_RECIPES[profile] ?? SAMPLE_RECIPES.other_production;
  const matIds: { id: string; qty: number; lossPct?: number }[] = [];
  for (const m of s.materials) {
    const r = await ensureSampleProduct(ctx, m, rawId);
    if (r.created) res.products++;
    matIds.push({ id: r.id, qty: m.perBatch, lossPct: m.lossPct });
  }
  const out = await ensureSampleProduct(ctx, s.output, finishedId);
  if (out.created) res.products++;

  // Texkarta — «Ishlab chiqarish» moduli yoqiq bo'lsa (tarif ruxsat bergan doirada)
  if (!ctx.features.production) return res;
  const name = s.recipe.name[ctx.locale];
  if (await ctx.m.Recipe.exists({ name })) return res;
  const { saveRecipe } = await import('./production/recipes');
  const pctx = { user: ctx.user, orgId: ctx.orgId, orgName: ctx.orgName, m: ctx.m, perms: ctx.perms, features: ctx.features, d: ctx.d, via: ' (namuna)' };
  const r = await saveRecipe(pctx, {
    name,
    outputProductId: out.id,
    outputQty: s.recipe.outputQty,
    items: matIds.map((x) => ({ productId: x.id, qty: x.qty, ...(x.lossPct ? { lossPct: x.lossPct } : {}) })),
    operations: s.recipe.operations.map((o) => ({ name: o.name[ctx.locale], rate: o.rate })),
  });
  if (!r.ok) throw new Error(`recipe: ${r.code}`);
  res.recipes = 1;
  return res;
}
