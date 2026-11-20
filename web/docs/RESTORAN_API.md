# Restoran moduli — backend API (UI agentlari uchun)

Sana: 2026-11-18 (yangilandi: E2E sinovdan keyin). Asos: `docs/business/TAKLIF_2026-11_SHABLONLAR.md` §1 (MVP + 2-faza).
Bu hujjat va `lib/restaurant/*` kodi — UI sahifalari (`/app/tables`, `/app/kitchen`, `/app/restaurant`,
mijoz QR sahifasi `/m/<slug>/<token>`, umumiy mijoz sahifasi `/m/<slug>` (§9a), mobil ilova) uchun YAGONA manba. Sahifalar va mobil ekranlar yozilgan
va demo restoranda uchdan-uchgacha sinalgan (§14).

---

## 0. Qisqacha

| Nima | Qayerda |
|---|---|
| Turlar va holatlar (client'da ham) | `lib/restaurant/types.ts` |
| Hisob: qator, xizmat haqi, chegirma, bo'lish (client'da ham) | `lib/restaurant/bill.ts` |
| Holat o'tishlari, ruxsatlar, UI tugmalari (client'da ham) | `lib/restaurant/rules.ts` |
| Modifikatorlar, vaqt o'lchovlari, QR yo'l (client'da ham) | `lib/restaurant/modifiers.ts`, `timings.ts`, `qr.ts` |
| Buyurtma amallari (server) | `lib/restaurant/ops.ts` |
| Sozlamalar: zal/stol/stansiya/menyu bandi/stop-list (server) | `lib/restaurant/setup.ts` |
| Menyu va ombor ajratilishi: `menuItem` belgisi, migratsiya (server) | `lib/restaurant/menuFlags.ts` (§2a) |
| «Menyu» bo'limi: ro'yxat, taom formasi, retsept, tez xom ashyo (server) | `lib/restaurant/menuAdmin.ts`, action'lar — `app/actions/menu.ts` |
| Retsept birliklari, tannarx, foyda, porsiya (client'da ham) | `lib/restaurant/recipeUnits.ts` |
| O'qish: stollar, buyurtmalar, KDS, menyu, sozlama, hisobot (server) | `lib/restaurant/queries.ts` |
| Mijoz QR (server) | `lib/restaurant/public.ts` |
| JSON ko'rinish (OrderView) | `lib/restaurant/view.ts` |
| Kontekst/natija turlari, sessiya → ctx | `lib/restaurant/context.ts`, `session.ts` |
| Kirish sxemalari (zod) | `lib/restaurant/inputs.ts` |
| Server action'lar (web yozish) | `app/actions/restaurant.ts` |
| Web JSON GET (polling) | `app/api/restaurant/*` |
| Mobil REST | `app/api/mobile/restaurant/*` |
| Ochiq QR API | `app/api/public/menu/[slug]/[token]/*`, umumiy sahifa — `app/api/public/menu/[slug]/route.ts` (§9a) |
| Mijoz sahifasi aloqa ma'lumoti (client'da ham) | `lib/restaurant/info.ts` |
| Lug'at | `lib/i18n/dict/restaurant.ts` → `d.restaurant.*`; «Menyu» bo'limi — `lib/i18n/dict/menu.ts` → `d.menu.*` |
| Testlar | `tests/restaurantLogic.test.ts`, `tests/restaurantFlow.test.ts`, `tests/restaurantMenu.test.ts` (MongoDB) |

**Modullar** (`lib/featureKeys.ts`, `lib/features.ts`): `tables` (zal, stollar, buyurtma, ofitsant, kassa «Stollar»),
`kitchen` (stansiyalar, oshxona ekrani KDS), `qrMenu` (mijoz QR-menyusi). Standart — hamma tarifda o'chiq;
`BUSINESS_FEATURE_PRESETS.restaurant` yoqadi: `tables`/`kitchen` — Starter, Pro, Business, Custom; `qrMenu` — Pro+.
Super Admin istalgan do'konda qo'lda yoqishi mumkin.

**Menyu bandlari** (`lib/navConfig.ts`): «Sotuvlar» guruhida `/app/menu` (Menyu; `tables` + `product.create` |
`product.edit` | `menu.stopList` — `NavLink.anyPermission`), `/app/tables` (Stollar; `tables` + `order.create`),
`/app/kitchen` (Oshxona; `kitchen` + `kitchen.view`); «Hisobotlar» guruhida `/app/restaurant/reports`
(Restoran hisobotlari; `tables` + `reports.view`); «Sozlamalar» guruhida `/app/restaurant`
(Restoran sozlamalari; `tables` + `tables.manage`). Nomlar — `d.shell.nav.links`. Hisobotlar markazida (`/app/reports`)
«Restoran» kartasi — `tables` moduli yoqiq va `reports.view` bo'lsa.

**PWA yorliqlari** (`public/manifest.webmanifest` → `shortcuts`): «Stollar» (`/app/tables`) va «Oshxona ekrani»
(`/app/kitchen`) — planshetda ilovani bosib turganda tez ochish (modul o'chiq do'konda `/app/locked` ga yo'naltiradi).

---

## 1. Huquqlar va rollar

`PERMISSIONS_VERSION = 3`. Yangi huquqlar (`lib/permissions.ts`, sahifalar `tables`, `kitchen`, `restaurant`):

| Kalit | Nomi | Modul | Filial standarti | Ishlatiladi |
|---|---|---|---|---|
| `order.create` | Buyurtma olish | tables | ✓ | stol ochish, taom qo'shish, yuborish, yetkazildi, pre-chek, QR tasdiq, bekor (yuborilmagan), chaqiruvni ko'rish |
| `order.viewAll` | Barcha buyurtmalar | tables | ✓ | boshqa ofitsantlar stollari/buyurtmalari; chaqiruv/hisob so'rovini «Ko'rdim» (kassir) |
| `order.transfer` | Stol/ofitsantni o'tkazish | tables | — | transferOrder, waiters ro'yxati |
| `order.voidItem` | Yuborilgan taomni bekor qilish | tables | — | voidItem (sent/cooking/ready/served) |
| `order.split` | Hisobni bo'lish | tables | ✓ | payOrder `items` bilan |
| `order.reopen` | Hisobni qayta ochish | tables | — | reopenOrder |
| `kitchen.view` | Oshxona ekrani | kitchen | ✓ | kitchenBoard |
| `kitchen.bump` | Taom holatini belgilash | kitchen | ✓ | bump cooking/ready (served ham) |
| `menu.stopList` | Stop-list | tables | ✓ | setStopList |
| `tables.manage` | Zal va stollar sozlamasi | tables | — | setup.* (zal, stol, QR, stansiya, sozlamalar) |

Bog'liq mavjud huquqlar: to'lov — `sale.create`; chegirma — `sale.discount`; taomning stansiya/modifikator/MXIK
maydonlari — `product.edit`; vaqt hisoboti — `reports.view`.

**Versiya qoidasi:** `PermissionDef.since` qo'shildi. Eski (v2) aniq ro'yxatlarga faqat `since > 2` kalitlarning
`legacy` qoidasi qo'llanadi: «Sotuv qilish» (`sale.create`) bor xodim `order.create`, `order.viewAll`, `order.split`,
`kitchen.*`, `menu.stopList` ni oladi; nazorat amallari (`transfer`, `voidItem`, `reopen`, `tables.manage`) — faqat aniq
berilsa. Egasi v2'da olib qo'ygan eski huquqlar qayta qo'shilmaydi (avval har versiya oshishida qayta qo'shilardi).

**Rol shablonlari** (`RESTAURANT_ROLES`, `lib/models/tenant/Role.ts`): Ofitsant, Oshpaz, Barmen, Kassir (restoran),
Administrator — §1.6 bo'yicha. `ensureDefaultRoles(Role, businessType)` (`lib/roles.ts`) restoran turida NOMI bo'yicha
yo'qlarini qo'shadi (idempotent, tahrirlangan rol o'zgarmaydi). Chaqiriladi: `/app/users`, `/app/roles` sahifalari.
Barmen huquqlari Oshpaz bilan bir xil + `order.create`; «bar stansiyasi» — UI'da `stationId` filtri (serverda stansiya
bo'yicha cheklov yo'q).

**Kirish doirasi** (`rules.ts → canAccessOrder`): filial xodimi faqat o'z filiali; `order.viewAll` bo'lmasa — faqat
o'z buyurtmalari (`waiterId = user.id`) va ofitsanti yo'q (mijoz QR ochgan) buyurtmalar. Boshqa ofitsant stoli
taxtada «band» bo'lib ko'rinadi, summalar yashirin (`access: false`). Oshxona (`kitchen.bump`) — filialdagi istalgan buyurtma.

---

## 2. Ma'lumot modeli (tenant baza)

### Hall (`halls`)
`{ name ≤60, branchId, sort, active }`

### Table (`tables`)
`{ hallId, branchId, number (1–9999, filial ichida NOYOB), seats (1–100), x?, y?, qrToken (128 bit base64url, NOYOB), active, callWaiterAt?, callBillAt? }`
Band/bo'shligi saqlanmaydi — ochiq buyurtmadan (`Order.activeTableKey`). QR almashtirilsa eski havola ishlamaydi.

### KitchenStation (`kitchen_stations`)
`{ branchId, name, kind: 'kitchen'|'bar', printerIp? (tarmoq agenti uchun, hozircha faqat saqlanadi), printEnabled (avtomatik chop etish, standart false), sort, active }`

### PrintJob (`print_jobs`) — oshxona printeri navbati (§7a)
`{ branchId, stationId, stationName, kind: 'order'|'void', orderId, orderNo, orderType, tableNumber?, waiterName? (ism), guests?, orderNote?, lines[{ itemId, name, qty, unit?, modifiers[{group,name}], note?, fromQr?, reason? }], status: 'pending'|'printed', queuedAt, copy?, claimedBy?, claimedAt?, attempts, printedAt?, printedBy?, createdBy }`. Narx saqlanmaydi. TTL — 7 kun.

### Order (`orders`)
```
orderNo        "B20261118-0001" (atomik hisoblagich)
branchId, type: dine_in | takeaway | qr_self, source: waiter | qr | cashier
status: open | precheck | paid | cancelled
tableId?, tableNumber?, hallId?, activeTableKey? (= tableId ochiq paytda; noyob → bir stolda bitta ochiq buyurtma)
guests?, waiterId?, waiterName?, note?
serviceChargePct (ochilgandagi; takeaway/qr_self → 0), packFee (takeaway → sozlamadagi), packFeePaid?
items: OrderItem[], payments: OrderPayment[]
clientOrderId? (idempotentlik), openedBy/At, precheckAt/By, paidAt, cancelledAt/By/Reason
rev (optimistik qulf), createdAt, updatedAt (polling ?since=)
```
Indekslar: `{branchId,status,updatedAt}`, `{activeTableKey}` unique partial, KDS `{branchId,'items.stationId','items.status'}`,
`{tableId,createdAt}`, `{clientOrderId}` unique partial, `{branchId,paidAt}`.

### OrderItem (embedded, o'z `_id` i bor)
```
clientItemId? (idempotent qo'shish), productId, name, basePrice, price (= base + modifikatorlar), qty, unit?
modifiers [{ group, name, price }], note?, stationId?, stationKind?
status: pending | new | sent | cooking | ready | served | voided
stockReserved, addedBy/At, fromQr?, confirmedBy?
sentAt/By, cookStartedAt, readyAt, servedAt/By
voidedAt/By, voidReason?, voidStage: unsent | beforeCook | afterCook
paidCheckoutId? (to'langan qism), saleId?
```

### OrderPayment (embedded)
`{ payId?, checkoutId, itemIds[], saleIds[], subtotal, discount, serviceCharge, packFee, total, parts[{method,amount}], change, paidAt, by }`

### Product (+ maydonlar)
`ikpu?` (MXIK, 5–30 raqam), `stationId?`, `modifierGroups?[{ _id, name, required, min, max, options[{ _id, name, price }] }]`,
`stopListed?` (mahsulot filialga tegishli — stop-list ham filial bo'yicha), `systemKey?` (tizim mahsuloti),
`menuItem?` (menyudami — §2a). Texkarta (retsept) — mavjud `kind: 'bundle'` + `bundleItems` (yuborishda tarkib ombordan
ayriladi). `ShopSettings.menuVersion` — menyu belgilari migratsiyasi versiyasi (1).

### 2a. Menyu va ombor (`lib/restaurant/menuFlags.ts`)

Egasining talabi: **Menyu** — alohida bo'lim (taom qo'shiladi, har taomga retsept), **Ombor** — faqat menyu uchun kerakli
mahsulotlar (xom ashyo va tayyor tovar). Menyu turlari (`MenuItemType`):

| Tur | Product | Ombor | Yuborishda |
|---|---|---|---|
| Taom (`dish`) | `kind: 'bundle'`, `bundleItems` = retsept (1 porsiyaga xom ashyo ASOSIY birlikda: 0,15 = 150 g), `menuItem: true`, `purchasePrice` = retsept tannarxi | o'zi saqlanmaydi | retsept xom ashyosi ombordan chiqadi (`reserveStock`, hammasi yoki hech biri) |
| Tayyor tovar (`goods`) | oddiy sanaladigan tovar + `menuItem: true` | omborda («Menyuda» belgisi) | o'zi ombordan chiqadi |
| Xizmat (`service`) | `kind: 'service'` (retseptsiz taom, choy), `menuItem: true` | yo'q | ombor o'zgarmaydi |
| Xom ashyo | oddiy tovar, `menuItem: false` (yoki belgisiz) | omborda | menyuda yo'q, buyurtmaga qo'shilmaydi |

**Qoida** (`isOnMenu` = `onMenuFilter()`): `menuItem === true` → menyuda; `false` → yo'q; belgi yo'q → turi bo'yicha
(texkarta/xizmat — menyuda, oddiy tovar — yo'q). Shu tufayli umumiy mahsulot formasi/mobil/import orqali qo'shilgan
texkarta menyudan yo'qolmaydi, yangi xom ashyo esa menyuga o'zi chiqmaydi.

**Qayerda qo'llanadi:** `buildMenu` (xodim menyusi `/api/restaurant/menu`, mobil `/api/mobile/restaurant/menu`, mijoz
`publicMenu`) — faqat menyudagilar; `prepareItems` (taom qo'shish, mijoz QR) — menyuda bo'lmagan mahsulot `productNotFound`;
Ombor `/app/products` va mobil `GET /api/mobile/products?stock=1` — restoran do'konida (`tables` moduli) faqat
`kind ∉ {bundle, service}` (`stockOnlyFilter`), tugagan xom ashyo ham («Tugagan», 0 kg), «Menyuda» belgisi va
«Ishlatiladi: N taomda» (`ingredientUsage`). Restoran bo'lmagan do'kon — o'zgarishsiz.

**Migratsiya (bir martalik, idempotent):** `ensureMenuFlags(m)` — menyu birinchi ochilganda (yuqoridagi har qanday yo'l,
Menyu/Ombor sahifasi): `ShopSettings.menuVersion < 1` bo'lsa, belgisi YO'Q mahsulotlarga: texkarta/xizmat → `true`;
stansiyasi, modifikatori, stop-listi bor yoki restoran buyurtmasida (`Order.items.productId`) sotilgan tovar → `true`;
qolgan tovar (xom ashyo) → `false`; so'ng `menuVersion = 1` (`$max`). Belgisi bor mahsulotga tegilmaydi — takroriy yoki
parallel ishga tushish egasining tanlovini buzmaydi. Jarayon ichida keshlanadi (DB nomi bo'yicha). Migratsiya xato bersa —
log va eski xatti-harakat (filialning barcha sotuvdagi mahsulotlari menyuda). Yangi do'kon: ro'yxatdan o'tish ustasi
namunasi va demo seed belgilarni o'zi qo'yadi.

**«Menyu» bo'limi** (`/app/menu`, `lib/restaurant/menuAdmin.ts`):
- `menuAdminView(ctx, { branchId? })` — kategoriyalar bo'yicha taomlar: narx, stansiya, stop-list, **porsiya** (taom —
  `min(xom ashyo qoldig'i / porsiyadagi miqdor)`, 0 — «Tugagan»; tovar — qoldiq; xizmat — `null`), **tannarx** (taom —
  retseptdan JORIY kelish narxlarida) va **foyda %** = (narx − tannarx) / narx — faqat `product.viewCost`; `hidden` —
  menyudan olingan taom/xizmatlar. Huquq: `product.create | product.edit | menu.stopList`.
- `dishFormData(ctx, { id? | branchId? })` — forma: taom, ombor tovarlari (menyuda bo'lmagan + retseptdagilar), turkumlar,
  stansiyalar, `can`.
- `saveMenuDish(ctx, DishInput)` — yangi taom/xizmat (`product.create`), tahrir va ombordagi tovarni menyuga qo'shish
  (`product.edit`). Retsept: shu filialdagi sanaladigan oddiy tovarlar, takrorsiz, ≤ 30, miqdor asosiy birlikda (kasrli
  birlikda ≤ 3 xona — 1 g aniqlik, dona — butun). Tovar turini almashtirib bo'lmaydi (taom ↔ xizmat — mumkin). Audit:
  `product.create` | `product.menu` | `product.menuOn`, retsept o'zgarsa — `product.recipe` (izoh: «Guruch 0,15 kg → 0,2 kg;
  + Zira 0,005 kg; − Sabzi», `meta.before/after`).
- `setMenuMembership(ctx, id, inMenu)` — menyuga qaytarish / menyudan olish (`product.edit`; mahsulot o'chmaydi). Audit
  `product.menuOn|menuOff`.
- `quickCreateIngredient(ctx, { name, unit, cost, qty, branchId? })` — retsept muharriridan tez xom ashyo (omborga,
  `menuItem: false`, `product.create`; qoldiq > 0 — sxema `quantity ≥ 0.001`).
- Retsept muharriri birliklari (`recipeUnits.ts`): kg → g/kg, l → ml/l, t → kg/t, dona — dona; `toBaseQty` asosiy birlikka
  aylantiradi (3 xonadan nozik — rad), `preferredRecipeUnit` saqlangan miqdorni qulay birlikda ko'rsatadi (0,15 kg → 150 g).

### Sale (+ maydonlar)
`orderId?`, `tableNumber?` (indeks `{orderId}`).

### ShopSettings.restaurant
```
serviceChargePct 0–30 (standart 0), takeawayPackFee (so'm, 0), requireVoidReason (true),
kdsWarnMinutes (10), kdsAlertMinutes (20, > warn), brand { logoUrl?, color? (#RRGGBB), coverUrl? },
info { about? (≤300), address? (≤160), phone?, workHours? (≤80), instagram?, telegram?, takeawayByPhone? }
```
Logo/muqova — faqat shu do'konga yuklangan rasm (`/api/upload`, `isTenantUploadUrl`).
`info` — umumiy mijoz sahifasi (§9a) uchun ochiq aloqa ma'lumoti, hammasi ixtiyoriy. Saqlashda `lib/restaurant/info.ts →
normalizeRestaurantInfo` keltiradi: telefon — O'zbekiston raqami «+998 90 123 45 67», xorijiy «+…» (8–15 raqam) yoki qisqa
raqam (3–5); Instagram/Telegram — login, «@login» yoki havola → login (@ siz); noto'g'ri maydon — `badSettings` + `details.field`.
Kirish: `saveRestaurantSettingsAction({ info: { … } })` — maydon berilmasa o'zgarmaydi, `''`/`null` — o'chiriladi.

**Bir filialda bir nechta login (xodimlar).** «Filial» — alohida savdo nuqtasi va uning o'z logini («Filial qo'shish»);
«Xodim» — mavjud filialga (yoki egasining asosiy omboriga, `isMain`) biriktirilgan qo'shimcha login: ism (`User.fullName`),
login, parol, rol shabloni. `User.staff = true` (asosiy omborga bog'langan login ham xodim hisoblanadi). Mantiq —
`lib/staff.ts` (createStaff/updateStaff/deleteStaff): login formati `LOGIN_RE`, parol ≥ 6, tarif `maxUsers` (faol loginlar,
egasi bilan — `checkPlanLimits`; to'lganda qo'shish va qayta faollashtirish rad etiladi, 403), global login registri,
audit `user.create|update|reset_password|delete`. Filial, holat yoki parol o'zgarsa — `tokenVersion` oshadi (sessiya yopiladi).
Buyurtma/sotuv tarixi bor xodim o'chirilmaydi (nofaol qilinadi); xodimi bor filial o'chirilmaydi (`errHasStaff`).
UI: web `/app/users` → «Xodim qo'shish» (filial tanlash, ism, rol, login, parol; tahrirlash — ism, filial, yangi parol,
bloklash; rol — «Huquqlar»); `app/actions/staff.ts`. Mobil: `mobile/app/branches.tsx` → «Xodimlar» tabi,
API `GET|POST|PATCH /api/mobile/staff` (egasi + `users.manage`). Bitta joyli restoran uchun tavsiya: zal/stol/taom —
asosiy omborda, xodimlar — shu filialga.

**Menu slug qarori:** alohida `menuSlug` SAQLANMAYDI. QR manzili `/m/<Organization.slug>/<Table.qrToken>` — do'kon slug'i
master bazada noyob va tenantni topish uchun yetarli (yangi master indeks/migratsiya shart emas). Sozlama
ko'rinishida `menuSlug` (= org slug) va `qrBaseUrl` qaytadi.

### AuditLog
Yangi `entity: 'order'` (`d.crm.audit.entities.order`). Amallar: `order.open|send|voidItem|voidItem.loss|precheck|reopen|pay|cancel|transfer|qrConfirm|qrReject|qr`,
`product.menu|menuOn|menuOff|recipe|stopListOn|stopListOff`, `settings.restaurant`, `hall.*`, `table.*`, `station.*`.

---

## 3. Holatlar

```
Taom:
  (QR) pending ──tasdiq──► new ──yuborish (ombor band)──► sent ──► cooking ──► ready ──► served
                  └─rad──► voided        │ stansiyasiz → darhol served          ▲  │
                                         └───────────────► ready/served ────────┘  └─ «qaytarish» ready → cooking
  bekor (voided):  pending/new — oddiy (order.create)
                   sent        — order.voidItem, sabab*, OMBOR QAYTADI
                   cooking/ready/served — order.voidItem, sabab*, ombor QAYTMAYDI → «yo'qotish» audit (order.voidItem.loss)
                   (* requireVoidReason yoqiq bo'lsa). To'langan taom bekor qilinmaydi (Sotuvlar bo'limidan qaytarish).

Buyurtma:
  open ──pre-chek──► precheck ──to'lov (oxirgi qism)──► paid
   ▲  └─────────────── qayta ochish (order.reopen) ◄───┘
   └── to'lov (oxirgi qism) ──► paid;   open/precheck ──bekor (faol taom va to'lov yo'q)──► cancelled
```

Holat bo'yicha amallar (`rules.ts → orderAllows`):

| Holat | Mumkin |
|---|---|
| open | addItems, send, confirm, void, bump, transfer, precheck, pay, cancel, edit |
| precheck | bump, transfer, reopen, pay, cancel |
| paid | bump (to'langan saboy hali tayyorlanayotgan bo'lishi mumkin) |
| cancelled | — |

---

## 4. Asosiy qoidalar (backend kafolatlaydi)

1. **Ombor yuborishda band qilinadi** (`reserveStock`, texkarta tarkibi — hammasi yoki hech biri). Yetmasa yoki
   stop-listda bo'lsa — o'sha taom `new` bo'lib qoladi, `failed[]` da sabab (`outOfStock|stopListed|productNotFound`).
   Hammasi yetmasa — xato `sendFailed` (`details.failed`).
2. **Stansiyasiz taom** (masalan non, shisha suv) yuborilganda darhol `served` (sentAt=readyAt=servedAt) — KDS'ga chiqmaydi.
3. **Pre-chek** va **to'lov** yuborilmagan (`new`) taomlarni avval avtomatik yuboradi. `pending` (mijoz QR) taom
   bo'lsa — `pendingItems` (avval tasdiqlang/rad eting).
4. **To'lov → Sale:** har taom — alohida naqd `Sale` (`paymentType: 'cash'`, `status: 'paid'`, umumiy `checkoutId`,
   `soldBy` = buyurtma ofitsanti, `orderId`, `tableNumber`, `notes` = taom izohi, nom — «Osh (Katta)»). Ombor QAYTA band
   qilinmaydi. To'lov usullari qatorlarga «sharshara» (`allocateParts`, POS bilan bir xil); qaytim faqat naqddan.
5. **Xizmat haqi va qadoq** — filialdagi tizim «xizmat» mahsuloti (`kind: 'service'`, `systemKey: restaurant.serviceCharge|packFee`,
   imei `SYS-SVC-<branchId>`/`SYS-PACK-<branchId>`, soft-delete holatida — ombor/menyu ro'yxatlarida ko'rinmaydi) ga
   alohida Sale qatori: nomi «Xizmat haqi (10%)» / «Qadoq», `productSnapshot.imei` «XIZMAT» / «QADOQ», tannarx 0.
   **Nega:** kassa smenasi (`computeShiftTotals`), naqd kassa, hisobotlar, moliya, chek — hammasi `Sale.payments` dan
   hisoblanadi; alohida qator bo'lgani uchun ular o'zgarishsiz ishlaydi va xizmat haqi daromad sifatida ko'rinadi.
   Xizmat haqi = (taomlar − chegirma) × foiz, butun so'm; faqat `dine_in` (saboy va `qr_self` — 0).
   Qadoq — saboyda butun buyurtmaga bir marta, birinchi to'lov qismida.
6. **Hisobni bo'lish:** `items: [{ itemId, qty? }]` — tanlangan taomlar (qisman miqdor — qator ikkiga bo'linadi), har qism
   alohida `checkoutId` va chek; xizmat haqi shu qismdan. **Teng bo'lish** — faqat hisob-kitob: `splitEqually(due, n)`
   bilan ulushlar hisoblanadi va to'lov bitta so'rovda bir nechta `parts` bilan yuboriladi (yarim to'langan qarzdor
   Sale paydo bo'lmasligi uchun).
7. **UzQR:** `PAY_METHODS` ga `uzqr` qo'shildi (karta/o'tkazma qatorida — naqd kassaga kirmaydi). Lug'at: `d.sales.payMethods.uzqr`.
8. **Idempotentlik:** taom qo'shish — `clientItemId`; stol ochish — `clientOrderId` (va stol noyobligi); to'lov — `payId`;
   mijoz QR — `clientOrderId` (taomlari `<clientOrderId>:<n>`). Takroriy so'rov — avvalgi natija, ikkinchi yozuv yo'q.
9. **Parallel o'zgarishlar:** har yozuv `rev` bo'yicha optimistik qulf, 3 marta qayta urinadi; ombor yon ta'siri
   to'qnashuvda qaytariladi. Oxirida ham bo'lmasa — `conflict` (409): UI buyurtmani qayta o'qib, takrorlaydi.
10. **To'lov atomikligi:** Sale qatorlari «hammasi yoki hech biri»; yozilmasa — yaratilganlar o'chadi, buyurtma to'lanmagan holatga qaytadi.
11. **Bekor qilingan, tayyorlangan taom** — ombordan chiqqan, sotuv yo'q: yo'qotish auditda va `timings` hisobotida (`voids.loss*`).
12. Keyinchalik Sotuvlar bo'limida restoran Sale'ini bekor qilish/qaytarish — mavjud qoida bo'yicha (ombor qaytadi);
    buyurtma `paid` bo'lib qoladi.

---

## 5. JSON shakllari

### OpResult / xatolar
API: muvaffaqiyat — 200/201 + ma'lumot; xato — `{ error: string, code: RestaurantErrorCode, details? }` + HTTP holati.
Server action: `{ ok: true, data, success? }` yoki `{ ok: false, error, code, details? }`.

### OrderView (`lib/restaurant/view.ts`)
```ts
{
  id, orderNo, branchId, type, source, status, tableId, tableNumber, hallId, hallName /* pre-chek uchun */, guests, waiterId,
  waiterName, note, serviceChargePct, packFee, packFeePaid, openedBy, openedAt, precheckAt, paidAt, cancelledAt, cancelReason,
  updatedAt, rev, requireVoidReason /* sozlama: yuborilgan taomni bekor qilishda sabab majburiy */,
  items: OrderItemView[],
  payments: [{ checkoutId, itemIds, saleIds, subtotal, discount, serviceCharge, packFee, total, parts, change, paidAt, by,
               publicPath /* "/r/…" ochiq chek */ }],
  bill: { subtotal, paid, dueSubtotal, dueServiceCharge, duePackFee, due, total, servicePct,
          counts: { items, pending, unsent, active, ready, voided, unpaid } },
  can?: { view, edit, send, voidUnsent, voidSent, serve, transfer, precheck, reopen, pay, split, discount, cancel }
}
OrderItemView = { id, clientItemId, productId, name, displayName, basePrice, price, qty, unit, total, modifiers, note,
  stationId, stationKind, status, stockReserved, fromQr, addedBy, addedAt, sentAt, cookStartedAt, readyAt, servedAt,
  voidedAt, voidedBy, voidReason, voidStage, paid, paidCheckoutId, saleId,
  timings: { waitMs, prepMs /* ready−sent */, deliveryMs /* served−ready */, totalMs } }
```
Barcha sanalar — ISO satr yoki `null`. Pre-chek chekida `d.restaurant.common.precheckNote` («fiskal chek emas») majburiy.
**Xodim ismi:** `waiterName`, `openedBy`, `items[].addedBy/voidedBy`, `payments[].by` (shuningdek OrderSummary,
KDS `waiterName`, hisobotlar) — ko'rsatish uchun ISM (`User.fullName`, bo'lmasa login; `lib/staffNames.ts`,
`ops.staffNamesFor(ctx)` — so'rov davomida bir marta o'qiladi). Bazada login saqlanadi (`Order.waiterName`,
`Sale.soldBy` — o'zgarmaydi); chekda sotuvchi — `withSellerNames` (chek sahifalari).
`hallName` va `requireVoidReason` — `ops.orderViewFor(ctx, order)` to'ldiradi (bitta so'rov ichida ctx bo'yicha keshlanadi):
UI alohida `getShopSettings` o'qimaydi, amal javobidagi `data.order` ham shu maydonlar bilan keladi.

### OrderSummary (ro'yxatlar)
`{ id, orderNo, type, status, source, tableId, tableNumber, guests, waiterId, waiterName, openedAt, updatedAt, access, mine, total|null, due|null, counts|null }`
`access: false` — boshqa ofitsant stoli (summalar `null`).

---

## 6. Server action'lar — `app/actions/restaurant.ts`

Hammasi object argument oladi (FormData emas), zod bilan tekshiradi, natija `ActionResult<T>`. Buyurtma amallari
sahifani revalidate QILMAYDI — `data.order` dan holatni yangilang (yoki `router.refresh()`).

| Action | Kirish | Huquq | `data` |
|---|---|---|---|
| `openOrderAction(input)` | `{ type: 'dine_in'\|'takeaway', tableId?, branchId?, guests?, note?, clientOrderId?, items? }` | order.create | `{ order, existing }` |
| `addOrderItemsAction(orderId, { items })` | `items: [{ clientItemId?, productId, qty, optionIds?, note? }]` (≤50) | order.create | `{ order, added: id[], duplicates: clientItemId[] }` |
| `sendToKitchenAction(orderId, { itemIds? })` | | order.create | `{ order, sent, failed: [{ itemId, name, reason, message }] }` |
| `confirmQrItemsAction(orderId, { itemIds?, reject?, send? })` | | order.create | `{ order, confirmed, rejected, sent?, failed? }` |
| `voidOrderItemAction(orderId, { itemId, qty?, reason? })` | | order.create / order.voidItem | `{ order, voidedItemId, stockReleased, loss }` |
| `bumpItemsAction(orderId, { itemIds, to })` | `to: 'cooking'\|'ready'\|'served'` | kitchen.bump (served: yoki order.create) | `{ order, updated, skipped }` |
| `transferOrderAction(orderId, { tableId?, waiterId? })` | | order.transfer | `{ order }` |
| `precheckOrderAction(orderId)` | | order.create | `{ order }` |
| `reopenOrderAction(orderId)` | | order.reopen | `{ order }` |
| `payOrderAction(orderId, input)` | `{ items?: [{ itemId, qty? }], parts: [{ method, amount }], discount?: { kind: 'percent'\|'amount', value }, payId? }` | sale.create (+order.split, +sale.discount) | `{ order, checkoutId, saleIds, receiptNo, total, change, publicPath, closed }` |
| `cancelOrderAction(orderId, { reason? })` | | order.create | `{ order }` |
| `updateOrderInfoAction(orderId, { guests?, note? })` | guests 0 — tozalash | order.create | `{ order }` |
| `ackTableCallAction({ tableId, kind? })` | `kind: 'waiter'\|'bill'` (yo'q — ikkalasi) | order.create yoki order.viewAll | `{ tableId }` |
| `saveRestaurantSettingsAction(input)` | `{ serviceChargePct?, takeawayPackFee?, requireVoidReason?, kdsWarnMinutes?, kdsAlertMinutes?, brand?: { logoUrl?, color?, coverUrl? } }` (null/'' — tozalash) | tables.manage | `RestaurantSettings` |
| `saveHallAction({ id?, name, branchId?, sort?, active? })` | `sort` — zallar tartibi (UI: ← → tugmalari, 0.. ketma-ket qayta yoziladi) | tables.manage | `{ id }` |
| `deleteHallAction(id)` | stollari bo'lsa — `hallHasTables` | tables.manage | `{ id }` |
| `saveTableAction({ id?, hallId, number, seats?, x?, y?, active? })` | | tables.manage | `{ id, qrToken }` |
| `createTablesRangeAction({ hallId, from, to, seats? })` | ≤100 ta, band raqam o'tkaziladi | tables.manage | `{ created, skipped }` |
| `deleteTableAction(id)` | ochiq buyurtma bo'lsa — `tableHasOrder` | tables.manage | `{ id }` |
| `regenerateTableQrAction(id)` | | tables.manage | `{ id, qrToken, qrPath, qrUrl }` |
| `saveStationAction({ id?, name, kind, branchId?, printerIp?, sort?, active? })` | | tables.manage | `{ id }` |
| `deleteStationAction(id)` | taomlar stansiyasiz qoladi | tables.manage | `{ id, detached }` |
| `updateMenuItemAction({ productId, stationId?, modifierGroups?, ikpu? })` | stationId null — olib tashlash; modifierGroups `[{ name, required, min?, max?, options: [{ name, price }] }]`; `/app/products/<id>` va `/app/menu` revalidate | product.edit | `{ id }` |
| `setStopListAction({ productId, stopped })` | | menu.stopList | `{ id, name, stopListed }` |

**«Menyu» bo'limi action'lari — `app/actions/menu.ts`** (§2a; `/app/menu`, `/app/products` revalidate):

| Action | Kirish | Huquq | `data` |
|---|---|---|---|
| `saveMenuDishAction(input)` | `DishInput`: `{ id?, type: 'dish'\|'goods'\|'service', productId? (yangi tovar), branchId?, name, price, categoryId?, photoUrl?, stationId?, ikpu?, modifierGroups?, recipe?: [{ productId, qty (asosiy birlikda) }], cost? (xizmat) }` — `parseDishInput` (id'lar 24 hex, narx butun ≥ 0) | product.create (yangi taom/xizmat) / product.edit | `{ id, created }` |
| `setMenuMembershipAction({ productId, inMenu })` | menyudan olish/qaytarish | product.edit | `{ id, name, inMenu }` |
| `quickCreateIngredientAction({ branchId?, name, unit, cost, qty })` | tez xom ashyo (omborga) | product.create | `StockOption` |

Sahifalar: `/app/menu` (ro'yxat), `/app/menu/new` (`?type=goods&product=<id>` — ombordagi tovarni qo'shish, admin `?branch=`),
`/app/menu/<id>` (tahrir). Eski `/app/restaurant/menu` → `/app/menu` ga yo'naltiradi; restoran sozlamalarida «Menyu» tabi yo'q.

Server komponentda o'qish: `const ctx = await restaurantCtxFromSession()` (`lib/restaurant/session.ts`), so'ng
`queries.tablesBoard(ctx)`, `queries.restaurantSetupView(ctx)` va h.k. — natija `OpResult`.

---

## 7. Web JSON API (sessiya cookie, GET; printer stansiyasi — POST §7a; `Cache-Control: no-store`)

Umumiy parametrlar: `branchId` (admin uchun; filial xodimida e'tiborsiz/tekshiriladi; berilmasa admin — zal ochilgan
birinchi filial, bo'lmasa asosiy ombor), `since` (ISO), `stationId`, `status`, `type`. 401 — sessiya yo'q.

| Yo'l | Huquq | Javob |
|---|---|---|
| `GET /api/restaurant/tables` | tables + (order.create\|order.viewAll) | `TablesBoard`: `{ serverTime, branchId, branches[], halls[{id,name,sort}], tables[{ id, hallId, number, seats, x, y, calls:{waiterAt,billAt}, order: OrderSummary\|null }], takeaway: OrderSummary[] }` |
| `GET /api/restaurant/orders?status=active\|closed\|all&type=&since=` | tables + (order.create\|order.viewAll) | `{ serverTime, next, orders: OrderSummary[] }` (`since` bo'lsa — holatidan qat'i nazar o'zgarganlar; `closed` — oxirgi 24 soat) |
| `GET /api/restaurant/orders/:id` | shu | `{ order: OrderView, serverTime }` |
| `GET /api/restaurant/kitchen?stationId=&since=` | kitchen + kitchen.view | `KitchenBoard`: `{ serverTime, next, branchId, branches, settings:{kdsWarnMinutes,kdsAlertMinutes}, stations[{id,name,kind}], orders: KdsOrder[] }`; `KdsOrder = { id, orderNo, type, status, source, tableNumber, waiterName, guests, note, updatedAt, items: KdsItem[], voided: [{ id, reason, voidedAt }] }`; `KdsItem = { id, name, displayName, qty, unit, modifiers[{group,name}], note, status, stationId, stationKind, fromQr, sentAt, cookStartedAt, readyAt, elapsedMs, level: 'ok'\|'warn'\|'alert' }`. `voided` — shu stansiyada oshxonaga yuborilgandan keyin bekor qilingan taomlar (since rejimida — `since` dan, to'liq rejimda — oxirgi 2 daqiqa; to'liq rejimda faqat yaqinda bekor qilingani bor buyurtma ham `items: []` bilan keladi) |
| `GET /api/restaurant/menu` | (tables\|kitchen) + (order.create\|order.viewAll\|menu.stopList\|kitchen.view) | `{ branchId, categories: string[], items: MenuItemView[] }`; `MenuItemView = { id, name, price, photoUrl, category, categoryId, kind, unit, stationId, stopListed, available (null — cheksiz), ikpu (MXIK yoki null), modifierGroups[{ id, name, required, min, max, options[{ id, name, price }] }] }`. Qoldig'i tugagan tovar (status `sold`) — menyu muharririda va xodim menyusida (`available: 0` → UI «Tugagan», o'chiq); mijoz QR-menyusida yo'q. Faqat MENYUDAGI mahsulotlar (§2a) — xom ashyo chiqmaydi; taom `available` = retsept xom ashyosidan porsiya |
| `GET /api/restaurant/setup` | tables + tables.manage | `{ branchId, branches, settings, menuSlug, qrBaseUrl, halls[], tables[{…, qrToken, qrPath, qrUrl, busy}], stations[] }` |
| `GET /api/restaurant/waiters` | tables + order.transfer | `{ waiters: [{ id, username, name, role }] }` |
| `GET /api/restaurant/reports/timings?from=&to=` | tables + reports.view | `{ from, to, overall, byStation[], byWaiter[], byDish[], voids:{count,amount,lossCount,lossAmount} }` (stats: `{ prep, delivery, wait, total }` har biri `{ count, avgMs, medianMs, p90Ms, maxMs }`; davr ≤93 kun, standart 7 kun) |
| `GET /api/restaurant/reports/overview?p=today\|yesterday\|week\|month` yoki `?from=YYYY-MM-DD&to=YYYY-MM-DD` (≤93 kun), `&branchId=` | tables + reports.view | `RestaurantReport` (`lib/restaurant/reports.ts`): tushum, o'rtacha chek, oshxona vaqtlari (stansiya/taom), ofitsant KPI, bekor qilinganlar va yo'qotish, savdo — `/app/restaurant/reports` sahifasi bilan bir xil |
| `GET /api/restaurant/reports/export?section=kitchen\|staff\|voids\|sales` + overview filtrlari | tables + reports.view + export.data | CSV (UTF-8 BOM, `Content-Disposition: attachment`), ustun nomlari — joriy tilda |

### 7a. Oshxona printeri (printer stansiyasi `/app/kitchen/print`)

Brauzer orqali: kassa/oshxona kompyuterida Chrome `--kiosk-printing` (dialogsiz, asosiy printerga) bilan sahifa ochiq turadi.
Varaq navbatga avtomatik tushadi (ops.ts → `lib/restaurant/print.ts`, xato buyurtma amalini to'xtatmaydi):
- `sendItems` (shu jumladan pre-chek/to'lov oldidan avtomatik yuborish, QR tasdiqlash + yuborish, mobil) — yuborilgan taomlar
  stansiya bo'yicha bitta `order` varag'iga; faqat `printEnabled` va faol stansiyalar. Stansiyasiz taom tushmaydi.
- `voidItem` — taom `sent|cooking|ready` holatida bekor qilinsa, `void` varag'i (sabab bilan, «BEKOR QILINDI / TAYYORLAMANG!»).

| Yo'l | Huquq | Javob |
|---|---|---|
| `POST /api/restaurant/print` `{ deviceId, branchId?, stationId?, claim? }` | kitchen + kitchen.view | `PrintStationBoard`: `{ serverTime, branchId, branches, stations[{id,name,kind,printEnabled}], jobs: PrintJobView[], recent: PrintJobView[] }`. `claim: true` — 5 tagacha varaq shu qurilmaga atomik beriladi (`findOneAndUpdate`) |
| `POST /api/restaurant/print/:id` `{ op: 'done' }` | shu | `{ id, printed }` (takror — zararsiz) |
| `POST /api/restaurant/print/:id` `{ op: 'reprint' }` | shu | `{ id }` — «NUSXA» belgili yangi varaq navbatga; asl varaq o'zgarmaydi; audit `print.reprint` |

Qoidalar (`lib/restaurant/printQueue.ts`): olingan, lekin `done` bo'lmagan varaq 60 s dan keyin boshqa qurilmaga o'tadi (shu
qurilma — darhol qayta oladi); 30 daqiqadan eski yoki 5 marta olingan varaq avtomatik chiqmaydi (`stale: true`, qo'lda qayta
chop etiladi). `stationId` bo'sh — filialning barcha stansiyalari. Klient: navbat bo'sh bo'lgandagina `claim` qiladi, varaqlarni
bittadan `window.print()` qiladi, keyin `done`; sahifa yashirin bo'lsa ham so'rov to'xtamaydi (KDS'dan farqi).
`PrintJobView = { id, kind, status, stationId, stationName, orderId, orderNo, orderType, tableNumber, waiterName, guests, orderNote, lines[{name,qty,unit,modifiers,note,fromQr,reason}], copy, queuedAt, printedAt, printedBy, attempts, stale }`.
Sozlash: Restoran sozlamalari → Stansiyalar → «Avtomatik chop etish»; Chrome yorlig'i buyrug'i sahifadagi yo'riqnomada.

### Polling tavsiyasi
- Stollar taxtasi: 4–5 s, to'liq yengil ro'yxat (`tables`). Buyurtma ekrani: 3–5 s `orders/:id` yoki `orders?since=`.
- **Mijoz chaqiruvi / hisob so'rovi** (`tables[].calls`) shu taxta so'rovida keladi — alohida kanal shart emas: web
  `/app/tables` 4 s (yangi chaqiruv — ekran o'quvchiga e'lon + tebranish, zal tabida qizil nuqta), mobil 5 s. Ya'ni mijoz
  bosgandan keyin ko'pi bilan ~4–5 s da ko'rinadi; sahifa yashirin bo'lsa, ko'ringanda darhol so'raladi. Buyurtma ekranida
  (`/app/tables/:id`) chaqiruvlar ko'rinmaydi — ofitsant taxtaga qaytadi. Tezroq kerak bo'lsa — SSE (keyingi bosqich).
- KDS: 3 s. Birinchi so'rov `since`siz; keyin `since=<oldingi javob next>`. `next` = so'rov boshidan 5 s oldin —
  javoblar ustma-ust tushadi, buyurtmani `id` bo'yicha ALMASHTIRING; `items: []` — kartochkani olib tashlang.
- Sahifa yashirin bo'lsa (`document.hidden`) polling to'xtatilsin. Real vaqt (SSE/Redis pub-sub) — keyingi bosqich.

---

## 8. Mobil API (`Authorization: Bearer <token>`, muddati o'tgan do'konda yozish — 402)

Xato matnlari — ilova tilida: mobil ilova har so'rovda `Accept-Language: uz|ru` yuboradi (`mobile/lib/api.ts`),
server `mobileLocale(req)` (`lib/restaurant/session.ts`) bo'yicha lug'at tanlaydi; boshqa/yo'q bo'lsa — o'zbekcha.
Xato kodi (`code`) tildan qat'i nazar bir xil — ilova mantiqni kodga qarab quradi.

| Yo'l | Metod | Tana / parametr | Javob |
|---|---|---|---|
| `/api/mobile/restaurant/tables` | GET | `?branchId=` | TablesBoard |
| `/api/mobile/restaurant/tables` | POST | `{ op: 'ackCall', tableId, kind? }` | `{ tableId }` |
| `/api/mobile/restaurant/menu` | GET | `?branchId=` | `{ branchId, categories, items }` |
| `/api/mobile/restaurant/orders` | GET | `?status=&type=&since=` | `{ serverTime, next, orders }` |
| `/api/mobile/restaurant/orders` | POST | openOrder kirishi (`clientOrderId` tavsiya) | `{ order, existing }` |
| `/api/mobile/restaurant/orders/:id` | GET | | `{ order, serverTime }` (`serverTime` — telefon soati farqi uchun; `order.requireVoidReason` — sabab maydoni majburiymi) |
| `/api/mobile/restaurant/orders/:id` | POST | `{ op: 'addItems', items }` · `{ op: 'send', itemIds? }` · `{ op: 'served', itemIds }` · `{ op: 'void', itemId, qty?, reason? }` · `{ op: 'confirm', itemIds?, reject?, send? }` · `{ op: 'precheck' }` · `{ op: 'info', guests?, note? }` · `{ op: 'cancel', reason? }` (yuborilgan faol taom va to'lov bo'lmasa) | tegishli action `data` shakli |

**Ombor (mobil «Mahsulotlar» tabi):** `GET /api/mobile/products?stock=1` — restoran do'konida (`tables`) faqat xom ashyo va
tayyor tovar (tugaganlari ham), har qatorda `menuItem` («Menyuda»); `stock`siz so'rov (sotuv/ko'chirish tanlovi) o'zgarmagan.
Ilova: `mobile/app/(tabs)/products.tsx` (sarlavha «Xom ashyo va tovarlar», tab — «Ombor»).

To'lov mobil API'da yo'q (kassa — web). Oflayn kelajak uchun: har taomga qurilmada `clientItemId` (UUID) bering —
takroriy yuborish xavfsiz. `GET /api/mobile/me` → `features.tables|kitchen|qrMenu` va `permissions` (yangi kalitlar bilan).
Mobil buyurtma ekrani (`mobile/app/order/[id].tsx`): bekor qilishda sabab faqat `order.requireVoidReason` yoqiq va taom
yuborilgan bo'lsa majburiy; «Buyurtmani bekor qilish» — `can.cancel` bo'lsa (yuborilgan taom yoki to'lov bo'lsa — o'chiq, izoh bilan).

---

## 9. Ochiq QR API (login yo'q)

Shart: do'kon faol, `qrMenu` va `tables` yoqiq, stol faol. Aks holda 404 `qrUnavailable`. Javoblar `no-store`, `noindex`.
Til — `savora_lang` cookie (`?lang=ru` middleware orqali).

| Yo'l | Metod | Rate-limit | Kirish | Javob |
|---|---|---|---|---|
| `/api/public/menu/:slug/:token` | GET | 120/daq IP+stol, 1500/daq IP | — | `{ org:{name}, brand:{logoUrl,color,coverUrl}, table:{number,hall}, serviceChargePct, categories, items[{ id, name, price, photoUrl, category, categoryId, kind, unit, modifierGroups }] }` (stop-list va tugaganlar yashirin; tannarx/qoldiq/stansiya yo'q) |
| `/api/public/menu/:slug/:token/order` | GET | 120/daq IP+stol, 1500/daq IP | — | `{ orderNo, items[{ name, qty, price, total, status }], due, serviceCharge }` |
| `/api/public/menu/:slug/:token/order` | POST | 10/10 daq IP + 20/10 daq stol | `{ clientOrderId (8–40, [A-Za-z0-9_-]), items: [{ productId, qty (≤20), optionIds?, note? }] (≤30) }` | 201 + order holati + `added` |
| `/api/public/menu/:slug/:token/call` | POST | 20/5 daq IP + 6/5 daq stol | `{ kind: 'waiter'\|'bill' }` | `{ kind, at }` |

**O'qish limiti nega IP+stol:** restoran Wi-Fi'da barcha mijozlar bitta tashqi IP'da — faqat IP bo'yicha 120/daq bo'lsa,
band kechqurun (20–30 stol, har stolda 2–3 telefon, holat 12–30 s da so'raladi) limitga urilardi. Asosiy chegara endi
IP + stol tokeni bo'yicha (bitta stol telefonlari uchun yetarli), IP bo'yicha esa keng (1500/daq — bitta IP'dan ko'p tokenni
terib chiqishga qarshi). Sahifa (`/m/...`) ham shu ikki limitni ishlatadi. Yozish limitlari (buyurtma, chaqiruv) o'zgarmagan.

Mijoz taomlari `pending` — ofitsant tasdiqlamaguncha oshxonaga ketmaydi, ombor band qilinmaydi. Stolda ochiq buyurtma
bo'lsa unga qo'shiladi (pre-chek chiqqan bo'lsa — `orderLocked`), bo'lmasa `qr_self` buyurtma (ofitsantsiz, xizmat haqi 0%)
ochiladi; tasdiqlagan ofitsant egasi bo'ladi. Bir buyurtmada tasdiqlanmagan taom ≤50 (`qrTooManyPending`).
Mijoz sahifasi: `/m/<slug>/<token>` (`qrMenuPath`); QR rasmiga `qrUrl` (`/api/restaurant/setup`) yoziladi.
Taom javobi oq ro'yxat bilan (`toPublicItem` → `PublicMenuItem`): `MenuItemView` ga keyin qo'shilgan ichki maydon chiqmaydi.

### 9a. Umumiy mijoz sahifasi (stolsiz, faqat o'qish)

Sahifa: **`/m/<slug>`** (`restaurantPagePath`, `app/m/[slug]/page.tsx`) — kirish eshigi plakati, Instagram/Telegram
havolasi uchun. Brend (logo, nom, muqova, rang), tavsif, aloqa (manzil, telefon, ish vaqti, Instagram, Telegram),
xizmat haqi e'loni va menyu (kategoriya tablari, rasm, narx, modifikatorlar narxi bilan; stop-list va tugaganlar yashirin),
uz/ru. **Buyurtma bermaydi**: «Buyurtma berish uchun stolingizdagi QR kodni skanerlang»; `info.takeawayByPhone` va
telefon bo'lsa — «Olib ketish uchun buyurtma: <raqam>» (tel: havola). Stol sahifasi bilan bir xil komponentlar
(`components/restaurant/qr/MenuHeader.tsx`, `MenuSections.tsx` — `mode: 'view'`, `ItemSheet` — `onAdd`siz, `StoreMenu.tsx`).
SEO: indekslanadi (stol sahifasi `noindex` qoladi): title `{name} — menyu`, description (tavsif yoki `qrMenu.storeMetaDesc`),
canonical `/m/<slug>`, OG/Twitter rasm — muqova yoki logo, JSON-LD `Restaurant`. Sitemap'ga qo'shilmagan.

Shart: do'kon faol, `qrMenu` va `tables` yoqiq (stol sharti yo'q); aks holda 404 `qrUnavailable` (sabab ochilmaydi,
`app/m/[slug]/not-found.tsx`). Menyu filiali — birinchi faol zal filiali (admin standarti bilan bir xil), zal bo'lmasa asosiy
filial (`resolvePublicStore` hech narsa yozmaydi).

| Yo'l | Metod | Rate-limit | Javob |
|---|---|---|---|
| `/api/public/menu/:slug` | GET | 240/daq IP (`LIMITS.readStore`, sahifa bilan bitta kalit) | `{ org:{name,slug}, brand:{logoUrl,color,coverUrl}, info:{about,address,phone,workHours,instagram,telegram,takeawayByPhone}, serviceChargePct, categories, items[PublicMenuItem] }` |

Muvaffaqiyatli javob — `Cache-Control: public, max-age=30, stale-while-revalidate=30` (til va mijozga bog'liq emas),
xato — `no-store`. Server keshi: `loadPublicStorePage` (jarayon ichida, slug bo'yicha 30 s, «topilmadi» ham; bir vaqtdagi
so'rovlar bitta DB o'qishiga birlashadi); sozlama saqlanganda shu jarayonda `forgetPublicStore(slug)` (boshqa pm2
instance'da ko'pi bilan 30 s eski). Narx/stop-list o'zgarishi ham 30 s gacha kechikishi mumkin — sahifa buyurtma olmaydi.

Admin: «Restoran sozlamalari → Umumiy» → **«Mijoz sahifasi»** bloki (`components/restaurant/settings/CustomerPageSection.tsx`,
`#rs-customer`): havola (nusxalash, «Ochib ko'rish»), QR (PNG 1024 px / SVG yuklab olish), plakat
**`/app/restaurant/poster?size=a5|a4`** (logo, nom, «Menyu», QR, qisqa manzil, ish vaqti/telefon/Instagram), aloqa maydonlari
(bitta «Saqlash» bilan). «Zal va stollar» QR panelida — «Mijoz sahifasi» havolasi.

---

## 10. Xato kodlari (`d.restaurant.errors.<code>`)

| Kod | HTTP | Ma'no |
|---|---|---|
| `moduleOff` | 403 | modul o'chiq |
| `noPermission` | 403 | huquq yo'q (`{label}` — huquq nomi) |
| `badInput`, `badBranch`, `badQty`, `badModifiers`, `badSettings`, `badColor`, `badUrl`, `badModifierGroups`, `voidReasonRequired`, `tooManyItems`, `discountTooBig`, `underpaid`, `overpaidCard`, `overpaid`, `nothingToSend`, `nothingToPay`, `emptyOrder` | 400 | kirish/biznes qoidasi |
| `orderNotFound`, `tableNotFound`, `hallNotFound`, `stationNotFound`, `printJobNotFound`, `productNotFound`, `itemNotFound`, `waiterNotFound`, `qrUnavailable` | 404 | topilmadi yoki ko'rish huquqi yo'q (ma'lumot sizmasin) |
| `tableBusy`, `tableNumberTaken`, `conflict`, `orderClosed`, `orderLocked`, `notPrecheck`, `badTransition`, `itemPaid`, `hasActiveItems`, `hasPayments`, `hallHasTables`, `tableHasOrder`, `pendingItems`, `stopListed`, `outOfStock`, `sendFailed` | 409 | holat ziddiyati (`sendFailed` → `details.failed[]`, `badTransition` → `details.skipped[]`) |
| `rateLimited` | 429 | `Retry-After` sarlavhasi bilan |
| `failed` | 500 | kutilmagan xato (log yozilgan) |
| `qrTooManyPending` | 400 | mijoz QR cheklovi |

---

## 11. Lug'at (`lib/i18n/dict/restaurant.ts`, `d.restaurant`)

| Bo'lim | Hozir bor | UI agenti qo'shadi |
|---|---|---|
| `common` | stol/zal/ofitsant, `orderTypes`, `orderStatuses`, `orderSources`, `itemStatuses`, `stationKinds`, `voidStages`, `serviceChargeLine`, `packFeeLine`, `precheckNote`, `minutes` | — |
| `errors` | server xabarlari (kalit = xato kodi) | yangi kod faqat backend bilan |
| `settings` | `/app/restaurant` asosiy yorliqlari va natija xabarlari | forma matnlari |
| `tables` | taxta holatlari, chaqiruvlar | sahifa matnlari |
| `order` | amal tugmalari, hisob qatorlari, natija xabarlari | ekran matnlari |
| `kitchen` | KDS tugmalari, ustunlar, stop-list | ekran matnlari |
| `print` | printer stansiyasi, varaq matnlari, sozlash yo'riqnomasi | — |
| `qrMenu` | mijoz sahifasi asosiy matnlari | qolganlari |
| `reports` | vaqt hisoboti sarlavhalari | jadval matnlari |

Boshqa lug'atlarga qo'shildi: `d.catalog.features.{tables,kitchen,qrMenu}`, `d.catalog.permissions.{order.*,kitchen.*,menu.stopList,tables.manage}`,
`d.catalog.permissionPages.{tables,kitchen,restaurant}`, `d.shell.nav.links['/app/tables'|'/app/kitchen'|'/app/restaurant']`,
`d.sales.payMethods.uzqr`, `d.crm.audit.entities.order`. Qoida: `ru: typeof uz`, kalitlar bir xil (`tests/i18n.test.ts`).

---

## 12. Tekshiruv

- `npx vitest run` — `tests/restaurantLogic.test.ts` (hisob, holatlar, ruxsatlar, modifikatorlar, vaqtlar, QR, preset, huquq versiyasi, rollar).
- `MONGO_TEST_URI=mongodb://127.0.0.1:27019 npx vitest run tests/restaurantFlow.test.ts` — to'liq oqim: stol, idempotent qo'shish,
  texkarta band qilish, parallel yuborish, KDS, bekor qilish (ombor qaytadi / yo'qotish), pre-chek qulfi, qayta ochish,
  bo'lib to'lash, `payId` takrori, Sale qatorlari, kassa smenasi (naqd + UzQR), saboy qadoq, mijoz QR, o'tkazish, parallel stol ochish, rollar.

- `npx vitest run tests/kitchenKds.test.ts` — KDS mantiqi (birlashtirish, bekor/kamaygan taom, «Tayyor» ustuni).
- `npx vitest run tests/kitchenPrint.test.ts` — oshxona printeri: varaqlarga ajratish, olish sharti, eskirgan varaq, varaq render, Chrome buyrug'i.
- `MONGO_TEST_URI=mongodb://127.0.0.1:27019 npx vitest run tests/kitchenPrintFlow.test.ts` — yuborish → varaq, bitta qurilma oladi,
  muddat o'tgach boshqasiga, bekor varag'i, NUSXA + audit, eskirgan varaq, huquq va filial chegarasi.
- `MONGO_TEST_URI=mongodb://127.0.0.1:27019 npx vitest run tests/restaurantMenu.test.ts` — menyu va ombor (§2a): `isOnMenu`,
  retsept birliklari (g ↔ kg, 3 xona), tannarx/foyda/porsiya, `parseDishInput` (NoSQL injection); migratsiya (texkarta,
  xizmat, stansiyali, sotilgan → menyu; xom ashyo → ombor; takror — egasining tanlovi saqlanadi), mijoz menyusida xom ashyo
  yo'q, xom ashyo buyurtmaga qo'shilmaydi, taom retsept bilan (tannarx, porsiya), yuborishda xom ashyo chiqadi, tugasa —
  «Tugagan» va `outOfStock`, ombordagi tovarni menyuga qo'shish/olish, tez xom ashyo, «qaysi taomlarda ishlatiladi».
- `npx vitest run tests/restaurantSettingsUi.test.ts` — Menyu ro'yxati va taom formasi (render: porsiya, tannarx, g ↔ kg).
- `npx vitest run tests/restaurantCustomerPage.test.ts` — umumiy mijoz sahifasi: aloqa ma'lumoti (telefon, Instagram,
  Telegram, normalize), oq ro'yxat (`toPublicItem`), `GET /api/public/menu/<slug>` (modul o'chiq/faol emas — 404, ichki
  maydonlar yo'q, kesh, rate-limit 429) — bazasiz.

## 13. Keyingi bosqich (backendda hali yo'q)

Fiskal chek (virtual kassa hamkor), tarmoq printeri agenti (TCP 9100, `printerIp`; brauzer printer stansiyasi — §7a, bor), SSE/Redis real vaqt, kurslar, bron,
choychaqa, agregatorlar, PIN-kirish (`User.pinHash` — planshet rejimi: qurilmani ishonchli qilish va bekor qilish
mexanizmi, sessiya almashish/avto-qulf kerak; hozircha qilinmadi), ofitsant KPI sahifasi, mobil oflayn navbat (`clientItemId` tayyor).

## 14. Demo restoran va uchdan-uchgacha sinov (faqat lokal dev)

`npm run seed:restaurant` (`scripts/seed-demo-restaurant.mjs`) — `demo-restoran` do'konini yaratadi yoki to'ldiradi
(idempotent): Pro tarif, `restaurant` turi (tables/kitchen/qrMenu), loginlar `dr_admin`, `dr_ofitsant`, `dr_oshpaz`,
`dr_kassir` (rol shablonlari; parol — skriptda yoki `SEED_RESTAURANT_PASSWORD`), «Asosiy zal» (1–4) va «Terrasa» (5–6),
stansiyalar «Issiq sex»/«Bar»; menyu va ombor ajratilgan (§2a): OMBORDA 13 xom ashyo (guruch, mol go'shti, sabzi, piyoz, yog',
un, shakar, pomidor, bodring, tovuq filesi, salat, kofe doni, quruq choy); MENYUDA 8 taom retsept bilan (Osh va Kofe —
modifikator, Manti — stop-list, Sezar — tovuq 0,45 kg ≈ 3 porsiya: «Tugagan» sinovi), choy — retseptsiz xizmat, tayyor tovar:
Non va mineral suv (stansiyasiz), Coca-Cola (Bar, 3 dona — `outOfStock` sinovi). Taomlar `menuAdmin.saveMenuDish` orqali
yoziladi; xizmat haqi 10%, qadoq 3 000.
`NODE_ENV=production` yoki localhost bo'lmagan `MONGO_URI` da rad etadi. Xodimlar `staff: true` bilan, asosiy omborga.
**Tozalash:** `npm run seed:restaurant -- --reset-demo` — sinovdan qolgan holat (ochiq stol/pre-chek, smena, KDS, sotuvlar,
qo'shilgan xodimlar) bilan birga FAQAT `demo-restoran` do'konini o'chirib (`lib/orgDelete`), qayta yaratadi; oldin slug,
nom, telefon, admin login, biznes turi va baza nomi demo'ga mosligini tekshiradi (biri mos kelmasa — rad). Biznes mantiqi qayta yozilmagan:
`scripts/ts-hooks.mjs` orqali `lib/organizations.ts` (createOrganization), `lib/roles.ts`, `lib/restaurant/setup.ts`,
`lib/restaurant/menuAdmin.ts` chaqiriladi.
Kirish: `http://localhost:3000/t/demo-restoran/login`.

Sinalgan oqim (2026-11-18): sozlamalar (umumiy, zal/stol, zal tartibi, QR oynasi va chop etish, stansiya, menyu: modifikator,
stop-list, tugagan tovar) → ofitsant: stol ochish, modifikatorli taom, yuborish (`failed[]`: stop-list + ombor yetmasligi),
qisman bekor qilish → mijoz QR buyurtmasi va chaqiruv → ofitsant «Ko'rdim» va tasdiqlash → KDS: boshlash/tayyor, buyurtma izohi,
QR belgisi, bekor qilingan/kamaygan taom ogohlantirishi → yetkazildi → pre-chek (zal nomi, «fiskal chek emas») → kassir: taomlar
bo'yicha bo'lish + aralash (UzQR + naqd), teng bo'lish → chek («Orqaga» — buyurtmaga, stol raqami) → kassa smenasi (naqd/karta
alohida) → sotuvlar → saboy (qadoq, xizmat haqi 0) → hisobotlar; ruxsatlar (oshpaz → `/app/tables`, ofitsant → `/app/restaurant`
— `/app/locked`); mobil API (tables, menu, open, addItems, send, served, precheck, cancel, `Accept-Language: ru`).

Menyu va ombor (2026-11-18, `--reset-demo` dan keyin): `/app/menu` — kategoriyalar, porsiya, tannarx/foyda, filtrlar
(stop-list, retseptsiz, tugagan, menyudan olingan); «Taom qo'shish» — retsept g da kiritildi (120 g un → 0,12 kg; g ↔ kg
almashtirish sonni o'giradi), tannarx/foyda/porsiya jonli, «Yangi xom ashyo» (omborga), saqlash → `bundleItems` asosiy
birlikda, `purchasePrice` = tannarx; tahrirda retsept o'zgarishi → audit `product.recipe`; ombordagi tovarni menyudan olish
va qayta qo'shish (turkumi saqlanadi); Ombor — faqat xom ashyo va tovar, «Menyuda», «Ishlatiladi: N taomda» ro'yxati,
tugagan xom ashyo «Tugagan» bilan; mobil ofitsant: menyuda xom ashyo yo'q, Sezar ×3 yuborildi → tovuq 0,45 kg, salat 0,24 kg,
pomidor 0,15 kg chiqdi; 4-Sezar — `outOfStock`, menyuda `available: 0`; xom ashyo id bilan qo'shish — `productNotFound`;
Manti — `stopListed`; mijoz QR menyusi — 11 ta (stop-list va tugagan yashirin, xom ashyo yo'q); mobil `?stock=1` — 17 ta
(faqat tovar, «menyu» belgisi). Kun/Tun/Qora, 375px — gorizontal siljish yo'q.

