# Restoran moduli — backend API (UI agentlari uchun)

Sana: 2026-11-18 (yangilandi: E2E sinovdan keyin). Asos: `docs/business/TAKLIF_2026-11_SHABLONLAR.md` §1 (MVP + 2-faza).
Bu hujjat va `lib/restaurant/*` kodi — UI sahifalari (`/app/tables`, `/app/kitchen`, `/app/restaurant`,
mijoz QR sahifasi `/m/<slug>/<token>`, mobil ilova) uchun YAGONA manba. Sahifalar va mobil ekranlar yozilgan
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
| O'qish: stollar, buyurtmalar, KDS, menyu, sozlama, hisobot (server) | `lib/restaurant/queries.ts` |
| Mijoz QR (server) | `lib/restaurant/public.ts` |
| JSON ko'rinish (OrderView) | `lib/restaurant/view.ts` |
| Kontekst/natija turlari, sessiya → ctx | `lib/restaurant/context.ts`, `session.ts` |
| Kirish sxemalari (zod) | `lib/restaurant/inputs.ts` |
| Server action'lar (web yozish) | `app/actions/restaurant.ts` |
| Web JSON GET (polling) | `app/api/restaurant/*` |
| Mobil REST | `app/api/mobile/restaurant/*` |
| Ochiq QR API | `app/api/public/menu/[slug]/[token]/*` |
| Lug'at | `lib/i18n/dict/restaurant.ts` → `d.restaurant.*` |
| Testlar | `tests/restaurantLogic.test.ts`, `tests/restaurantFlow.test.ts` (MongoDB) |

**Modullar** (`lib/featureKeys.ts`, `lib/features.ts`): `tables` (zal, stollar, buyurtma, ofitsant, kassa «Stollar»),
`kitchen` (stansiyalar, oshxona ekrani KDS), `qrMenu` (mijoz QR-menyusi). Standart — hamma tarifda o'chiq;
`BUSINESS_FEATURE_PRESETS.restaurant` yoqadi: `tables`/`kitchen` — Starter, Pro, Business, Custom; `qrMenu` — Pro+.
Super Admin istalgan do'konda qo'lda yoqishi mumkin.

