# Savora: yangi shablonlar, oflayn va narx bo'yicha taklif

Sana: 2026-11-18. Tayyorlandi: 6 ta tadqiqot agenti (restoran, ombor/sex, mobil oflayn, yo'nalishlar A va B, yillik narx) + kodni tekshirish.
Belgilar: **taxmin** — manbasiz baho; **tekshirish kerak** — manba noaniq yoki topilmadi. Murakkablik: S (kichik, 1–3 kun), M (o'rta, 1–2 hafta), L (katta, 2+ hafta) — taxmin.
Bu hujjat — taklif. Hech qanday kod o'zgartirilmagan.

---

## 0. Asosiy xulosalar

1. **Eng katta umumiy bo'shliq — soliq/fiskal.** Savora cheki ichki hujjat (yordam bo'limida shunday yozilgan). Mahsulotda MXIK (IKPU) maydoni yo'q, markirovka (DataMatrix) kodini o'qish yo'q. Restoranda onlayn-NKT'siz ishlatilgan R-Keeper uchun 600 mln so'm jarima holati bor; 2026-03-01 dan markirovkali tovar (maishiy texnika, dori, suv/ichimlik, pivo, tamaki, alkogol) kodi skanerlanmasa kassa chek chiqarmaydi. Uchta agent mustaqil ravishda shuni birinchi o'ringa qo'ydi → **«Soliq ko'prigi»** (§4.1).
2. **Restoran:** `restaurant` turi bor, lekin faqat nomi (Taom/Menyu). Sizning 11 talabingizning hammasi yopiladi (§1.3). Asos tayyor: `Product.kind='bundle'` sotuvda tarkibni ombordan avtomatik chiqaradi — bu texkarta uchun tayyor dvigatel.
3. **Sex/ombor:** bitta yangi tur `manufacturing` («Ishlab chiqarish sexi») + 5–6 kichik profil yetadi; alohida «sklad» turi shart emas, `wholesale` → «Optom savdo / distribyutor». Restoran texkartasi va sex BOM'i — **bitta `Recipe` dvigateli**, bir marta yoziladi.
4. **Mobil oflayn:** hozir faqat naqd sotuv oflayn. **Kodda xato topildi (tasdiqlandi):** onlayn sotuvda `clientSaleId` yuborilmaydi — server sotuvni yozib bo'lgach timeout tushsa, ilova sotuvni oflayn navbatga qo'yadi va sinxronda **ikkinchi sotuv** yoziladi, qoldiq ikki marta kamayadi (`mobile/app/sale-new.tsx:143-170`). Tuzatish S, OTA bilan chiqadi.
5. **Yillik narx:** kodda allaqachon −20% bor. Tavsiya: **«12 oy — 10 oy narxida» (2 oy bepul, −16,7%)** + **6 oylik −10%**; 20% ni 31.12.2026 gacha aksiya sifatida qoldirish.
6. **Xodim limiti to'siq bo'ladi:** Boshlang'ich tarifda `maxUsers=3` — restoran (ofitsantlar, oshpazlar) va tikuv sexi (ishchilar) uchun yetmaydi. Taklif: faqat mobil/PIN bilan kiradigan «ishchi o'rinlari» 10 tagacha limitga sanalmaydi.

### Umumiy ustuvorlik (tavsiya)

| # | Ish | Nima uchun hozir | Murakk. |
|---|---|---|---|
| 1 | Mobil dublikat sotuv xatosini tuzatish | Pul va qoldiq noto'g'ri bo'lyapti | S |
| 2 | MXIK maydoni + tasnif.soliq.uz katalogidan import | Hamma yo'nalishga kerak, arzon | S |
| 3 | Ro'yxatdan o'tish presetlarini yangilash + arzon yangi yo'nalishlar | Tez natija, kod deyarli tayyor | S |
| 4 | Yillik / 6 oylik narx | Pul oqimi, qo'lda uzaytirish yuki kamayadi | S |
| 5 | Oflayn 1–2 bosqich (sekin internet detektori, o'qish keshi) | OTA bilan chiqadi | S/M |
| 6 | `Recipe` dvigateli → Restoran MVP yoki Sex MVP (qaysi biri birinchi — sizning qaroringiz) | Yangi segment | L |
| 7 | Oflayn 3–5 bosqich (umumiy outbox, SQLite, 1.6.0 build) | Native build kerak | L |
| 8 | Soliq ko'prigi 2–3 (DataMatrix, virtual kassa hamkor, ESF) | Hamkor tanlash kerak | M/L |

---

## 1. Restoran / kafe shabloni

### 1.1 Bozor (O'zbekiston)

| Tizim | Narx | Kuchli | Zaif |
|---|---|---|---|
| iiko (Kafesoft) | 500 000 / 1 012 500 / 1 350 000 so'm/oy, har kassa | ~1000 restoran (2023), Uzum Tezkor integratsiyasi | Qimmat, integrator kerak |
| Poster | $26 / $44 / $62 oy; +kassa $19, 3 ofitsant $27, QR $7 | Bulutli, QR-menyu, texkarta | KDS, ofitsant ilovasi, modifikator faqat $44 dan; bron $62 da |
| Jowi | Asosiy qismi 0 so'm; AI — tushumning 0,2%, yangi mijoz — chekning 5% | Kassa, ombor, oshxona ekrani bepul | Daromad tushumdan foizga bog'langan |
| Paloma365 | 134 700 so'm/oy dan | Zal xaritasi, oflayn, onlayn-NKT/OFD, agregator | QR-menyu hamkor orqali |
| AliPos, Delever | topilmadi | 1 290+ va 1 400+ mijoz | — |
| R-Keeper | topilmadi | Kuchli front | NKT bilan bog'lanmagani uchun 600 mln jarima holati |

Xulosa: QR-menyu, KDS va ofitsant ilovasi raqobatchilarda o'rta tarif funksiyasi. Savora ustunligi — ombor, moliya, kassa smenasi, Telegram va mobil ilova bitta tizimda, o'zbek tilida, joriy etuvchisiz.

### 1.2 O'zbekiston talablari

- **Fiskal chek majburiy.** Chekda MXIK, QQS, to'lov turi bo'lishi shart. Jarima — oxirgi chorak sof tushumi miqdorida. → `Product.ikpu`; pre-chek aniq «fiskal chek emas» deb belgilanadi; yakuniy chek — fiskal modul/virtual kassa orqali (2-faza, hamkor bilan).
- **Xizmat haqi (10–15%)** taqiqlanmagan, lekin oldindan e'lon qilinishi va mijozga muqobil (o'zi xizmat) berilishi shart (Raqobat qo'mitasi, 21.11.2025). → foiz sozlamasi; saboy va QR orqali o'zi buyurtmada avtomatik 0%; menyuda va chekda alohida qator.
- **UzQR** 2026-07-01 dan yuridik shaxslar uchun majburiy, sotuvchi uchun 0,65%. → to'lov usullariga `uzqr`.
- **Agregatorlar:** Yandex Eats (+Express24) va Uzum Tezkor dominant; Wolt 2026-03-05 da chiqib ketdi. → integratsiya faqat 3-fazada.
- **Saboy qadoq haqi:** me'yoriy hujjat topilmadi (tekshirish kerak). Qadoq chekka xizmat qatori bo'lib qo'shiladi.

### 1.3 Sizning 11 talabingiz → yechim

| # | Talab | Qanday ishlaydi | Faza |
|---|---|---|---|
| 1 | Mijozlar uchun menyu | Menyu = mavjud mahsulotlar (Taom) + kategoriya + rasm. Mijozga ochiq **QR-menyu** sahifasi: rasm, narx, uz/ru, tugagan taom (stop-list) yashirin | MVP: ichki menyu; 2: QR-menyu |
| 2 | Bar | Alohida **stansiya** `kind: bar` — ichimliklar bar ekraniga/printeriga yo'naladi. «Barmen» roli. Shisha → ml sarfi texkarta orqali ombordan chiqadi | MVP |
| 3 | Mijoz o'zi buyurtma beradi | Stoldagi QR → savatcha → buyurtma. Soxta buyurtmaga qarshi **ofitsant tasdiqlaydi**. «Ofitsantni chaqirish», «Hisob so'rash» tugmalari | 2 |
| 4 | Oshxonaga zakaz keladi | **Oshxona ekrani (KDS)** — planshet yoki TV: kartochkalar, taymer, «Boshlandi / Tayyor». Ixtiyoriy: stansiya printeri | MVP: ekran; 2: printer |
| 5 | Ofitsant zakaz oladi | Mobil ilova/planshetda: stollar → menyu → modifikator («achchiq», 0,5 porsiya) → «Oshxonaga yuborish» | MVP |
| 6 | Taom necha daqiqada stolga keldi | Har taomda vaqt belgilari: yuborildi → boshlandi → tayyor → yetkazildi. **Tayyorlanish** = tayyor − yuborildi; **yetkazish** = yetkazildi − tayyor. KDS'da sariq/qizil ogohlantirish | MVP: belgilar; 2: hisobot va ofitsant KPI |
| 7 | Rollar, stol raqami, qaysi ofitsant qaysi stol | Zal va stollar (raqam, o'rindiq), buyurtmada ofitsant, stolni boshqa ofitsantga o'tkazish. Rol shablonlari §1.6 | MVP |
| 8 | Kassa ko'rinishi | Kassada yangi «Stollar» bo'limi: ochiq hisoblar, to'lov, xizmat haqi, hisobni bo'lish | MVP; bo'lish — 2 |
| 9 | Chek chop etish | Pre-chek («Hisob») + yakuniy chek — mavjud 80 mm chek; chekda stol, ofitsant, xizmat haqi. Fiskal chek — hamkor orqali | MVP; fiskal — 2 |
| 10 | Saboy (olib ketish) | Buyurtma turi «Saboy»: stolsiz, qadoq haqi, xizmat haqi 0%, to'lov oldindan | MVP |
| 11 | Mijoz sahifasida brend nomi va logo | Sozlamada: logo, rang, muqova rasmi, menyu manzili. QR-menyuda va chekda chiqadi | MVP: chekda logo; 2: QR-menyu |

### 1.4 Ro'yxatingizdan tashqari, bozor ko'rsatgan kerakli narsalar

| Nima | Nega | Faza |
|---|---|---|
| Stop-list | Tugagan taom ofitsantga ham, QR-menyuda ham ko'rinmaydi | MVP |
| Modifikatorlar | Porsiya, qo'shimcha, «achchiq» — narx bilan | MVP |
| Texkarta → ombordan avtomatik chiqarish | Oziq-ovqat sarfi va o'g'irlik nazorati | MVP |
| **Bekor qilish nazorati** | Oshxonaga yuborilgan taomni bekor qilish — sabab + administrator ruxsati. Restoranda klassik o'g'irlik usuli | MVP |
| Hisobni bo'lish | Guruh mehmonlar | 2 |
| Kurslar (avval salat, keyin issiq), choychaqa, bron | Premium funksiyalar | 3 |
| Kerak emas (hozircha) | Kiosk, sodiqlik dasturi, franshiza | — |

### 1.5 Fazalar

- **MVP:** zal/stollar (oddiy grid), buyurtma (stol / saboy), ofitsant ekrani (mobil + veb), oshxona va bar ekrani, modifikator, stop-list, texkarta, kassa «Stollar» (xizmat haqi, chek), bekor qilish nazorati, vaqt belgilari, pre-chek. Real vaqt: 3–5 soniyalik so'rov (polling) yetadi.
- **2-faza:** QR-menyu va o'zi buyurtma (brend/logo), ofitsant chaqirish, hisobni bo'lish, tarmoq printerlari, fiskal integratsiya, KPI va tayyorlanish vaqti hisobotlari, UzQR.
- **3-faza:** Yandex/Uzum agregatorlari, kurslar, bron, choychaqa, Telegram Mini App menyusi.

### 1.6 Rol shablonlari (restoran turi tanlanganda yaratiladi)

| Rol | Nima qila oladi |
|---|---|
| Ofitsant | Buyurtma ochish/qo'shish (faqat o'z stollari), stop-listni ko'rish, pre-chek |
| Oshpaz | Oshxona ekrani, «Boshlandi/Tayyor», stop-list |
| Barmen | Oshpaz ruxsatlari bar stansiyasi uchun + peshtaxtada buyurtma |
| Kassir | Mavjud Kassir + barcha buyurtmalar, to'lov, hisobni bo'lish |
| Administrator | Stol o'tkazish, taomni bekor qilish, buyurtmani qayta ochish, chegirma, stollar sozlamasi, hisobotlar, hisobdan chiqarish |

Yangi ruxsatlar: `order.create`, `order.viewAll`, `order.transfer`, `order.voidItem`, `order.split`, `order.reopen`, `kitchen.view`, `kitchen.bump`, `tables.manage`, `menu.stopList` (`PERMISSIONS_VERSION` oshiriladi).

### 1.7 Ma'lumot modeli (eskiz, tenant baza)

```
Hall           { name, branchId, sort }
Table          { hallId, branchId, number, seats, x?, y?, qrToken (noyob), active }
KitchenStation { branchId, name ("Issiq sex", "Bar"), kind: kitchen|bar, printerIp?, active }
Product +=     { ikpu?, stationId?, modifierGroups?[{ name, required, min, max, options[{ name, price }] }], stopListed? }
               // texkarta = mavjud kind:'bundle' + bundleItems (keyin umumiy Recipe dvigateliga, §2.6)
Order          { orderNo, branchId, type: dine_in|takeaway|qr_self, tableId?, guests?, waiterId?,
                 status: open|precheck|paid|cancelled, source: waiter|qr|cashier,
                 serviceChargePct, packFee?, items[OrderItem], openedAt, precheckAt?, paidAt? }
OrderItem      { productId, name, qty, price, modifiers[], stationId, note?,
                 status: new|sent|cooking|ready|served|voided,
                 sentAt?, cookStartedAt?, readyAt?, servedAt?, voidedBy?, voidReason? }
ShopSettings += restaurant { serviceChargePct, takeawayPackFee, requireVoidReason,
                 brand { logoUrl, color, coverUrl, menuSlug } }
User +=        { pinHash? }   // planshetda tez PIN-kirish
```

**Mavjud tizim bilan bog'lanish:** to'lovda har bir taom mavjud `Sale` qatoriga aylanadi (`checkoutId = orderNo`, sotuvchi = ofitsant, yangi ixtiyoriy `orderId`, `tableNumber`); xizmat haqi va qadoq — `service` turidagi qator. Natijada hisobotlar, kassa smenasi, moliya va chek **o'zgarmasdan** ishlaydi.

### 1.8 Uskunalar

- Ofitsantga — Android telefon/planshet; oshxona/barga — planshet yoki TV (PWA).
- Stansiya printeri — 80 mm termal ESC/POS tarmoq printeri. **Brauzer printerga to'g'ridan-to'g'ri yubora olmaydi** → MVP'da printer o'rniga oshxona ekrani; 2-fazada mobil ilova orqali (TCP 9100) yoki kassa kompyuteridagi kichik «Print Agent».
- Mo'ljal narxlar (Kafesoft): monoblok 4 250 000, chek printeri 812 500 so'm.

### 1.9 Savora'ga sig'ishi

- Yangi modul kalitlari: `tables`, `kitchen`, `qrMenu` (3-fazada `delivery`).
- `BUSINESS_FEATURE_PRESETS.restaurant` += `tables`, `kitchen`, `qrMenu`.
- Prod'da 2 ta pm2 instansiya bor → keyinchalik real vaqt (SSE) uchun Redis pub/sub yoki Mongo change streams.
- Yangi UI matnlari faqat lug'at orqali (uz/ru).

### 1.10 Narx (restoran)

Ikki agent ikki xil taklif berdi:
- **A variant (tavsiya):** alohida add-on emas, tarif ichida **vertikal paket**. Boshlang'ich (249k) — MVP (stollar, ofitsant, 1 stansiya, chek, saboy); Pro (649k) — QR-menyu, brend, ko'p stansiya, hisobni bo'lish, KPI. Pro Poster Business + ofitsantlar (≈852k, taxmin) va iiko Pro'dan (1 012 500) arzon. Pastda Jowi (0) va Paloma365 (134,7k) bilan narxda emas, «hammasi bitta tizimda» bilan raqobat.
- **B variant:** «Restoran» add-on — 149 000/oy har filial (yillik 1 490 000).

Ikkalasida ham: fiskal integratsiya va agregatorlar — qo'shimcha to'lov (+100–150k, taxmin); ofitsant/oshpaz PIN o'rinlari 10 tagacha bepul.

**Manbalar (§1):** kafesoft.uz · joinposter.com/en/pricing · jowi.app · paloma365.com/en/uzbekistan · spot.uz/ru/2026/04/02/lacafe-alipos · spot.uz/en/2026/10/31/delever · spot.uz/ru/2023/08/07/uzum · the-tech.kz (iiko + Uzum Tezkor) · buxgalter.uz text194349 (600 mln jarima) · buxgalter.uz text195437 (jarima miqdori) · buxgalter.uz text189002, text197281 (chek rekvizitlari) · kun.uz/en/news/2025/11/21/competition-committee-deems-mandatory-15-20-percent-service-fees… · spot.uz/ru/2025/11/21/tips-catering · kun.uz/ru/news/2026/07/03 (UzQR) · spot.uz/ru/2026/07/03/mandatory-single-qr · kun.uz/en/news/2025/04/02 (Uzum Tezkor) · kun.uz/en/news/2026/02/25/wolt-announces-exit-from-uzbekistan-market · squareup.com/us/en/point-of-sale/restaurants/pricing

---

## 2. Ombor va ishlab chiqarish sexlari

### 2.1 Bozor

| Tizim | Ishlab chiqarish | Narx | Zaif tomoni |
|---|---|---|---|
| MoySklad | Texkarta, bosqich, normo-soat, ishchi ilovasi | Baza 1 120–9 800 ₽/oy + «Производство» 1 400 ₽/oy | Buyurtma bo'yicha ishlab chiqarishga shikoyat; UZ'da Didox/Asl belgisi integratsiyasi yo'q |
| BILLZ | Yo'q | 299k / 499k / 999k, +179k har nuqta | Texkarta yo'q |
| 1C bulutli (clobus.uz) | Oddiy ishlab chiqarish | 220k / 396k / 473k | Joriy etuvchi va dasturchi kerak |
| Smartup | Bor | So'rov bo'yicha | Kichik sexga og'ir |
| Odoo | To'liq MRP | $8,95–11,20/foydalanuvchi | Joriy etish alohida |

Bo'sh joy: **arzon, sodda, o'zbekcha, mobil, joriy etuvchisiz va ishlab chiqarishni ham qamraydigan** tizim yo'q. Smartup darajasidagi agent/GPS marshrutlar bilan raqobat qilish shart emas.

### 2.2 Egalarning muammolari

- **Sex:** sarf normasi bilan haqiqiy sarf solishtirilmaydi (isrof, o'g'irlik ko'rinmaydi); tannarx «ko'z bilan»; ishbay haq daftar/Excel'da → nizo (taxmin); mebelda buyurtma bo'yicha ishlab chiqarish (avans, bichish → kromka → yig'ish → o'rnatish); non/go'shtda partiya va muddat.
- **Ombor/distribyutor:** diler qarzi va kredit limiti; e-faktura (Didox 10 ta/oy bepul, keyin 350–800 so'm; Faktura.uz ≥50k/oy); elektron yuk xati (ETTN) daromadi 100 mln+ korxonaga majburiy; markirovka (suv, ichimlik, texnika, dori; akkumulyator 2026-01-01; mebel/tikuv/non/kolbasa ro'yxatda topilmadi — tekshirish kerak).

### 2.3 Ro'yxatdan o'tish

- **Yangi tur:** `manufacturing` — «Ishlab chiqarish sexi». Kichik profil alohida maydonda (`industryProfile`), 19 ta tur bilan ro'yxatni og'irlashtirmaslik uchun.
- **`wholesale`** yorlig'i → «Optom savdo / distribyutor» (id o'zgarmaydi).
- **Alohida «sklad» turi kerak emas** — ombor funksiyalari hamma turda bor.

**Sex uchun 5 ta savol (har biri sozlamaga bog'langan):**
1. Nima ishlab chiqarasiz? → profil (birliklar, atamalar, namunaviy texkarta).
2. Buyurtma bo'yichami, omborgami, ikkalasimi? → mijoz buyurtmasi → ishlab chiqarish / kunlik reja.
3. Ishchilarga haq: oylik, ishbay, aralash? → ishbay moduli va «Usta» roli.
4. Qayerga sotasiz: o'z do'kon, diler, buyurtmachi? → kassa, nasiya, diler qarzi.
5. Xom ashyo va tayyor mahsulot alohida saqlanadimi? → 2 ta ombor: «Xom ashyo», «Tayyor mahsulot».

| Profil | Birliklar | Avtomatik yoqiladi |
|---|---|---|
| Mebel sexi | list, m², m (kromka), dona | Buyurtma bo'yicha, nasiya, bosqichlar |
| Tikuv | m, rulon, dona, kg | Ishbay (operatsiya bo'yicha), o'lcham/rang |
| Non / qandolat | kg, l, dona | Partiya, muddat, kunlik reja |
| Go'sht / kolbasa | kg | Partiya, muddat, chiqindi % |
| Plastik / qurilish | kg, t, m³, dona | Partiya, dilerga jo'natish |

### 2.4 Rol shablonlari

Omborchi (kirim, transfer, inventarizatsiya; narxni ko'rmaydi) · Sex boshlig'i (ishlab chiqarish, texkarta, ishbayni tasdiqlash) · Usta/ishchi (faqat mobil, o'z ishi va topgani) · Ekspeditor (mobil: jo'natma, yetkazildi, to'lov) · Hisobchi (tannarx, yetkazib beruvchi qarzi; sotuv yo'q) · Agent (diler nomidan buyurtma).

### 2.5 Fazalar

| Faza | Modul | Muammo | Murakk. |
|---|---|---|---|
| MVP | Birlik konvertatsiyasi (qop → kg) va yangi birliklar (list, rulon, m³, t, juft) | Bir birlikda olinadi, boshqasida sarflanadi | S/M |
| MVP | Texkarta (1 daraja, chiqish, yo'qotish %, versiya) | Sarf normasi | M |
| MVP | Ishlab chiqarish akti: xom ashyo avtomatik chiqadi, tayyor mahsulot kirim bo'ladi, haqiqiy sarf tuzatiladi | Reja/fakt, isrof | M |
| MVP | Tannarx (material o'rtacha narxi + ish haqi + ustama) | Narx belgilash | M |
| MVP | Kirim akti (qatorli, yetkazib beruvchi qarziga yoziladi, nakladnoy) | Qog'oz nakladnoy | M |
| MVP | Minimal qoldiq ogohlantirishi (push/Telegram), brak/chiqindi sabablari | Xom ashyo tugashi, yo'qotish | S |
| 2 | Ishbay haq (ishchi mobilda belgilaydi, boshliq tasdiqlaydi, kassa chiqimiga tushadi) | Excel va nizo | M/L |
| 2 | Partiya va muddat (`StockLot`, FEFO) | Muddat va markirovka bloki | L |
| 2 | Yetkazib beruvchiga buyurtma + xom ashyo ehtiyoji hisobi | Xaridni rejalash | M |
| 2 | Mijoz buyurtmasi → ishlab chiqarish (avans, bosqichlar) | Mebel buyurtmasi | M/L |
| 2 | Dilerga jo'natish + kredit limiti + ekspeditor mobil | Diler qarzi | M |
| 2 | Mobil ombor (skaner bilan qabul/inventarizatsiya), etiketka | Tezlik, xato | M |
| 3 | Ko'p bosqichli BOM, mebel bichimi; e-faktura/ETTN (Didox); Asl belgisi; yacheykalar | Murakkab mahsulot, soliq | L |

### 2.6 Ma'lumot modeli va umumiy `Recipe` dvigateli

```
Recipe          { name, mode: production|onSale, outputCode (Product.productId), outputQty, unit, version,
                  items[{ code, qty, unit, lossPct }], operations[{ name, rate, normMin? }], overheadPerUnit }
ProductionOrder { docNo 'P…', recipeSnapshot, plannedQty, producedQty, scrapQty,
                  status: draft|in_progress|done|cancelled, fromBranchId, toBranchId, customerOrderId?,
                  materials[{ productId, plannedQty, actualQty, unitCost, lotId? }],
                  labor[{ operation, workerId, qty, rate, amount }], costTotal, unitCost }
StockLot        { productId, branchId, lotNo, qtyIn, remaining, unitCost, expiryDate?, source }
GoodsReceipt    { docNo 'K…', supplierId, branchId, lines[{ productId, qty, price, lotNo?, expiryDate? }], paidNow, status }
PurchaseOrder   { docNo 'Z…', supplierId, lines[{ productId, qty, price, receivedQty }], status }
PieceworkEntry  { workerId, productionOrderId, operation, qty, rate, amount, approvedBy?, cashFlowId? }
```

- Yangi modul kalitlari: `production`, `purchasing`, `lots`, `piecework`, `shipments`.
- **Restoran texkartasi = `Recipe(onSale)`**, sex BOM'i = `Recipe(production)`, restoran zagotovkasi ham `production`. Bir marta yoziladi, ikkala vertikal ishlatadi.
- Mavjud `bundle`'ni darhol ko'chirmaslik: avval `Recipe` yonma-yon ishlaydi, keyin migratsiya.

### 2.7 Kodda topilgan cheklovlar (MVP'dan oldin hal qilinadi)

- `bundleItems` filialdagi mahsulot `_id`'siga bog'langan → `Recipe` filialdan mustaqil kodga (`productId`) bog'lanishi kerak, aks holda transferdan keyin uziladi.
- O'rtacha tortilgan tannarx yo'q (Excel import narxni ustidan yozadi) → kirim aktida o'rtacha tannarx hisoblanishi shart.
- `batchNumber`/`expiryDate` mahsulotda bittadan → bir nechta partiya uchun `StockLot`.
- Hisobdan chiqarish sabablariga `production_scrap`, `offcut` qo'shiladi.

### 2.8 Narx (sex)

- Alohida tarif emas. Taklif: «Sex» add-on +149–199k/oy (Biznes tarifida ichida) — MoySklad ham ishlab chiqarishni alohida sotadi (taxmin). Yoki restoran kabi vertikal paket (§1.10 A variant) — **bir xil yondashuvni tanlash tavsiya qilinadi**.
- «Ishchi» o'rni (faqat mobil, o'z ishi): 10 tagacha bepul, keyin 10–15k/oy (taxmin; Odoo Light User $2,90).
- Agent/ekspeditor o'rni +49k/oy (2-fazadan keyin, taxmin). E-faktura operator to'lovini mijoz o'zi to'laydi.
- 5–10 ta sexda pilot bilan tekshirish kerak.

**Manbalar (§2):** moysklad.ru/subscription · moysklad.ru/integratsii/dlya-uzbekistana · moysklad.ru/programmy-dlja-biznesa/programma-dlya-proizvodstva-mebeli · startpack.ru/application/my-sklad/reviews · billz.io/prices · clobus.uz · infostart.ru/public/2379476 · smartup24.com · odoo.com/pricing · buxgalter.uz text171852 (EHF operatorlari) · buxgalter.uz text211974 (ETTN) · gov.uz/ru/soliq/news/view/93824 (muddati o'tgan blok) · gov.uz/oz/soliq/news/view/115914 (akkumulyator)

---

## 3. Mobil oflayn rejim

### 3.1 Hozirgi holat

- **Oflaynda ishlaydi:** ilovaga kirish (kesh), **faqat naqd** sotuv (katalog telefonda, navbat, idempotent sinxron), skaner (tanlash rejimi), oflayn sotuvlar ro'yxati.
- **Ishlamaydi:** deyarli barcha o'qish ekranlari (bosh sahifa, sotuvlar, nasiya, mahsulotlar, daftar, kirim-chiqim, smena, topshiriq, filial) va yozish amallari (qarz/nasiya sotuv, to'lov qabul qilish, daftar, kirim-chiqim, mahsulot qo'shish, transfer, smena).
- **Topilgan xavflar:**
  1. **Dublikat sotuv (tasdiqlandi)** — §0 4-band.
  2. Timeout va «internet yo'q» bir xil xato (`status 0`) — POST'da timeout «yuborilmadi» emas, «natija noma'lum» degani.
  3. Tarmoq xatosi tarjima qilingan matn bilan solishtiriladi (`list.error === d.api.offline`) — til almashsa buziladi.
  4. Sekin internetda oflaynga o'tishdan oldin 15–30 s kutish.
  5. Daftar, kirim-chiqim, to'lov POST'lari idempotent emas — qayta bosilsa takror yoziladi.
  6. Katalog va navbat shifrsiz, logout'da o'chmaydi.

### 3.2 «Sekin internet»ni aniqlash

Uch holat: **onlayn · sekin · oflayn**. Signallar: har so'rov davomiyligi (o'rtacha kechikish), engil ping `/api/health?live=1` (4 s), NetInfo (tarmoq uzildi xabari).

| O'tish | Shart (boshlang'ich qiymatlar, real foydalanishda sozlanadi) |
|---|---|
| onlayn → sekin | o'rtacha kechikish > 2,5 s (kamida 3 so'rov) yoki qisqa so'rov timeout |
| sekin → onlayn | ketma-ket 3 so'rovda < 1,2 s |
| → oflayn | NetInfo uzildi deydi yoki 2 ketma-ket xato |
| oflayn → onlayn | 2 ta muvaffaqiyatli ping (orasi ≥5 s) va kamida 15 s oflaynda turgan |

Chayqalmaslik uchun kirish va chiqish chegaralari har xil. **Xulq:** oflaynda ma'lumot keshdan, amal telefonga yoziladi; sekinda avval kesh ko'rsatiladi, fonda yangilanadi, amal navbatga tushadi — foydalanuvchi kutib qolmaydi. Ekran tepasida ingichka chiziq: kulrang «Oflayn — amallar telefonda saqlanadi», sariq «Internet sekin», ko'k «Yuborilmoqda: N», qizil «N ta muammo». Har ro'yxatda «Yangilangan: 14:32».

### 3.3 Oflaynda nima mumkin

| Amal | Oflayn | Ziddiyat qanday hal bo'ladi |
|---|---|---|
| Naqd sotuv | Ha | Qoldiq yetmasa — ziddiyat oynasi; egasi oflayn sotuv yoshi/summasiga chegara qo'yadi |
| Karta/Click/Payme sotuv | Ixtiyoriy | «Tekshirish kerak» belgisi, admin tasdiqlaydi |
| Qarz/nasiya sotuv | Yo'q (faqat qoralama) | Shartnoma, jadval — server ishi |
| Qarz/nasiyaga to'lov qabul | Ha | To'lovlar qo'shiladi; ortiqcha bo'lsa ziddiyat |
| Daftarga yozuv / qaytarish | Ha | Yangi hujjat, ziddiyat bo'lmaydi |
| Kirim-chiqim | Ha | Faqat qo'shiladi |
| Mahsulot qo'shish | Ha (rasm keyin) | IMEI band bo'lsa — tahrirlab qayta yuborish |
| Narx tahriri | Ha, huquq bo'lsa | Serverda o'zgargan bo'lsa ziddiyat |
| Topshiriq holati | Ha | Oxirgi o'zgarish yutadi |
| Transfer, smena yopish, filial, rol | Yo'q | Faqat server |

### 3.4 Qurilmadagi ma'lumot va xavfsizlik

- **Yuklanadi:** huquqlar, o'z filiali katalogi (kelish narxisiz), qarzdorlar va qoldig'i, daftar (ochiqlari + 90 kun), kirim-chiqim (30 kun). **Yuklanmaydi:** kelish narxi, boshqa filiallar, audit.
- Hajm: 5000 mahsulot ≈ 1–1,5 MB; SQLite bilan 50 000 gacha (≈10 MB) — taxmin.
- Lokal baza shifrlanadi (SQLCipher, kalit SecureStore'da). Logout'da «N ta yuborilmagan amal bor» ogohlantirishi, keyin baza o'chadi.
- 72 soat sinxronsiz o'tsa — yangi oflayn sotuv bloklanadi; katalog 24 soatdan eski bo'lsa — ogohlantirish.

### 3.5 Bosqichli reja

**OTA haqida:** OTA — ilovani do'kondan qayta yuklamasdan JS kodni yangilash. Native paket (NetInfo, SQLite, crypto) qo'shish esa yangi versiya (1.6.0), yangi EAS build va do'konga chiqarishni talab qiladi. Taklif: uchala native paket **bitta 1.6.0 build'da**, qolgani OTA bilan.
**Sizning qadamingiz:** 1.6.0 build/submit (Apple/Google). **Mening qadamim:** kod, server, testlar.

| Bosqich | Mazmun | Chiqish usuli | Murakk. |
|---|---|---|---|
| 0 | Dublikat sotuvni tuzatish: `clientSaleId` onlayn POST bilan ham yuboriladi, server takrorni qaytaradi; xato turi (tarmoq/timeout/http) aniq | Server + OTA | S |
| 1 | Sekin internet detektori + global indikator, internet qaytishi bilan darhol sinxron | OTA (NetInfo 1.6.0 da) | S/M |
| 2 | Barcha o'qish ekranlari uchun kesh (TanStack Query + saqlash) | OTA | M |
| — | **1.6.0 native build** (NetInfo, expo-sqlite, expo-crypto) | Do'kon | sizdan |
| 3 | Umumiy navbat (outbox) — daftar, to'lov, kirim-chiqim, mahsulot, topshiriq; server `sync/push` + idempotentlik kaliti | Server + OTA | L |
| 4 | SQLite + shifrlash + delta sinxron (`sync/pull?since=`) | 1.6.0 | L |
| 5 | «Sinxron markazi» — ziddiyatlarni tahrirlash/bekor qilish, auditda `offline: true` | OTA | M |

Raqobatchilar ham shu naqshda ishlaydi: Square — saqlab keyin yuborish, 24/72 soat chegara; Poster — rangli indikator, smenani oflaynda yopish.

**Manbalar (§3):** docs.expo.dev/versions/v54.0.0/sdk/netinfo · github.com/react-native-netinfo/react-native-netinfo · docs.expo.dev/versions/v54.0.0/sdk/sqlite · tanstack.com/query/latest/docs/framework/react/guides/network-mode · react-native-async-storage.github.io/2.0/advanced/Limits · docs.expo.dev/eas-update/runtime-versions · datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header · squareup.com/help/gb/en/article/8106-offline-payments-time-limits · knowledge-base.joinposter.com/en/does-poster-work-offline

---

## 4. Biznes yo'nalishlari: muammolar va yechimlar

### 4.1 «Soliq ko'prigi» — hamma yo'nalish uchun eng muhim

**Holat (09.11.2026, Soliq qo'mitasi):**
- Majburiy markirovka: alkogol, pivo, tamaki, **maishiy texnika**, dori, suv va ichimliklar. Agrokimyo — 2026-05-01 dan. Poyabzal, kiyim, parfyumeriya ro'yxatda **yo'q** (tekshirish kerak).
- 2026-03-01 dan «ruxsat beruvchi rejim»: kod skanerlanmasa, takror yoki muddati o'tgan bo'lsa — kassa chek chiqarmaydi; kirimi qayd etilmagan markirovkali tovar sotilsa — ogohlantirish. Jarima chorak aylanmasining 2%, takrorda 20%.
- Naqd tushumi bor har bir tadbirkor onlayn-NKM yoki virtual kassa ishlatishi shart; ichki dastur cheki fiskal chek o'rnini bosmaydi. MXIK'siz chek 2022-01-01 dan taqiqlangan.
- Natija: oziq-ovqat do'koni, dorixona, texnika do'koni har sotuvni **ikki marta** kiritadi — Savora'ga va onlayn-kassaga.

**Yechim (3 qadam):**
1. **S** — mahsulotda MXIK maydoni + tasnif.soliq.uz katalogidan import/qidiruv.
2. **M** — GS1 DataMatrix kodini o'qish (GTIN, seriya, muddat); kirimda qabul qilish, sotuvda chiqarish; muddati o'tgan tovarni kassada bloklash.
3. **L** — ro'yxatdagi virtual kassa bilan integratsiya (hamkor: masalan Multikassa — Poster shunday qilgan) va ESF importi (Didox / Faktura.uz).

### 4.2 Yo'nalishlararo umumiy yechimlar

| Yechim | Nima | Holat | Murakk. |
|---|---|---|---|
| **Nazorat xulosasi** | Har kassir bo'yicha bekor qilish, chegirma, qaytarish, narx o'zgartirish — kuniga bir marta Telegram'ga. Audit, ruxsatlar va bildirishnoma tayyor | YANGI | S |
| **Qarzdorlar markazi** | Nasiya, daftar va sotuvdagi qarz bitta ro'yxatda, kechikish bo'yicha saralangan, Telegram eslatma (SMS to'xtatilgan) va PQ-294 ogohlantirishlari | YANGI | M |
| **Qoldiq nazorati** | Minimal qoldiq + Telegram, «N kun sotilmagan» hisoboti, manfiy qoldiqni taqiqlash, rejali inventarizatsiya topshirig'i | SOZLASH | S |
| **Qaytarish va kafolat** | Toifa bo'yicha qoida (10 kun / qaytarilmaydi), kafolat arizasi (qabul → servis → qaytdi), chekda shartlar | YANGI | M |
| **Muddat ogohlantirishi** | «N kunda muddati tugaydi» (oziq-ovqat 7, kosmetika 30, dori 90 kun), muddati o'tganini sotuvda bloklash | SOZLASH | S |

### 4.3 Yo'nalishlar bo'yicha (eng muhim muammolar)

Holat: **BOR** — Savora'da allaqachon bor; **SOZLASH** — kichik o'zgarish; **YANGI** — yangi funksiya.

| Yo'nalish | Asosiy muammolar → yechim | Ro'yxatdan o'tishda qo'shimcha |
|---|---|---|
| Umumiy savdo | Mahalla nasiyasi → daftar (BOR); kassir o'g'irligi → nazorat xulosasi (YANGI S); tovar tugashi → min qoldiq (SOZLASH S) | `daftar`, `inventory` yoqish; `unit` maydoni |
| Telefon | IMEI klon/ro'yxatsiz telefon tarmoqdan uziladi → IMEI2, «UZIMEI tekshirildi» belgisi (SOZLASH S); o'g'irlangan b/u → IMEI qora ro'yxat (BOR); PQ-294 (01.01.2027) → reyestr chegarasi ogohlantirishi + kredit byurosiga eksport (YANGI M); dollar kursi → USD kirim narxidan avtomatik qayta hisob (SOZLASH M) | `inventory`, `audit`; «Sotuvchi» rolida narx tahriri o'chiq |
| Maishiy texnika | Markirovka → DataMatrix har dona (YANGI M/L); kafolat nizolari → kafolat arizasi (YANGI M) | Markirovka maydoni (tayyor bo'lganda), chekda kafolat matni |
| Mebel | Buyurtma kechiksa har kun 1% penya (Iste'molchi huquqlari qonuni, 19-modda) → «Buyurtma» moduli: avans, tayyor sanasi, holat, ogohlantirish (YANGI M); yetkazish/yig'ish xizmat qatori (SOZLASH S) | `transferred`, `size`, `color`; xarajat toifalari |
| Kiyim/poyabzal | 10 kunlik almashtirish → bitta amalda almashtirish + muddat hisoblagichi (SOZLASH S); o'lcham × rang → jadval orqali bitta kirim (YANGI M); mavsum qoldig'i → sotilmayotgan tovar hisoboti (SOZLASH S) | Chekda «10 kun ichida almashtirish» matni |
| Kosmetika | Qalbaki tovar → partiya + sertifikat rasmi (SOZLASH S); muddat → ogohlantirish 30 kun (SOZLASH S); qaytarilmaydigan toifa izohi (SOZLASH S) | `batchNumber` maydoni |
| Avto qismlar | Noto'g'ri qism → kross-raqam (analog) va mos model bo'yicha qidiruv (YANGI M); kafolat (SOZLASH S); akkumulyator markirovkasi (YANGI M) | `warrantyMonths`, `unit` (moy litrda) |
| Oziq-ovqat | Markirovka (suv, ichimlik, pivo, tamaki) → §4.1; tarozi yorlig'idagi vaznli shtrix-kod (prefiks 20–29) (YANGI S); MXIK noto'g'ri bo'lsa xaridorga keshbek tushmaydi (YANGI S) | Tarozi prefiksi sozlamasi, muddat 7 kun |
| Qurilish | Quti ↔ m² konversiyasi (YANGI M); usta bonusi (YANGI S/M); buyurtma, rezerv, yetkazish (YANGI M); «so'radi, yo'q edi» jurnali (YANGI S); optom narx (BOR) | Birlik majburiy; tayyor kategoriyalar (sement, armatura, bo'yoq, santexnika, elektr) |
| Dorixona | Markirovka + muddati o'tgan blok (Farmon №296) → §4.1; e-retsept (12 815 nom faqat QR retsept bilan, 2026 oxirigacha butun respublikada) → «Rx» belgisi + retsept raqami (YANGI S), API ochiqligini tekshirish kerak; referent narx (ustama ≤20%) → «maks. narx» maydoni, oshsa blok (YANGI S); bir dorining bir necha partiyasi → `StockLot` (YANGI M) | Rx, maks. narx, MXIK; muddat 90 kun |
| Optom | E-faktura majburiy (VMQ №522) → Didox/Faktura.uz (YANGI L); debitor qarz → kredit limiti + akt-sverka PDF (SOZLASH S); narx guruhlari (SOZLASH S); agent/marshrut (YANGI L) | Kassa standart optom rejimda; mijoz majburiy; A4 yuk xati |
| Xizmat | Mijoz kelmay qolishi 15–30% → kalendar, usta jadvali, Telegram orqali yozilish va eslatma (YANGI L); usta foizi (YANGI M); zakaz-naryad (YANGI M); material sarfi → to'plam (SOZLASH S) | **`service`'ni uchga bo'lish:** Salon/barber (ombor o'chiq, yozilish yoqiq); Avtoservis (ombor, daftar, OEM, avto raqami); Ta'mir ustaxonasi (IMEI, kafolat, ombor). Hozir `inventory: false` — ustaxonaga mos emas |

### 4.4 Ro'yxatga qo'shiladigan yangi yo'nalishlar (ustuvorlik bilan)

| # | Yo'nalish | Maxsus ehtiyoj | Mavjud modullar bilan qoplanadi | Murakk. |
|---|---|---|---|---|
| 1 | Go'sht / qassob / tovuq | kg, tarozi shtrixi, qismlarga bo'lish, qarz | ~75% | S |
| 2 | Agro do'kon (o'g'it, urug', vet. dori) | Mavsumiy (hosilgacha) qarz, partiya/muddat; agrokimyo markirovkasi 2026-05-01 dan | ~70% | S (+markirovka) |
| 3 | Avtoservis / shinomontaj | Zakaz-naryad, VIN/raqam, mexanik foizi (4,73 mln shaxsiy avtomobil) | ~50% | M |
| 4 | Kanstovar / kitob / o'yinchoq / bolalar | Sentyabr mavsumi, o'lcham/rang | ~90% | S |
| 5 | Zoo / veterinariya | Ozuqa kg'da, muddat, partiya | ~85% | S |
| 6 | Gul do'koni | Tez buziladi, guldasta = to'plam, oldindan buyurtma | ~70% | S |
| 7 | Suv yetkazish (19 l) / ichimlik distribyutori | Har mijozdagi idish balansi, marshrut, obuna; suv markirovkali | ~50% | M |
| 8 | Optika | Mijoz kartasida dioptriya, laboratoriyaga buyurtma | ~60% | M |

O'quv markazi va mehmonxona tavsiya qilinmadi — savdo/ombor asosida ishlamaydi.

### 4.5 Ro'yxatdan o'tish ustasi (wizard) — 4-talabning mahsulotdagi ko'rinishi

Hozir: biznes turi tanlanadi → preset modullarni yoqadi. Taklif: tur tanlangach **3–5 ta qisqa savol** (masalan sex uchun §2.3; restoran uchun «Ofitsant bilan ishlaysizmi yoki o'zi xizmatmi?», «Bar bormi?», «Saboy bormi?», «Xizmat haqi necha foiz?») va javobga qarab:
- modullar, mahsulot maydonlari, o'lchov birliklari, atamalar;
- rol shablonlari (Ofitsant, Oshpaz, Omborchi, Usta…);
- demo ma'lumot (masalan kiyim: 1 model × 3 o'lcham × 2 rang; telefon: 3 ta telefon + 1 nasiya jadvali);
- chek matnlari (kafolat, 10 kunlik almashtirish).

Hammasi avtomatik sozlanadi. Mavjud AI yordamchi shu yo'nalishga xos maslahatlarni (masalan «muddati 7 kunda tugaydigan 12 ta tovar») bera oladi.

**Manbalar (§4):** gov.uz/oz/soliq/news/view/244997 · kun.uz/en/news/2025/10/14/uzbekistan-introduces-automatic-system-to-stop-sales-of-expired-products · kun.uz/en/news/2026/05/06/minor-breaches-massive-fines… · gov.uz/ru/soliq/news/view/22122 · joinposter.com/en/applications/multikassa · spot.uz/oz/2026/11/11/imei-what · kun.uz/news/2026/05/13/telefon-sotib-olishdan-oldin-imei-kodini-tekshiring · kun.uz/en/news/2026/08/17/uzbekistan-introduces-new-regulations-for-installment-payment-services · kun.uz/news/2026/06/15/sotilgan-tovar-qaytarib-olinmaydi… · buxgalter.uz text180309 (texnika markirovkasi) · qalampir.uz (Bo'kadagi qalbaki kosmetika sexi) · moysklad.ru/poleznoe/shkola-torgovli/kak-voruiut-kassiry · easytrade.uz (vaznli shtrix) · hisob.app/stroy · kun.uz/en/news/2026/01/21 (e-retsept) · spot.uz/ru/2026/02/05/pharmacy-prices · spot.uz/ru/2025/03/03/pharma · gov.uz/ru/soliq/pages/elektron-hisobvaraq-fakturalar · spot.uz/ru/2026/07/31/sales-doctor-dena · vc.ru (salon kelmay qolishi, avtoservis) · alteg.io/en/uz-conference · kun.uz/en/news/2025/04/10 (agrokimyo markirovkasi) · stat.uz (avtomobillar, chakana va ulgurji korxonalar soni)

---

## 5. Yillik obuna narxi

### 5.1 Raqobatchilar (18.11.2026)

| Mahsulot | Oylik | Yillik chegirma |
|---|---|---|
| BILLZ | 299k / 499k / 999k (+179k filial) | 20% |
| MoySklad UZ | 196k / 574k / 1 372k | 20%; Start 69,3k faqat yillik; 3/6/12 oy |
| Loome | ≈15,6 mln/yil ($1 299, USD'da) | 6 oy −10%, 12 oy «2 oy bepul» |
| pDaftar | 0 / 23 843 / 119 696 / 598 961 | 17% |
| iDokon | 100k / 150k / 250k | bor, foizi yozilmagan |
| Poster | $26 / $44 / $62 | ≈10% |

Savdo dasturlarida yillik chegirma 17–20%, restoran POS'larida ≈10%. Global tavsiya (ProfitWell, Paddle): 15–20%; mijozlarning 10–20% yillikka o'tsa churn sezilarli kamayadi.

### 5.2 Tavsiya

Hozir: yillikda −20% (2 388 000 / 6 228 000 / 12 360 000). Taklif: **«12 oy — 10 oy narxida»**.

| Tarif | Oylik | **Yillik (taklif)** | Oyiga ekvivalent | **6 oylik (−10%)** |
|---|---|---|---|---|
| Boshlang'ich | 249 000 | **2 490 000** | ≈207 500 | **1 340 000** |
| Pro | 649 000 | **6 490 000** | ≈540 800 | **3 500 000** |
| Biznes | 1 290 000 | **12 900 000** | 1 075 000 | **6 960 000** |

Marketing matni: «Yillik to'lang — 2 oy bepul. Narx 12 oy o'zgarmaydi.» / «Yarim yilga to'lang — 10% tejang.»

**Nega 20% emas:**
- Oylik narxlar allaqachon BILLZ'dan past.
- Pro'da oylik mijozdan 12 oyda kutiladigan tushum: churn 3,5% → 6,45 mln; 4% → 6,28 mln; 5% → 5,96 mln. «2 oy bepul» = 6,49 mln **birinchi kuni**; 20% = 6,23 mln.
- 6,4% inflyatsiya (sentyabr 2026) + narx qulfi bilan 20% amalda ≈26% chegirmaga teng.
- Yumshoq o'tish: hozir yillik to'layotganlarga eski narx saqlanadi; 20% — 31.12.2026 gacha aksiya.

**Qo'shimcha foyda:** to'lov hozir qo'lda — oylik mijoz yiliga 12 marta uzaytiriladi, yillik — 1 marta. Yuridik shaxslarda ESF hujjatlari ham kamayadi.

**Avtomatik to'lov (keyinroq):** Click — kartani tokenlash orqali avtomatik yechish mumkin; Payme Subscribe API — PIN so'rash tavsiya qilinadi (aniqlashtirish kerak); Uzum — menejer orqali.

### 5.3 Kodga ta'siri

**Bajarildi (2026-11-18):** `lib/plans.ts` → `PREPAY_TERMS` / `prepayAmount()` (6 oy −10%, 12 oy = 10 oy narxi, 10 000 so'mga pastga yaxlit; super admin oylik narxni o'zgartirsa summalar o'zi qayta hisoblanadi). Ro'yxatdan o'tishdagi tarif kartasi, obuna to'lovi formasi va to'lov so'rovi tekshiruvi shundan oladi. Eski `yearlyPrice` maydoni olib tashlandi.

Oldingi reja:

- `web/lib/plans.ts`: `yearlyPrice` hozir oyiga ekvivalentni saqlaydi (6 490 000 / 12 = 540 833 — yaxlit emas) → yillik jami summani alohida saqlash; `yearlyDiscount()` 17% ko'rsatadi.
- 6 oylik uchun `Organization.plan.billingCycle` enumiga yangi qiymat.
- `PITCH.md`'da «yillik −20%» yozuvini yangilash.

**Manbalar (§5):** billz.io/prices · moysklad.uz/subscription · loome.uz · pdaftar.uz · idokon.uz · joinposter.com/en/pricing · learn.profitwell.com/blog/annual-vs-monthly-billing · paddle.com/resources/annual-plans · docs.click.uz/en/?p=161 · developer.help.paycom.uz/protokol-subscribe-api · kun.uz/en/news/2026/10/22/uzbekistans-annual-inflation-slows-to-64-in-september · buxgalter.uz text207256 (ESF)

---

## 6. Sizdan kerakli qarorlar

1. **Qaysi vertikal birinchi** — Restoran MVP yoki Sex MVP? (Ikkalasi ham `Recipe` dvigatelidan boshlanadi.)
2. **Restoran/sex narxi** — tarif ichida vertikal paket (tavsiya) yoki alohida add-on?
3. **Yillik narx** — «2 oy bepul» + 6 oylik variantga o'tamizmi yoki −20% qoladimi?
4. **Fiskal hamkor** — qaysi virtual kassa/OFD provayderi bilan gaplashish (bu sizning biznes qadamingiz; integratsiyani men yozaman).
5. **Bloklangan xodimning oflayn amallari** — internet qaytganda qabul qilinsinmi yoki rad etilsinmi?
6. **1.6.0 mobil build** — oflayn 3–4 bosqichlar uchun kerak; build/submit sizning qadamingiz.

## 7. Tekshirish kerak bo'lganlar

- Poyabzal, kiyim, parfyumeriya, sut mahsulotlari markirovkasi muddatlari; akkumulyator markirovkasi sanasi.
- Restoranlar uchun MXIK bo'yicha alohida qoida; saboy qadoq haqi me'yori; agregator komissiyalari.
- Virtual kassa va e-retsept API'larining ochiqligi.
- PQ-294 to'liq matni; IMEI bo'yicha sotuvchi majburiyatlari.
- R-Keeper, AliPos, iiko (to'g'ridan-to'g'ri), Jowi rasmiy narxlari.
- Add-on va ishchi o'rni narxlari — 5–10 ta restoran va sex egasi bilan suhbatda tekshirish.
