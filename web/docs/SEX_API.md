# Ishlab chiqarish sexi va ombor kirimi — backend API (UI agentlari uchun)

Sana: 2026-11-18. Asos: `docs/business/TAKLIF_2026-11_SHABLONLAR.md` §2 (MVP + 2-faza backend qismi: texkarta, akt,
tannarx, kirim akti, birlik konvertatsiyasi, minimal qoldiq, ishbay, yetkazib beruvchiga buyurtma).
Bu hujjat va `lib/production/*` kodi — UI sahifalari (`/app/production`, `/app/production/recipes`, `/app/receipts`,
`/app/purchase-orders`, `/app/piecework`, mobil ilova) uchun YAGONA manba.
**2-bosqich (2026-11-18, kechqurun):** akt muddati va mijoz buyurtmasi, qator id'larini saqlash, optimistik qulf, barcha
omborlar ro'yxati, ishchilar (akt uchun), Toshkent kuni (§6.16), ishbay birligi va mobil tuzatish, yaroqlilik muddati
ogohlantirishi, «Kam qolgan» → forma, demo seed (§14).
Arxitektura restoran moduli bilan bir xil (`docs/RESTORAN_API.md`): context/session/inputs/ops/queries.

---

## 0. Qisqacha

| Nima | Qayerda |
|---|---|
| Sof hisob: birlik konvertatsiyasi, ehtiyoj, yo'qotish, tannarx, o'rtacha narx, holatlar, ishbay jamlamasi (client'da ham) | `lib/production/calc.ts` |
| Kontekst, xato kodlari, huquq/modul tekshiruvi | `lib/production/context.ts` |
| Sessiya/API/mobil → ctx, `toResponse`, `toAction` | `lib/production/session.ts` |
| Kirish sxemalari (zod) | `lib/production/inputs.ts` |
| Barqaror kod, atomik sarf, kirim + o'rtacha tannarx | `lib/production/stock.ts` |
| Filial doirasi, hujjat qulfi, audit, sahifalash | `lib/production/common.ts` |
| Texkarta (CRUD, versiya, ehtiyoj, taxminiy tannarx) | `lib/production/recipes.ts` |
| Ishlab chiqarish akti | `lib/production/orders.ts` |
| Kirim akti (+ nakladnoy, PO → kirim) | `lib/production/receipts.ts` |
| Yetkazib beruvchiga buyurtma (PO) | `lib/production/purchaseOrders.ts` |
| Ishbay | `lib/production/piecework.ts` |
| Mahsulot tanlash, minimal qoldiq, ombor sozlamalari, meta | `lib/production/catalog.ts` |
| Kunlik minimal qoldiq ogohlantirishi | `lib/production/lowStock.ts` (cron `daily-summary`) |
| Server action'lar | `app/actions/production.ts`, `app/actions/receipts.ts` |
| Web JSON GET | `app/api/production/*` |
| Mobil REST | `app/api/mobile/production/*` |
| Lug'at | `lib/i18n/dict/production.ts` → `d.production.*` |
| Testlar | `tests/productionLogic.test.ts`, `tests/productionFlow.test.ts` (MongoDB), `tests/productionUi.test.ts` |
| Demo sex (lokal dev) | `scripts/seed-demo-sex.mjs` → `npm run seed:sex` (§14) |

---

## 1. Biznes turi, profil, birliklar, modullar, menyu

**Biznes turi** `manufacturing` — «Ishlab chiqarish sexi» (`BUSINESS_TYPE_IDS` oxiriga qo'shildi, ikonka `building`,
TERMS: Mahsulot / Ombor / «Artikul / kod», mahsulot maydonlari: kategoriya + birlik). `wholesale` yorlig'i →
«Optom savdo / distribyutor» (id o'zgarmadi).

**Sex profili** — `Organization.industryProfile?` (master): `furniture_shop | sewing | bakery | meat | plastics_building |
other_production` (`lib/businessTypes.ts → INDUSTRY_PROFILES`, nomlar `d.catalog.industryProfiles`, tavsiya birliklar
`INDUSTRY_PROFILE_UNITS`). Faqat `manufacturing` turida saqlanadi (`parseIndustryProfile`), boshqa turga o'tilsa
tozalanadi (`lib/orgUpdate.ts`). Saqlash yo'llari: super admin tahrir formasi (`OrgEditForm` — tur «sex» bo'lsa select
chiqadi) va `updateOrganizationAction`, `applyBusinessPresetAction`, super admin «yangi do'kon», web ro'yxatdan o'tish
(`formData.industryProfile`), mobil `POST /api/mobile/auth/register` (`industryProfile`), mobil
`PATCH /api/mobile/org` (`{ businessType, industryProfile? }`; `GET` → `profiles[]`). Profil hozircha faqat birlik
tavsiyasi va ma'lumot uchun — preset biznes turi bo'yicha.

**Birliklar** (`PRODUCT_UNITS` oxiriga): `list`, `rulon`, `m3`, `t`, `juft`. Kasr (`lib/qty.ts → FRACTIONAL_UNITS`):
`list`, `rulon`, `m3`, `t` (sexda qismi sarflanadi: 0,25 list); `juft` — butun. Lug'at `d.stock.fields.units`,
Excel import sinonimlari (`лист`, `рулон`, `м³`, `тонна`, `пара`…).

**Modullar** (`lib/featureKeys.ts`, `lib/features.ts`, standart hamma tarifda o'chiq — preset yoqadi):

| Kalit | Nima | Preset yoqa oladigan tarif |
|---|---|---|
| `production` | texkarta, ishlab chiqarish akti, tannarx | Starter+ |
| `purchasing` | kirim akti, yetkazib beruvchiga buyurtma, minimal qoldiq | Starter+ |
| `piecework` | ishbay haq | Pro+ |

`BUSINESS_FEATURE_PRESETS.manufacturing` = SMART + production, purchasing, piecework, inventory, transferred, daftar;
variant/creditKassa — o'chiq. `wholesale` presetiga `purchasing` qo'shildi.

**Menyu** (`lib/navConfig.ts`, yangi bo'lim «Ishlab chiqarish», ikonka `building`; modul o'chiq do'konda ko'rinmaydi):

| Yo'l | Nomi | Modul | Huquq |
|---|---|---|---|
| `/app/production` | Ishlab chiqarish | production | production.view |
| `/app/production/recipes` | Texkartalar | production | production.view |
| `/app/receipts` | Kirim | purchasing | receipt.create |
| `/app/purchase-orders` | Xaridlar | purchasing | po.manage |
| `/app/piecework` | Ishbay | piecework | piecework.log |

Eslatma: menyu faolligi prefiks bo'yicha — `/app/production/recipes` ochiq bo'lsa «Ishlab chiqarish» ham faol
ko'rinadi. Akt sahifasini `/app/production/<id>` da qiling.

---

## 2. Barqaror mahsulot kodi (MUHIM qaror)

Kodda `Product.productId` (PRD-…) va `imei` butun do'kon bo'yicha **noyob** — bir tovarning har filialdagi nusxasi alohida
hujjat, o'z `productId`'si bilan. Shuning uchun `productId` filialdan mustaqil kod bo'la olmaydi (TAKLIF §2.7 muammosi).

Yechim: **`Product.itemCode`** (katta harf, ≤40, noyob emas, indeks `{ itemCode, branchId }`):
- Birinchi marta texkarta/kirim/xaridda mahsulotga o'rnatiladi: `itemCode = productId` (yo'q bo'lsa yangi PRD-kod) —
  `lib/production/stock.ts → ensureItemCode`. `codeOf(p) = itemCode || productId`.
- Texkarta, akt, kirim va PO qatorlari `code` saqlaydi; ishlatilganda shu filialdagi hujjat
  `findStockDoc(code, branchId)` bilan topiladi (avval «omborda», keyin eng eski; itemCode'i yo'q eski hujjat — `productId`
  bo'yicha).
- Boshqa filialga kirim yoki tayyor mahsulot chiqishida nusxa topilmasa — **shablondan yangi hujjat** yaratiladi: yangi
  `productId`/SKU (`imei`), o'sha `itemCode`, nom, birlik, kategoriya, shtrix-kod, sotuv narxi, xarid birligi.
  Shtrix-kodi bir xil, `itemCode`'i yo'q nusxa bo'lsa — u bog'lanadi (yangisi yaratilmaydi).
- UI: mahsulot tanlashda `GET /api/production/products?branchId=` (o'sha ombordagi hujjatlar). Kod `ProductOption.code`.

---

## 3. Huquqlar va rollar

`PERMISSIONS_VERSION = 4`. Yangi huquqlar (`lib/permissions.ts`, sahifalar `production`, `receipts`, `piecework`):

| Kalit | Nomi | Modul | Meros (v3 va eski aniq ro'yxatlar) | Filial standarti | Ishlatiladi |
|---|---|---|---|---|---|
| `production.view` | Ishlab chiqarishni ko'rish | production | `products.view` | ✓ | aktlar, texkartalar, ehtiyoj (tannarxsiz) |
| `production.manage` | Ishlab chiqarish akti | production | — | — | akt ochish/tahrir/boshlash/bajarildi/bekor |
| `recipe.manage` | Texkartalar | production | — | — | texkarta yaratish/tahrir/arxiv |
| `production.viewCost` | Tannarxni ko'rish | production | `product.viewCost` | ✓ | akt va texkarta tannarxi, ehtiyojda narx |
| `receipt.create` | Kirim akti | purchasing | `product.create` | ✓ | kirim qoralamasi, post, PO → kirim |
| `po.manage` | Yetkazib beruvchiga buyurtma | purchasing | `suppliers.manage` | — | PO yaratish/yuborish/bekor |
| `piecework.log` | Ishbay yozish | piecework | `open` (hammaga) | ✓ | o'zi uchun yozish, o'z yozuvlari |
| `piecework.approve` | Ishbayni tasdiqlash va to'lash | piecework | — | — | hammaning yozuvlari, tasdiq/rad, to'lov, ishchilar ro'yxati |

Bog'liq mavjud huquqlar: **kirim/xarid narxlari** — `product.viewCost` (bo'lmasa narxlar `null`, kiritilgani e'tiborsiz);
**kirimda to'lov (`paidNow`)** — `suppliers.manage` + `product.viewCost`; **ombor sozlamalari** (minimal qoldiq, xarid
birligi) — `product.edit`; brak/qoldiq hisobdan chiqarish — `stock.writeOff` (yangi sabab `offcut`).

**Rol shablonlari** (`MANUFACTURING_ROLES`, `lib/models/tenant/Role.ts`; `ensureDefaultRoles(Role, 'manufacturing')`
NOMI bo'yicha yo'qlarini qo'shadi — restoran kabi, `/app/users` va `/app/roles` sahifalari chaqiradi):

| Rol | Huquqlar (qisqa) |
|---|---|
| Omborchi | ombor, mahsulot qo'shish, transfer, inventar, hisobdan chiqarish, **kirim akti**, ishlab chiqarishni ko'rish; narx/tannarx **yo'q** |
| Sex boshlig'i | akt, texkarta, ishbay yozish/tasdiqlash, ombor ko'rish, transfer, hisobdan chiqarish, topshiriqlar; tannarx — yo'q |
| Usta / ishchi | ishbay yozish (faqat o'zi), aktlarni ko'rish (operatsiya tanlash uchun); `production.view` sabab kirim aktlarini ham **ko'radi** (narxsiz, §9) |
| Hisobchi | tannarx, kelish narxi, yetkazib beruvchilar (qarz, to'lov), kirim, xarid, ishbay to'lovi, hisobot, eksport; sotuv yo'q |

**Kirish doirasi** (filial xodimi, `role: 'user'`):
- Akt: ko'radi — xom ashyo yoki tayyor mahsulot ombori o'ziniki bo'lganlarni; o'zgartiradi — faqat xom ashyo ombori
  o'ziniki bo'lsa (o'z omboridan chiqaradi). Tayyor mahsulot omborini istalgan faol filialga qo'yishi mumkin
  («filialga berish» kabi) — tanlov ro'yxati `ProductionMeta.toBranches` (barcha faol omborlar).
- Texkarta: xom ashyo — o'z filialidagi hujjatlar; **tayyor mahsulot** — istalgan filialdagi hujjat (faqat kodi/nomi/birligi
  olinadi; texkarta ko'rinishida `outputProductId` ham doiradan tashqaridan topiladi) — tayyor mahsulot ombori boshqa
  filialda bo'lgan texkartani filial xodimi tahrirlay oladi.
- Kirim, PO — faqat o'z filiali; mahsulot tanlash — o'z filialidagi hujjatlar.
- Ishbay: `piecework.log` — faqat o'z yozuvlari; `piecework.approve` — o'z filiali ishchilari.

---

## 4. Ma'lumot modeli (tenant baza)

### Product (+ maydonlar)
```
itemCode?        barqaror kod (§2)
purchaseUnit?    xarid birligi (masalan 'qop')      purchaseFactor?  1 xarid birligi = N asosiy birlik (50)
minStock?        minimal qoldiq (asosiy birlikda; shu filial hujjati uchun)
history.action   + 'consumed' (ishlab chiqarishga sarflandi), 'produced' (ishlab chiqarildi)
```
Xarid birligi — tovar xususiyati: admin o'zgartirsa shu kodli boshqa filial nusxalariga ham yoziladi.

### Recipe (`recipes`) — texkarta
```
name, mode: production|onSale (hozir production), outputCode, outputName, unit (tayyor mahsulot birligi)
outputQty        texkarta shu miqdor uchun (partiya: 10 non)
items[{ code, name, qty (outputQty uchun, asosiy birlikda, yo'qotishsiz), unit, lossPct 0–90 }]
operations[{ name, rate (1 BIRLIK tayyor mahsulot uchun, so'm), normMin? }]
overheadPerUnit  1 birlikka ustama (so'm)
version, prevVersions[{ version, outputQty, items, operations, overheadPerUnit, changedAt, changedBy }] (oxirgi 20)
active, note, createdBy, updatedBy
```
Diqqat: `items[].qty` — **partiya** (`outputQty`) uchun; `rate` va `overheadPerUnit` — **1 birlik** uchun.

### ProductionOrder (`production_orders`) — akt
```
docNo "P20261118-0001", status draft|in_progress|done|cancelled
recipeId, recipeSnapshot { recipeId, name, version, outputCode, outputName, outputQty, unit, items, operations, overheadPerUnit }
plannedQty, producedQty?, scrapQty?, fromBranchId (xom ashyo ombori), toBranchId (tayyor mahsulot ombori)
materials[{ _id, code, productId?, name, unit, plannedQty, actualQty, unitCost?, cost?, extra? }]
labor[{ _id, operation, workerId?, workerName?, qty, rate, amount }], laborManual?
materialsCost, laborCost, overheadCost, costTotal, unitCost, scrapCost (bajarilganda)
outputProductId?, scrapDocNo?, note, clientId? (noyob), createdBy, startedAt/By, completedAt/By, cancelledAt/By/Reason
dueDate? (topshirish muddati — kalendar kuni, UTC yarim tunda), customerRef? (mijoz buyurtmasi, ≤160)
postingAt? (qulf), rev (optimistik)
```
Indeks: `{ status, dueDate }` (faqat muddatli aktlar).

### GoodsReceipt (`goods_receipts`) — kirim akti
```
docNo "K20261118-0001", status draft|posted|cancelled
supplierId?, supplierName?, branchId, purchaseOrderId?, purchaseOrderNo?, supplierInvoiceNo?, invoiceDate?
lines[{ _id, productId, code, name, qty, unit (kiritilgan), factor, baseQty, baseUnit, price? (kiritilgan birlik narxi),
        amount? (= price × qty), expiryDate?, poLineId? }]
total, paidNow, note, clientId? (noyob), createdBy, postedAt/By, cancelledAt/By, purchaseEntryId?, paymentEntryId?, postingAt?, rev
```
Post qilingach `lines[].productId` — **kirim bo'lgan** hujjat (aktning filialida).

### PurchaseOrder (`purchase_orders`) — xarid
```
docNo "Z20261118-0001", status draft|sent|partial|received|cancelled
supplierId, supplierName, branchId (qabul ombori), expectedAt?, note, clientId?
lines[{ _id, productId, code, name, qty, unit, factor, baseUnit, price?, amount?, receivedQty (qator birligida) }]
total, createdBy, sentAt/By, receivedAt, cancelledAt/By, rev
```

### PieceworkEntry (`piecework_entries`) — ishbay
```
workerId (User), workerName, branchId?, productionOrderId?, productionOrderNo?, operation, qty, unit?, rate, amount (= qty × rate)
status logged|approved|rejected|paid, workDate, note, clientId? (ishchi ichida noyob), loggedBy
approvedBy/At, rejectedBy/At, rejectReason, paidBy/At, cashFlowId, payoutId
```
`unit` — aktga bog'langan yozuvda texkarta tayyor mahsuloti birligi (operatsiya narxi 1 shu birlikka): **dona/juft — butun**
(`2,5` → `badQty`), kg/m/list… — kasr; aktsiz yozuvda yo'q (kasr ruxsat).

### Boshqa o'zgarishlar
- `StockAdjustment.reason` + `production_scrap` (akt brakı, avtomatik), `offcut` (bichim qoldig'i; qo'lda hisobdan
  chiqarishda ham qabul qilinadi — `writeOffAction`; forma tugmasi UI agentida). Lug'at `d.stock.adjust.reasons`.
- `SupplierEntry.receiptId?` — kirim akti yozuvi (qarz hisobi `sumSupplierEntries` o'zgarmadi).
- `AuditLog.entity` + `production` (texkarta, akt, ishbay), `purchase` (kirim, PO). Lug'at `d.crm.audit.entities`.
- `Organization.industryProfile?` (§1). `TENANT_MODELS_VERSION = 21` (akt muddati/mijoz, ishbay birligi).
- `ShopSettings.stock.expiryWarnDays` (ro'yxatdan o'tish ustasi yozadi) — §6.14.

---

## 5. Holatlar

```
Akt:      draft ──start──► in_progress ──bajarildi──► done
            │ └──────────bajarildi──────────────────►┘
            └──bekor (draft/in_progress)──► cancelled       (done — qaytarib bo'lmaydi, §6.9)
Kirim:    draft ──post──► posted ;  draft ──bekor──► cancelled
PO:       draft ──send──► sent ──qabul (kirim post)──► partial ──► received
          draft/sent/partial ──bekor──► cancelled  (tahrir: draft/sent, qabul bo'lmagan bo'lsa)
Ishbay:   logged ──tasdiq──► approved ──to'lov──► paid ;  logged ──rad──► rejected
```
`calc.ts`: `productionAllows`, `receiptAllows`, `poAllows`, `pieceworkAllows`, `poStatusAfterReceipt`. Ko'rinishlarda
`can` obyekti tayyor — UI tugmalarini shundan chizing.

---

## 6. Asosiy qoidalar (backend kafolatlaydi)

1. **Ehtiyoj:** `requiredQty = itemQty × (plannedQty / outputQty) × (1 + lossPct/100)`; butun birlikda (dona) yuqoriga
   butunlanadi, kasrlida 0,001 gacha yuqoriga. Misol: 10 non uchun 4 kg un, 5% → 25 non: 10,5 kg.
2. **Akt ochilganda** texkarta nusxasi saqlanadi; xom ashyo rejasi (haqiqiy = reja), ish haqi = operatsiya narxi × reja.
   Reja o'zgarsa — texkarta qatorlari rejasi qayta hisoblanadi, lekin **qator `_id` lari saqlanadi** (shu so'rovdagi
   `materials: [{ id, actualQty }]` ham to'g'ri qatorga tushadi); haqiqiy sarfi qo'lda tuzatilgan qator (haqiqiy ≠ eski reja)
   o'sha qiymatda qoladi, tuzatilmagani — yangi rejaga teng; qo'shimcha qatorlar qoladi; ish haqi — qo'lda
   tahrirlanmagan bo'lsa (`laborManual`). **Optimistik qulf:** `expectedRev` (UI — `OrderView.rev`) mos kelmasa `conflict`
   (UI xabar berib qayta yuklaydi); «bajarildi»da ham `expectedRev` qabul qilinadi.
3. **Haqiqiy sarf:** `materials: [{ id, actualQty }]` — mavjud qator; `[{ productId, actualQty }]` (id'siz) — qo'shimcha
   qator (almashtirish; shu ombordagi sanaladigan tovar). 0 — ishlatilmadi. Farq ko'rinishda `variance`.
4. **«Bajarildi»** (hammasi yoki hech biri):
   - qulf (`postingAt`): ikkinchi bosish — `locked`; jarayon uzilsa 10 daqiqadan keyin qayta olinadi;
   - avval HAMMA xom ashyo tekshiriladi — yetmasa `outOfStock` + `details.shortages[{ productId, code, name, unit, need, available }]`, hech narsa yozilmaydi;
   - xom ashyo atomik chiqadi (`quantity` kamayadi, `soldQuantity` emas — hisobotda «sotildi» bo'lmaydi; tarixda `consumed`);
     poyga holatida chiqqanlar qaytariladi;
   - tayyor mahsulot `toBranchId` ga kirim (§2: topilmasa yaratiladi), tarixda `produced`;
   - brak (`scrapQty`) omborga kirmaydi — `StockAdjustment { type: writeoff, reason: production_scrap, totalCost: scrapCost }`.
5. **Tannarx:** `materials = Σ (o'rtacha kelish narxi × haqiqiy sarf)`, `labor = Σ labor.amount` (standart:
   operatsiya narxi × yaroqli miqdor), `overhead = overheadPerUnit × yaroqli`; `unitCost = costTotal / (yaroqli + brak)`,
   `scrapCost = costTotal − unitCost × yaroqli`. Brak zarar sifatida alohida — yaroqli mahsulot tannarxiga ikki marta kirmaydi.
6. **O'rtacha tortilgan tannarx** (`calc.weightedAverageCost`, kirim va ishlab chiqarish uchun umumiy):
   `(qoldiq × eski narx + kirim × kirim narxi) / (qoldiq + kirim)`, butun so'm. Qoldiq ≤ 0 yoki eski narx 0 — yangi narx.
   Yangilash optimistik (quantity/soldQuantity/narx o'zgarmagan bo'lsa), to'qnashuvda qayta hisoblanadi.
   Grammlik arzon xom ashyoda butun so'm aniqligi yetmasligi mumkin — birlikni kg qiling.
7. **Kirim akti:** qator xarid birligida (qop) — `baseQty = qty × purchaseFactor` asosiy birlikda omborga; narx — kiritilgan
   birlik uchun, `amount = price × qty`; tannarx `amount / baseQty`. Post: ombor → `SupplierEntry{ type: 'purchase', amount: total, receiptId }`
   → `paidNow > 0` bo'lsa `SupplierEntry{ type: 'payment' }` (mavjud yetkazib beruvchi to'lov naqshi — kassa chiqimi YOZILMAYDI,
   «Yetkazib beruvchilar» bo'limidagi to'lov bilan bir xil) → PO `receivedQty` va holat. Yozuv tushmasa — ombor qaytariladi.
   Narxsiz qator bo'lsa post — `pricesRequired` (`{n}`). Yetkazib beruvchisiz akt — qarz yozilmaydi; `paidNow` — taqiqlangan.
8. **Narx yashirish:** `product.viewCost` bo'lmasa kirim/PO ko'rinishida `price/amount/total/paidNow/debt = null`, qatorda
   `priced: true|false`; kiritgan narxi e'tiborsiz, tahrirda mavjud qator narxi saqlanadi, PO bo'yicha qabulda — PO narxi.
   Shu bilan omborchi qabul qiladi, hisobchi narx kiritadi (yoki PO narxi), keyin post.
9. **Bajarilgan akt va post qilingan kirimni qaytarish** — hozir yo'q (keyingi bosqich). Xato bo'lsa: hisobdan chiqarish
   (`offcut`/`defective`) + kirim/yetkazib beruvchi yozuvi bilan tuzatiladi.
10. **PO:** qabul — `receiveFromPurchaseOrderAction` (qolgan miqdorlar bilan kirim qoralamasi, narx PO'dan) → miqdorni
    tuzatish → `postReceiptAction`. Shu PO'ning **ochiq (qoralama) kirimi bo'lsa — yangisi yaratilmaydi**, o'sha qaytadi
    (`existing: true`). `poLineId`'siz (yoki eskirgan `poLineId` li) qator shu kodli birinchi qolgan PO qatoriga bog'lanadi.
    PO tahririda (`savePo`) qatorlar `_id` si **saqlanadi** (tovar + birlik bo'yicha) — ochiq kirim qoralamasi bog'lanishi
    uzilmaydi, shuning uchun qoralama ochiq bo'lsa ham PO tahrirlanadi. Qabul qilingan miqdor PO qatori birligida
    (`baseQty / factor`). Xabar yuborilmaydi — «sent» faqat belgi.
11. **Ishbay:** narx — aktga bog'langan bo'lsa texkarta operatsiyasidan (nomi katta-kichik harfsiz mos), ishchi kiritgan
    narx e'tiborsiz; aks holda kiritilgani (bo'lmasa `rateRequired`). Ishchi faqat o'zi uchun (`workerId` boshqa — `noPermission`).
    Tasdiqlovchi narxni «yozildi» holatida tuzatadi. Akt `labor` (tannarx) va ishbay yozuvlari (ish haqi to'lovi) —
    **alohida**: akt tannarxi me'yoriy narx bilan, to'lov — haqiqiy yozuvlar bo'yicha.
12. **Ishbay to'lovi:** tasdiqlangan yozuvlar `paid` (bir yozuv ikki marta to'lanmaydi) → `CashFlow{ type: 'expense', category: 'Ish haqi',
    description: 'Ishbay: <ishchi> (N ta yozuv)', branchId? }`; «Ish haqi» toifasi bo'lmasa yaratiladi. CashFlow yozilmasa —
    yozuvlar `approved` ga qaytadi. Kassa smenasiga (`shiftId`) bog'lanmaydi — naqd smenadan berilsa, smenada «kassadan olish»ni
    alohida qiling (keyingi bosqich: smenaga bog'lash).
13. **Idempotentlik:** akt — `clientId`; kirim — `clientId`; PO — `clientId`; ishbay yozuvi — `clientId` (ishchi ichida);
    ishbay to'lovi — `clientId` (`payoutId = c:<clientId>`). Takror — avvalgi natija (`existing: true`), ikkinchi yozuv yo'q.
14. **Minimal qoldiq:** `Product.minStock` (filial hujjati; indeks `minStock_1` — so'rov IXSCAN). Ro'yxat —
    `GET /api/production/low-stock`. «Kam qolgan» bloklaridan (akt sahifasi, ombor sahifasi) «Kirim qilish» / «Xarid
    buyurtmasi» → `/app/receipts/new?items=<id,…>&b=<ombor>` / `/app/purchase-orders/new?items=…` — forma yetmagan
    miqdor bilan (xarid birligida, yuqoriga yaxlitlangan) oldindan to'ldiriladi (`productOptions({ ids })`).
    **Yaroqlilik muddati:** `ShopSettings.stock.expiryWarnDays` = N bo'lsa — ombor sahifasida «muddati N kun ichida
    tugaydi yoki o'tgan» bloki va `?exp=1` filtri (`catalog.expiringFilter`: omborda qoldig'i bor, `expiryDate` ≤ bugun+N,
    Toshkent kuni).
    Kunlik xabar: `/api/cron/daily-summary` (21:00, mavjud cron) ichida `sendLowStockAlerts()` — bitta xabarda (a) minimal
    qoldiqdan kam (`purchasing` yoki `production` yoqilgan do'kon), (b) muddati yaqin/o'tgan (`expiryWarnDays` o'rnatilgan
    do'kon); Telegram ulangan yoki push qurilmasi bor do'konlarga (10 tagacha qator, Telegram + admin push).
15. **Texkarta versiyasi:** tarkib (chiqish, xom ashyo, operatsiya, ustama, tayyor mahsulot) o'zgarsa `version + 1`,
    eskisi `prevVersions`; `expectedVersion` eskirgan bo'lsa — `conflict`. Arxivdagi texkartadan akt ochilmaydi
    (`recipeInactive`); ochiq aktlar o'z nusxasi bilan davom etadi.
16. **Davr filtrlari — Toshkent vaqti (UTC+5):** ro'yxat `from`/`to` (`?from=YYYY-MM-DD`) — Toshkent kuni boshi
    (`zOptDay`, `lib/period.ts → tashkentDayStart`); `to` aynan Toshkent yarim tuni bo'lsa — shu kun oxirigacha
    (`dateRange`), boshqa lahza (to'liq ISO) — o'sha lahzagacha (ichida). Server qaysi vaqt zonasida ishlashidan qat'i nazar
    00:00–05:00 dagi hujjat o'z kunida. UI ham kunni Toshkent bo'yicha hisoblaydi (`tashkentDayKey`, `tashkentPeriodRange`);
    eski `23:59:59.999` hiylasi olib tashlandi. Ishbay jamlamasining standart davri — joriy Toshkent oyi.

---

## 7. JSON shakllari

Xato: API — `{ error, code, details? }` + HTTP holati; server action — `{ ok: false, error, code, details? }`.
Muvaffaqiyat: API — `data` o'zi; action — `{ ok: true, data, success? }`. Sanalar — ISO satr yoki `null`.

```ts
RecipeView = { id, name, mode, outputCode, outputName, outputQty, unit, version, active, note,
  items: [{ code, name, qty, unit, lossPct,
            productId?, purchaseUnit?, purchaseFactor?, available? /* faqat getRecipe: ?branchId= ombordagi hujjat */ }],
  outputProductId? /* faqat getRecipe */, operations: [{ name, rate, normMin }], overheadPerUnit, laborPerUnit,
  createdBy, updatedBy, createdAt, updatedAt,
  versions?: [{ version, changedAt, changedBy, outputQty, items, operations, overheadPerUnit }] /* faqat getRecipe */ }
RecipeCostEstimate = { branchId, materials, labor, overhead, total, missing: code[] }   // 1 birlik, production.viewCost
Requirements = { recipeId, recipeName, version, outputName, qty, unit, branchId,
  lines: [{ code, name, unit, perBatch, lossPct, netQty, required, productId|null, available, shortage, unitCost|null, cost|null }],
  labor: [{ operation, rate, amount }], totals: { materials, labor, overhead, total, perUnit } | null, shortages }

OrderView = { id, docNo, status, recipe: { id, name, version, outputCode, outputName, outputQty, unit },
  plannedQty, producedQty, scrapQty, fromBranchId, fromBranchName, toBranchId, toBranchName,
  materials: [{ id, code, productId, name, unit, plannedQty, actualQty, extra, variance, unitCost|null, cost|null }],
  labor: [{ id, operation, workerId, workerName, qty, rate, amount }], laborManual,
  cost: { materials, labor, overhead, total, unitCost, scrap } | null,   // faqat done + production.viewCost
  outputProductId, scrapDocNo, dueDate /* YYYY-MM-DD|null */, overdue, customerRef, note, createdBy, createdAt, startedAt,
  startedBy, completedAt, completedBy, cancelledAt, cancelledBy, cancelReason, updatedAt, rev,
  can: { edit, start, complete, cancel, viewCost } }
OrderSummary = { id, docNo, status, recipeName, outputName, unit, plannedQty, producedQty, scrapQty, fromBranchName,
  toBranchName, createdBy, createdAt, completedAt, dueDate, overdue, customerRef, note,
  costTotal|null, unitCost|null, operations: [{ name, rate }] }
// overdue — ochiq (draft/in_progress) va muddat kuni bugungi Toshkent kunidan oldin

ReceiptView = { id, docNo, status, supplierId, supplierName, branchId, branchName, purchaseOrderId, purchaseOrderNo,
  supplierInvoiceNo, invoiceDate,
  lines: [{ id, productId, code, name, qty, unit, factor, baseQty, baseUnit, price|null, amount|null, priced, expiryDate, poLineId }],
  total|null, paidNow|null, debt|null, unpriced, note, createdBy, createdAt, postedAt, postedBy, cancelledAt, updatedAt, rev,
  can: { edit, post, cancel, viewPrices, setPayment } }
ReceiptPrint = { shop, docNo, status, date, supplier: { name, phone, company }|null, warehouse, supplierInvoiceNo, invoiceDate,
  lines: [{ n, name, code, qty, unit, baseQty, baseUnit, price|null, amount|null }], total|null, paid|null, debt|null, receivedBy }

PoView = { id, docNo, status, supplierId, supplierName, branchId, branchName,
  lines: [{ id, productId, code, name, qty, unit, factor, baseUnit, price|null, amount|null, receivedQty, remaining }],
  total|null, expectedAt, note, createdBy, createdAt, sentAt, receivedAt, cancelledAt, updatedAt, rev,
  can: { edit, send, receive, cancel, viewPrices } }

PieceworkView = { id, workerId, workerName, branchId, productionOrderId, productionOrderNo, operation, qty, unit|null, rate, amount,
  status, workDate, note, loggedBy, approvedBy, approvedAt, rejectedBy, rejectReason, paidBy, paidAt, cashFlowId, createdAt,
  can: { edit, approve, reject, pay } }
Bucket = { count, qty, amount }
WorkerSummary = { workerId, workerName, logged: Bucket, approved: Bucket, paid: Bucket, rejected: Bucket, due,
  byOperation: [{ operation, qty, amount }] }

ProductOption = { id, code, name, unit, purchaseUnit, purchaseFactor, available, minStock, cost|null, salePrice, barcode }
ProductionMeta = { features: { production, purchasing, piecework }, branches: [{ id, name, isMain }] /* ish ombori(lar)i */,
  toBranches: [{ id, name, isMain }] /* tayyor mahsulot ombori tanlovi — barcha faol omborlar */, defaultBranchId, units,
  can: { viewProduction, manageProduction, manageRecipes, viewCost, viewPrices, receive, managePo, logPiecework,
         approvePiecework, supplierPayment, editProducts } }
```
Ro'yxatlar: `{ items, total, page, limit }` (sahifa 50, ko'pi bilan 200). Ishbay ro'yxatida qo'shimcha
`sums: { logged, approved, paid, due }` (filtrga mos hamma yozuvlar bo'yicha). Aktlar ro'yxatida qo'shimcha
`overdue` — doiradagi muddati o'tgan ochiq aktlar soni (filtrdan qat'i nazar; «Muddati o'tgan: N» chipi).

---

## 8. Server action'lar

Hammasi object argument oladi (FormData emas), zod bilan tekshiradi, natija `ActionResult<T>`.

**`app/actions/production.ts`**

| Action | Kirish | Huquq | `data` |
|---|---|---|---|
| `saveRecipeAction(input)` | `{ id?, name, mode?, outputProductId, outputQty, items: [{ productId, qty, unit?, lossPct? }] (1–60), operations?: [{ name, rate?, normMin? }] (≤30), overheadPerUnit?, note?, expectedVersion? }` — `unit` asosiy yoki xarid birligi | recipe.manage | `{ recipe, created, versionBumped }` |
| `setRecipeActiveAction({ id, active })` | | recipe.manage | `{ recipe }` |
| `recipeRequirementsAction({ recipeId, qty, branchId? })` | | production.view\|recipe.manage\|production.manage | `Requirements` |
| `createProductionOrderAction(input)` | `{ recipeId, plannedQty, fromBranchId?, toBranchId?, dueDate?, customerRef?, note?, clientId? }` | production.manage | `{ order, existing }` |
| `updateProductionOrderAction(id, input)` | `{ plannedQty?, note?, dueDate? (null — olib tashlash), customerRef?, materials?: [{ id?, productId?, actualQty }], labor?: [{ operation, workerId?, qty, rate }], expectedRev? }` — reja va sarf bitta so'rovda ham bo'ladi (id'lar saqlanadi) | production.manage | `{ order }` · eskirgan `expectedRev` → `conflict` |
| `startProductionOrderAction(id)` | | production.manage | `{ order }` |
| `completeProductionOrderAction(id, input)` | `{ producedQty, scrapQty?, materials?, labor?, expectedRev? }` | production.manage | `{ order, outputProductId, createdOutput }` |
| `cancelProductionOrderAction(id, { reason? })` | | production.manage | `{ order }` |
| `logPieceworkAction(input)` | `{ workerId?, productionOrderId?, operation, qty, rate?, workDate?, note?, clientId? }` | piecework.log (+approve boshqaga) | `{ entry, existing }` |
| `editPieceworkAction({ id, qty?, rate?, operation? })` | rate — faqat approve; aktli yozuvda operatsiya o'zgarsa narx texkartadan; qty — birlik qoidasi | piecework.log\|approve | `{ entry }` |
| `approvePieceworkAction({ ids })` / `rejectPieceworkAction({ ids, reason? })` | ≤500 | piecework.approve | `{ updated, skipped }` |
| `payPieceworkAction({ workerId, ids?, from?, to?, branchId?, clientId? })` | | piecework.approve | `{ payoutId, workerId, workerName, count, amount, cashFlowId, existing }` |

**`app/actions/receipts.ts`**

| Action | Kirish | Huquq | `data` |
|---|---|---|---|
| `saveReceiptAction(id \| null, input)` | `{ supplierId?, branchId?, purchaseOrderId?, supplierInvoiceNo?, invoiceDate?, note?, paidNow?, clientId?, lines: [{ productId, qty, unit?, price? (null — tozalash), expiryDate?, poLineId? }] (1–200) }` | receipt.create | `{ receipt, existing }` |
| `postReceiptAction(id, { paidNow? })` | | receipt.create (+suppliers.manage to'lov) | `{ receipt, created: productId[] /* yangi nusxalar */ }` |
| `cancelReceiptAction(id)` | faqat qoralama | receipt.create | `{ receipt }` |
| `savePurchaseOrderAction(id \| null, input)` | `{ supplierId, branchId?, expectedAt?, note?, clientId?, lines: [{ productId, qty, unit?, price? }] }` | po.manage | `{ po, existing }` |
| `sendPurchaseOrderAction(id)` / `cancelPurchaseOrderAction(id)` | | po.manage | `{ po }` |
| `receiveFromPurchaseOrderAction(id, { clientId? })` | qolgan qatorlardan kirim qoralamasi; ochiq qoralama bo'lsa — o'sha (`existing: true`) | receipt.create | `{ receipt, existing }` |
| `setStockSettingsAction({ productId, minStock?, purchaseUnit?, purchaseFactor? })` | `null` — olib tashlash | product.edit | `{ product: ProductOption, updatedCopies }` |

Server komponentda o'qish: `const ctx = await productionCtxFromSession()` (`lib/production/session.ts`), so'ng
`recipes.listRecipes(ctx, …)`, `orders.getOrder(ctx, id)`, `catalog.productionMeta(ctx)` va h.k. — natija `OpResult`.

---

## 9. Web JSON API (sessiya cookie, faqat GET, `Cache-Control: no-store`)

Umumiy parametrlar: `branchId`, `status`, `from`, `to` (YYYY-MM-DD — Toshkent kuni, `to` — shu kun oxirigacha; yoki to'liq
ISO lahza — §6.16), `q`, `page`, `limit`.

| Yo'l | Huquq (+ modul) | Javob |
|---|---|---|
| `GET /api/production/meta` | istalgan (production\|purchasing\|piecework yoqiq) | `ProductionMeta` |
| `GET /api/production/products?branchId=&q=&limit=` · `?ids=a,b,c` (≤50, doiradagi istalgan filial, `ids` tartibida) | products.view\|recipe.manage\|production.manage\|receipt.create\|po.manage | `{ branchId, items: ProductOption[] }` |
| `GET /api/production/low-stock?branchId=` | products.view\|receipt.create\|po.manage | `{ items: (ProductOption & { branchId, shortage })[] }` |
| `GET /api/production/recipes?active=1\|0\|all&q=` | production.view\|recipe.manage\|production.manage | `{ items: RecipeView[], total, page, limit }` |
| `GET /api/production/recipes/:id?branchId=` | shu | `{ recipe: RecipeView (versions bilan), cost: RecipeCostEstimate\|null }` |
| `GET /api/production/recipes/:id/requirements?qty=&branchId=` | shu | `Requirements` |
| `GET /api/production/orders?status=active\|draft\|in_progress\|done\|cancelled&recipeId=&sort=due&due=overdue` | production.view\|production.manage | `{ items: OrderSummary[], total, page, limit, overdue }` — `sort=due`: yaqin muddat birinchi, muddatsizlar oxirida |
| `GET /api/production/orders/:id` | shu | `{ order: OrderView }` |
| `GET /api/production/receipts?status=&supplierId=&purchaseOrderId=` | receipt.create\|po.manage\|suppliers.view\|production.view (`RECEIPT_READ_PERMS`; web layout va mobil plitka ham shu) | `{ items: ReceiptSummary[], … }` (`{ id, docNo, status, supplierName, branchName, purchaseOrderNo, supplierInvoiceNo, lines, total\|null, createdBy, createdAt, postedAt }`) |
| `GET /api/production/receipts/:id` · `?print=1` | shu | `{ receipt: ReceiptView }` · `ReceiptPrint` |
| `GET /api/production/purchase-orders?status=open\|…&supplierId=` | po.manage\|receipt.create\|suppliers.view | `{ items: PoSummary[], … }` (`{ id, docNo, status, supplierName, branchName, lines, total\|null, expectedAt, createdAt, open }`) |
| `GET /api/production/purchase-orders/:id` | shu | `{ po: PoView }` |
| `GET /api/production/piecework?status=&workerId=&productionOrderId=&from=&to=&mine=1` | piecework.log\|approve | `{ items: PieceworkView[], total, page, limit, sums }` |
| `GET /api/production/piecework/summary?from=&to=&workerId=` | shu | `{ from, to, workers: WorkerSummary[], totals }` (standart — joriy oy, ≤366 kun) |
| `GET /api/production/workers` | piecework.approve → `{ workers: [{ id, username, name, branchId }] }`; yoki production.manage → `{ workers: [{ id, name }] }` (akt ish haqi qatorida ishchi tanlash) | |

---

## 10. Mobil API (`Authorization: Bearer <token>`, xabarlar o'zbekcha, muddati o'tgan do'konda yozish — 402)

| Yo'l | Metod | Tana / parametr | Javob |
|---|---|---|---|
| `/api/mobile/production/piecework` | GET | `?status=&from=&to=&page=&mine=1` | `{ items, total, page, limit, sums }` (ishchi — o'ziniki) |
| `/api/mobile/production/piecework?summary=1` | GET | `&from=&to=` | `{ from, to, workers, totals }` |
| `/api/mobile/production/piecework` | POST | `{ productionOrderId?, operation, qty, rate?, workDate?, note?, clientId }` | 201 `{ entry, existing: false }` · takror 200 `{ entry, existing: true }` · dona/juft aktda kasr — 400 `badQty` |
| `/api/mobile/production/piecework` | PATCH | `{ id, qty?, operation? }` — **o'z** «yozildi» yozuvi | 200 `{ entry }` · narx yuborilsa 403 · boshqaning yozuvi 404 · tasdiqlangan 409 |
| `/api/mobile/production/orders` | GET | `?status=active` (standart) `&q=` | `{ items: OrderSummary[] }` — `operations[{ name, rate }]` ishchi tanlovi uchun |
| `/api/mobile/production/receipts` | GET | `?status=&supplierId=&from=&to=&q=` | `{ items: ReceiptSummary[], … }` (`RECEIPT_READ_PERMS`, `production.view` ham) |
| `/api/mobile/production/receipts/:id` | GET | | `{ receipt: ReceiptView }` |

Oflayn: ishbay yozuviga qurilmada `clientId` (UUID) bering — takroriy yuborish xavfsiz. Mobil «Ishbay» ekranida o'z
«yozildi» yozuvini bosib miqdorni tuzatish mumkin (PATCH). `GET /api/mobile/me` →
`features.production|purchasing|piecework` va `permissions` (yangi kalitlar bilan). Mobil kirim yaratish/post — hozir yo'q (web).

---

## 11. Xato kodlari (`d.production.errors.<code>`)

| Kod | HTTP | Ma'no |
|---|---|---|
| `moduleOff` | 403 | modul o'chiq (`{label}`) |
| `noPermission` | 403 | huquq yo'q (`{label}` — huquq nomi) |
| `badInput`, `badBranch`, `badQty` (`{name}`), `badUnit` (`{name}`), `badFactor`, `badPrice`, `emptyLines`, `tooManyLines` (`{n}`), `duplicateLine` (`{name}`), `selfComponent`, `overpaid`, `paymentNeedsSupplier`, `producedRequired`, `rateRequired` | 400 | kirish / biznes qoidasi |
| `recipeNotFound`, `orderNotFound`, `receiptNotFound`, `poNotFound`, `productNotFound`, `outputNotFound`, `supplierNotFound`, `workerNotFound`, `entryNotFound` | 404 | topilmadi yoki doiradan tashqarida (ma'lumot sizmasin) |
| `recipeInactive`, `materialMissing` (`{name}`), `notCountable` (`{name}`), `notReceivable` (`{name}`), `outOfStock` (`{list}`, `details.shortages`), `pricesRequired` (`{n}`), `badTransition`, `conflict`, `locked`, `poClosed`, `poMismatch`, `nothingToPay` | 409 | holat ziddiyati |
| `failed` | 500 | kutilmagan xato (log yozilgan) |

`conflict` — hujjatni qayta o'qib takrorlang; `locked` — 1–2 soniyadan keyin qayta urinish.

---

## 12. Lug'at (`lib/i18n/dict/production.ts`, `d.production`)

| Bo'lim | Hozir bor | UI agenti qo'shadi |
|---|---|---|
| `common` | atamalar, `orderStatuses`, `receiptStatuses`, `poStatuses`, `pieceworkStatuses`, `recipeModes`, `factorLine` | — |
| `errors` | server xabarlari (kalit = xato kodi) | yangi kod faqat backend bilan |
| `msg` | action `success` xabarlari | — |
| `auto` | avtomatik yozuv matnlari (yetkazib beruvchi, kassa, brak) | — |
| `lowStock` | ogohlantirish matnlari | sahifa matnlari |
| `recipes`, `orders`, `receipts`, `purchase`, `piecework`, `reports`, `print` | sarlavha va asosiy tugmalar skeleti | sahifa/forma matnlari |

Boshqa lug'atlarga qo'shildi: `d.catalog.features.{production,purchasing,piecework}`, `d.catalog.permissions.{8 kalit}`,
`d.catalog.permissionPages.{production,receipts,piecework}`, `d.catalog.businessTypes.manufacturing`, `terms.manufacturing`,
`d.catalog.industryProfiles`, `industryProfileLabel`, `industryProfileNone`, `d.shell.nav.groups['Ishlab chiqarish']`,
`d.shell.nav.links[5 yo'l]`, `d.stock.fields.units.{list,rulon,m3,t,juft}`, `d.stock.actionLabels.{consumed,produced}`,
`d.stock.adjust.reasons.{production_scrap,offcut}`, `d.crm.audit.entities.{production,purchase}`. Qoida: `ru: typeof uz`.

---

## 13. UI agentlari bilishi shart

1. Avval `GET /api/production/meta` — `can.*` bo'yicha bo'lim va tugmalarni ko'rsating; har hujjatda `can` bor.
2. Mahsulot tanlash — `GET /api/production/products?branchId=<shu hujjat ombori>`; xarid birligi bo'lsa qatorda birlik
   tanlovi: `[unit, purchaseUnit]`, yonida `d.production.common.factorLine` («1 qop = 50 kg»). Qator birligi faqat shu ikkitadan biri.
3. Narx/tannarx `null` — «yashirin» (`d.production.receipts.priceHidden`), 0 emas. Narxsiz qator — `priced: false`.
4. Miqdor kiritish: `lib/qty.ts` (`qtyStep`, `parseQty`) — list/rulon/m³/t kasr, juft butun. Texkarta normasi (`items.qty`)
   istalgan birlikda kasr bo'lishi mumkin (partiya uchun).
5. Akt sahifasi: reja + saqlanmagan sarf/ish haqi — bitta `updateProductionOrderAction` (`expectedRev` bilan), `conflict`
   → xabar + `router.refresh()`. Ish haqi qatorida ishchi tanlovi (`listWorkers`, id/ism). Muddat va mijoz buyurtmasi —
   alohida maydonlar (izohga yozilmaydi); ro'yxatda muddat, «muddati o'tgan» belgisi, `?sort=due`, `?due=overdue`.
   «Bajarildi» oynasi: `producedQty` (+ `scrapQty`), haqiqiy sarf jadvali (reja/haqiqiy/farq). `outOfStock` → `details.shortages`
   ro'yxatini ko'rsating va «Kirim qilish» havolasini bering. Muvaffaqiyatda `createdOutput: true` — «tayyor mahsulot omborida yangi kartochka ochildi».
6. Kirim akti formasi: yetkazib beruvchi (ixtiyoriy), ombor, nakladnoy raqami/sanasi, qatorlar, «Hozir to'landi» (faqat `can.setPayment`).
   Saqlash — qoralama; «Kirim qilish» alohida tugma (`postReceiptAction`). Chop etish — `GET …/receipts/:id?print=1`.
7. PO sahifasida «Qabul qilish» → `receiveFromPurchaseOrderAction` → yaratilgan kirim qoralamasiga o'ting.
8. Ishbay: ishchi ekrani — o'z yozuvlari (`mine=1`), aktni tanlasa operatsiyalar `OrderSummary.operations` dan (narx ko'rsatiladi,
   kiritilmaydi). Boshliq ekrani — `status=logged` ro'yxati, ko'p tanlab tasdiqlash, ishchi bo'yicha jamlama va «To'lash».
   Barcha yozish so'rovlarida `clientId` (UUID) yuboring.
9. Mahsulot kartochkasida «Ombor sozlamalari»: minimal qoldiq, xarid birligi + koeffitsient (`setStockSettingsAction`).
10. Hisobdan chiqarish formasiga `offcut` sababini qo'shish mumkin (server qabul qiladi; `production_scrap` — faqat avtomatik).
11. Super admin formasi tayyor (sex profili select). Ro'yxatdan o'tish formasiga 5 savol (TAKLIF §2.3) — keyingi ish;
    backend `industryProfile` ni qabul qiladi.
12. Mobil ilova: ishbay (yozish, o'z yozuvini tuzatish — PATCH), kirim aktlari (ko'rish). `mobile/lib/qty.ts` dagi kasr
    birliklar ro'yxatini server bilan solishtirib turing.

---

## 14. Tekshiruv va demo sex

- `npx vitest run` — `tests/productionLogic.test.ts` (birlik konvertatsiyasi, ehtiyoj/yo'qotish, tannarx, o'rtacha narx, holatlar,
  ishbay jamlamasi, preset, huquq versiyasi va meros, rollar, menyu, zod, xabar matni).
- `MONGO_TEST_URI=mongodb://127.0.0.1:27019 npx vitest run tests/productionFlow.test.ts` — to'liq oqim: texkarta (xarid birligida,
  barqaror kod, versiya), ehtiyoj, akt (idempotent), haqiqiy sarf, «bajarildi» (sarf, boshqa omborda yangi tayyor mahsulot,
  tannarx 4640, brak hujjati), ikkinchi partiya (o'rtacha tannarx), yetishmovchilik (hech narsa yozilmaydi), parallel «bajarildi»,
  filial doirasi, kirim (qop → kg, o'rtacha narx, qarz + to'lov), omborchi narxsiz kirim, boshqa omborga kirim (nusxa), PO qisman/to'liq,
  ishbay (narx texkartadan, idempotent, tasdiq, to'lov → CashFlow «Ish haqi»), minimal qoldiq, xarid birligi nusxalarga, modul o'chiq;
  2-bosqich: muddat/mijoz/overdue/saralash, reja o'zgarganda id va qo'lda sarf saqlanishi + `expectedRev`, PO tahriri id'lari va
  ochiq qoralama takrorlanmasligi, ishbay birligi va `ownOnly` tuzatish, Toshkent kuni (00:30 hujjat), texkarta `productId`,
  ishchilar (production.manage), `productOptions({ ids })`, `toBranches`, `expiringFilter`.
- **Demo sex (faqat lokal dev):** `npm run seed:sex` (`scripts/seed-demo-sex.mjs`, `ts-hooks.mjs` bilan; production'da va localhost
  bo'lmagan `MONGO_URI` da rad etadi; idempotent). Do'kon `demo-sex` (manufacturing, profil bakery, Pro), omborlar «Xom ashyo» /
  «Tayyor mahsulot», loginlar `ds_admin`, `ds_boshliq`, `ds_usta`, `ds_omborchi`, `ds_hisobchi` (parol — skriptda yoki
  `SEED_SEX_PASSWORD`), 1 yetkazib beruvchi, 8 xom ashyo (qop/quti xarid birligi, minimal qoldiq, sut/sariyog' — muddat bilan),
  2 tayyor mahsulot, 2 texkarta, `expiryWarnDays = 7`. Kirish: `http://localhost:3000/t/demo-sex/login`.

---

## 15. Keyinga qoldirilgan (backendda yo'q) va nega

| Nima | Nega hozir emas |
|---|---|
| **Partiya va muddat (`StockLot`, FEFO)** | Mahsulotda `batchNumber`/`expiryDate` bittadan; partiya — har kirimda alohida qoldiq, sotuv/sarf/transfer/qaytarishda qaysi partiyadan ketishini tanlash va barcha mavjud ombor amallarini (`lib/stock.ts`, kassa, mobil) qayta yozish kerak — L hajm. Hozir: kirimda eng yaqin muddat mahsulotga yoziladi; kirim qatorida `expiryDate` saqlanadi (keyin partiyaga ko'chiriladi). |
| **Ko'p bosqichli BOM** (yarim tayyor mahsulot → mahsulot) | 1 daraja bilan yarim tayyor mahsulot alohida akt bilan chiqariladi (u ham `itemCode` bilan) — ishlaydi. Avtomatik zanjir, aylanma bog'liqlik tekshiruvi, rekursiv ehtiyoj — keyin. |
| **Mebel bichimi** (list kesish xaritasi) | Optimallashtirish algoritmi va UI; hozir sarf `list`/`m²` kasr bilan, chiqindi — `offcut`. |
| **E-faktura / ETTN (Didox, Faktura.uz)** | Operator tanlash, shartnoma va API kalitlari — biznes qarori kerak (TAKLIF §4). |
| **Markirovka (DataMatrix, Asl belgisi)** | Soliq ko'prigi bilan birga (TAKLIF §4). |
| **Yacheykalar (ombor manzillari)** | Kichik sexlar uchun ustuvor emas. |
| **Agent marshrutlari, dilerga jo'natish (shipments), kredit limiti, ekspeditor** | 2-faza «distribyutor» bloki; hozir diler qarzi — mavjud nasiya/daftar. |
| Bajarilgan akt / post qilingan kirimni qaytarish | Teskari harakat (o'rtacha narxni qaytarish, sotilgan tayyor mahsulot) murakkab; hozir hisobdan chiqarish bilan tuzatiladi. |
| Mijoz buyurtmasi → ishlab chiqarish (avans, bosqichlar) | 2-faza (mebel buyurtmasi). |
| `Recipe(onSale)` — restoran texkartasi | Model tayyor (`mode`), lekin restoran hozir `Product.kind = 'bundle'` bilan ishlaydi; ko'chirish — alohida ish. |
| «Ishchi o'rni» (loginsiz/PIN ishchi, limitga sanalmaydi) | Ishbay faqat tizim foydalanuvchisi (`User`) uchun; `maxUsers` cheklovi va PIN-kirish — tarif qarori bilan. |
| Ishbay to'lovini kassa smenasiga bog'lash | `CashFlow.shiftId` — keyingi bosqich. |