**Menyu bandlari** (`lib/navConfig.ts`): «Sotuvlar» guruhida `/app/tables` (Stollar; `tables` + `order.create`),
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
`{ branchId, name, kind: 'kitchen'|'bar', printerIp? (2-faza, faqat saqlanadi), sort, active }`

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
`stopListed?` (mahsulot filialga tegishli — stop-list ham filial bo'yicha), `systemKey?` (tizim mahsuloti).
Texkarta — mavjud `kind: 'bundle'` + `bundleItems` (yuborishda tarkib ombordan ayriladi).

### Sale (+ maydonlar)
`orderId?`, `tableNumber?` (indeks `{orderId}`).

### ShopSettings.restaurant
```
serviceChargePct 0–30 (standart 0), takeawayPackFee (so'm, 0), requireVoidReason (true),
kdsWarnMinutes (10), kdsAlertMinutes (20, > warn), brand { logoUrl?, color? (#RRGGBB), coverUrl? }
```
Logo/muqova — faqat shu do'konga yuklangan rasm (`/api/upload`, `isTenantUploadUrl`).

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
`product.menu|stopListOn|stopListOff`, `settings.restaurant`, `hall.*`, `table.*`, `station.*`.

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
| `updateMenuItemAction({ productId, stationId?, modifierGroups?, ikpu? })` | stationId null — olib tashlash; modifierGroups `[{ name, required, min?, max?, options: [{ name, price }] }]`; `/app/products/<id>` va `/app/restaurant/menu` revalidate | product.edit | `{ id }` |
| `setStopListAction({ productId, stopped })` | | menu.stopList | `{ id, name, stopListed }` |

Server komponentda o'qish: `const ctx = await restaurantCtxFromSession()` (`lib/restaurant/session.ts`), so'ng
`queries.tablesBoard(ctx)`, `queries.restaurantSetupView(ctx)` va h.k. — natija `OpResult`.

---

## 7. Web JSON API (sessiya cookie, faqat GET, `Cache-Control: no-store`)

Umumiy parametrlar: `branchId` (admin uchun; filial xodimida e'tiborsiz/tekshiriladi; berilmasa admin — zal ochilgan
birinchi filial, bo'lmasa asosiy ombor), `since` (ISO), `stationId`, `status`, `type`. 401 — sessiya yo'q.

| Yo'l | Huquq | Javob |
|---|---|---|
| `GET /api/restaurant/tables` | tables + (order.create\|order.viewAll) | `TablesBoard`: `{ serverTime, branchId, branches[], halls[{id,name,sort}], tables[{ id, hallId, number, seats, x, y, calls:{waiterAt,billAt}, order: OrderSummary\|null }], takeaway: OrderSummary[] }` |
| `GET /api/restaurant/orders?status=active\|closed\|all&type=&since=` | tables + (order.create\|order.viewAll) | `{ serverTime, next, orders: OrderSummary[] }` (`since` bo'lsa — holatidan qat'i nazar o'zgarganlar; `closed` — oxirgi 24 soat) |
| `GET /api/restaurant/orders/:id` | shu | `{ order: OrderView, serverTime }` |
| `GET /api/restaurant/kitchen?stationId=&since=` | kitchen + kitchen.view | `KitchenBoard`: `{ serverTime, next, branchId, branches, settings:{kdsWarnMinutes,kdsAlertMinutes}, stations[{id,name,kind}], orders: KdsOrder[] }`; `KdsOrder = { id, orderNo, type, status, source, tableNumber, waiterName, guests, note, updatedAt, items: KdsItem[], voided: [{ id, reason, voidedAt }] }`; `KdsItem = { id, name, displayName, qty, unit, modifiers[{group,name}], note, status, stationId, stationKind, fromQr, sentAt, cookStartedAt, readyAt, elapsedMs, level: 'ok'\|'warn'\|'alert' }`. `voided` — shu stansiyada oshxonaga yuborilgandan keyin bekor qilingan taomlar (since rejimida — `since` dan, to'liq rejimda — oxirgi 2 daqiqa; to'liq rejimda faqat yaqinda bekor qilingani bor buyurtma ham `items: []` bilan keladi) |
| `GET /api/restaurant/menu` | (tables\|kitchen) + (order.create\|order.viewAll\|menu.stopList\|kitchen.view) | `{ branchId, categories: string[], items: MenuItemView[] }`; `MenuItemView = { id, name, price, photoUrl, category, categoryId, kind, unit, stationId, stopListed, available (null — cheksiz), ikpu (MXIK yoki null), modifierGroups[{ id, name, required, min, max, options[{ id, name, price }] }] }`. Qoldig'i tugagan tovar (status `sold`) — menyu muharririda va xodim menyusida (`available: 0` → UI «Tugagan», o'chiq); mijoz QR-menyusida yo'q |
| `GET /api/restaurant/setup` | tables + tables.manage | `{ branchId, branches, settings, menuSlug, qrBaseUrl, halls[], tables[{…, qrToken, qrPath, qrUrl, busy}], stations[] }` |
| `GET /api/restaurant/waiters` | tables + order.transfer | `{ waiters: [{ id, username, name, role }] }` |
| `GET /api/restaurant/reports/timings?from=&to=` | tables + reports.view | `{ from, to, overall, byStation[], byWaiter[], byDish[], voids:{count,amount,lossCount,lossAmount} }` (stats: `{ prep, delivery, wait, total }` har biri `{ count, avgMs, medianMs, p90Ms, maxMs }`; davr ≤93 kun, standart 7 kun) |
| `GET /api/restaurant/reports/overview?p=today\|yesterday\|week\|month` yoki `?from=YYYY-MM-DD&to=YYYY-MM-DD` (≤93 kun), `&branchId=` | tables + reports.view | `RestaurantReport` (`lib/restaurant/reports.ts`): tushum, o'rtacha chek, oshxona vaqtlari (stansiya/taom), ofitsant KPI, bekor qilinganlar va yo'qotish, savdo — `/app/restaurant/reports` sahifasi bilan bir xil |
| `GET /api/restaurant/reports/export?section=kitchen\|staff\|voids\|sales` + overview filtrlari | tables + reports.view + export.data | CSV (UTF-8 BOM, `Content-Disposition: attachment`), ustun nomlari — joriy tilda |

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

---

## 10. Xato kodlari (`d.restaurant.errors.<code>`)

| Kod | HTTP | Ma'no |
|---|---|---|
| `moduleOff` | 403 | modul o'chiq |
| `noPermission` | 403 | huquq yo'q (`{label}` — huquq nomi) |
| `badInput`, `badBranch`, `badQty`, `badModifiers`, `badSettings`, `badColor`, `badUrl`, `badModifierGroups`, `voidReasonRequired`, `tooManyItems`, `discountTooBig`, `underpaid`, `overpaidCard`, `overpaid`, `nothingToSend`, `nothingToPay`, `emptyOrder` | 400 | kirish/biznes qoidasi |
| `orderNotFound`, `tableNotFound`, `hallNotFound`, `stationNotFound`, `productNotFound`, `itemNotFound`, `waiterNotFound`, `qrUnavailable` | 404 | topilmadi yoki ko'rish huquqi yo'q (ma'lumot sizmasin) |
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

## 13. Keyingi bosqich (backendda hali yo'q)

Fiskal chek (virtual kassa hamkor), stansiya printeri (TCP 9100 / Print Agent), SSE/Redis real vaqt, kurslar, bron,
choychaqa, agregatorlar, PIN-kirish (`User.pinHash` — planshet rejimi: qurilmani ishonchli qilish va bekor qilish
mexanizmi, sessiya almashish/avto-qulf kerak; hozircha qilinmadi), ofitsant KPI sahifasi, mobil oflayn navbat (`clientItemId` tayyor).

## 14. Demo restoran va uchdan-uchgacha sinov (faqat lokal dev)

`npm run seed:restaurant` (`scripts/seed-demo-restaurant.mjs`) — `demo-restoran` do'konini yaratadi yoki to'ldiradi
(idempotent): Pro tarif, `restaurant` turi (tables/kitchen/qrMenu), loginlar `dr_admin`, `dr_ofitsant`, `dr_oshpaz`,
`dr_kassir` (rol shablonlari; parol — skriptda yoki `SEED_RESTAURANT_PASSWORD`), «Asosiy zal» (1–4) va «Terrasa» (5–6),
stansiyalar «Issiq sex»/«Bar», 11 taom + xomashyo (Osh va Kofe — modifikator, Shashlik — texkarta, Manti — stop-list,
ichimliklar — Bar, non/suv — stansiyasiz, Coca-Cola — 3 dona qoldiq: `outOfStock` sinovi uchun), xizmat haqi 10%, qadoq 3 000.
`NODE_ENV=production` yoki localhost bo'lmagan `MONGO_URI` da rad etadi. Xodimlar `staff: true` bilan, asosiy omborga.
**Tozalash:** `npm run seed:restaurant -- --reset-demo` — sinovdan qolgan holat (ochiq stol/pre-chek, smena, KDS, sotuvlar,
qo'shilgan xodimlar) bilan birga FAQAT `demo-restoran` do'konini o'chirib (`lib/orgDelete`), qayta yaratadi; oldin slug,
nom, telefon, admin login, biznes turi va baza nomi demo'ga mosligini tekshiradi (biri mos kelmasa — rad). Biznes mantiqi qayta yozilmagan:
`scripts/ts-hooks.mjs` orqali `lib/organizations.ts` (createOrganization), `lib/roles.ts`, `lib/restaurant/setup.ts` chaqiriladi.
Kirish: `http://localhost:3000/t/demo-restoran/login`.

Sinalgan oqim (2026-11-18): sozlamalar (umumiy, zal/stol, zal tartibi, QR oynasi va chop etish, stansiya, menyu: modifikator,
stop-list, tugagan tovar) → ofitsant: stol ochish, modifikatorli taom, yuborish (`failed[]`: stop-list + ombor yetmasligi),
qisman bekor qilish → mijoz QR buyurtmasi va chaqiruv → ofitsant «Ko'rdim» va tasdiqlash → KDS: boshlash/tayyor, buyurtma izohi,
QR belgisi, bekor qilingan/kamaygan taom ogohlantirishi → yetkazildi → pre-chek (zal nomi, «fiskal chek emas») → kassir: taomlar
bo'yicha bo'lish + aralash (UzQR + naqd), teng bo'lish → chek («Orqaga» — buyurtmaga, stol raqami) → kassa smenasi (naqd/karta
alohida) → sotuvlar → saboy (qadoq, xizmat haqi 0) → hisobotlar; ruxsatlar (oshpaz → `/app/tables`, ofitsant → `/app/restaurant`
— `/app/locked`); mobil API (tables, menu, open, addItems, send, served, precheck, cancel, `Accept-Language: ru`).

