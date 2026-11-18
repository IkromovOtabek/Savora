# «Soliq ko'prigi» — MXIK va markirovka (1-bosqich)

> Holat: 2026-11-18. Taklif: `docs/business/TAKLIF_2026-11_SHABLONLAR.md` §4.1.
> **Savora cheki fiskal chek EMAS** — do'konning ichki hujjati. Qonun talab qiladigan chekni onlayn-NKM yoki
> virtual kassa beradi. Bu bosqich ma'lumotni (MXIK, markirovka kodlari) to'g'ri yig'ib, keyingi integratsiyaga
> tayyorlaydi — o'zi soliq organiga hech narsa yubormaydi.

## Nima qilindi

| Qism | Qayerda | Izoh |
|---|---|---|
| MXIK maydoni (hamma yo'nalish) | `Product.ikpu`, `components/tenant/ProductForm.tsx` → `MxikField`, mobil `app/product-new.tsx` | 17 raqam (`lib/mxik.ts → parseMxikInput`), bo'sh — ruxsat. Yaratish va tahrirda (`app/actions/products.ts`) |
| MXIK katalogidan qidiruv | `GET /api/mxik/search?q=` (web sessiya), `GET /api/mobile/mxik/search?q=` (mobil token), `lib/mxikCatalog.ts`, mobil `app/mxik-pick.tsx` | Server proksi: kesh 12 soat, timeout 6 s, rate-limit 30/daq foydalanuvchiga + 600/daq serverga. Xato bo'lsa — rasmiy saytga havola, kod qo'lda |
| «MXIK yo'q» filtri | `/app/products?mxik=none` | Ombor filtr lentasida chip (soni bilan) |
| Excel import/eksport | `lib/productImport.ts` (`ikpu` ustuni, namuna faylda oxirgi ustun), `app/api/export/products` (MXIK, Markirovka ustunlari) | Excel songa aylantirib boshidagi 0 ni tashlasa — 17 xonaga to'ldiriladi |
| GS1 DataMatrix o'qish | `lib/gs1.ts` (= `mobile/lib/gs1.ts`, `tests/gs1.test.ts` aynanligini tekshiradi) | (01) GTIN, (21) seriya, (17) yaroqlilik, (10) partiya, (91)/(92)/(93); GS/FNC1 turli ko'rinishlari, `]d2` prefiksi, qavsli ko'rinish, rus klaviatura tartibi, GS yo'q bo'lsa — ma'lum formatlar bo'yicha taxmin (`guessed`), sigaret qutisining AI'siz qisqa formati |
| Skanerlar | `lib/barcodeCameraScan.ts` (BarcodeDetector `data_matrix` bo'lsa, aks holda ZXing), `BarcodeInputField` (USB/HID — GS (29) saqlanadi), mobil `app/scan.tsx` (`datamatrix`) | Mahsulot formasida DataMatrix → shtrix-kod maydoniga EAN-13, «Markirovkali» yoqiladi, yaroqlilik/partiya bo'sh bo'lsa to'ldiriladi |
| Tovar ↔ GTIN | `lib/marking.ts → productMatchesGtin` | Alohida `gtin` maydoni **yo'q**: GTIN-13 = EAN-13, mavjud `barcode`/`imei` bilan solishtiriladi (14/13/12/8 xonali ko'rinishlar) |
| «Markirovkali» belgisi | `Product.marked` | Faqat tovar turida. Katalogda `label = 1` bo'lsa forma o'zi yoqadi (tamaki, pivo, suv va h.k. — tekshirildi) |
| Kassada kod | `components/tenant/PosScreen.tsx`, `app/actions/pos.ts`, `Sale.markingCodes` / `Sale.markingKeys` | DataMatrix skanerlansa kod qatorga bog'lanadi (avval kodsiz donalarga, keyin miqdor +1). Qatorda «Kod n/k» belgisi |
| Bir kod — bir sotuv | `lib/marking.ts → checkMarkingLines, soldMarkingConflict`, indeks `sales.markingKeys` | Kalit `01<GTIN>21<seriya>`; savatchada va bekor qilinmagan sotuvlarda takror — rad |
| Sozlama | Sozlamalar → Markirovka (`ShopSettings.stock.markingMode`) | `warn` (standart): kodsiz ham sotiladi, ogohlantirish. `require`: har donaga kod shart, muddati o'tgan rad |
| Muddat | (17) AI | `warn` — tasdiq so'raladi; `require` — kassa va server rad etadi |
| Chek | `components/tenant/ReceiptPaper.tsx` | Har qatorda «MXIK: …» (sotuvdagi `productSnapshot.ikpu`, bo'lmasa mahsulotning joriy MXIK'i — `lib/receiptIkpu.ts`), «[M] Markirovka: <seriyalar>», pastda «Fiskal chek emas — do'konning ichki hujjati». Ochiq chekka (/r/…) faqat seriya chiqadi |
| Sex so'rovi | `createProductAction → readCreateStockSettings` | Yangi mahsulotda minimal qoldiq, xarid birligi + koeffitsient shu formada (qoidalar `setStockSettings` bilan bir xil) |

## MXIK manbasi va shartlari

- Rasmiy katalog: <https://tasnif.soliq.uz> (Soliq qo'mitasi, «Yagona elektron milliy katalog»).
- Qidiruv sayt frontendining o'zi ishlatadigan JSON API orqali: `https://tasnif.soliq.uz/api/cls-api/elasticsearch/search?search=&page=&size=&lang=uz|ru`.
  2026-11-18 tekshirildi: kalit/token talab qilinmaydi, `robots.txt` hech narsani taqiqlamaydi, foydalanish shartlari
  e'lon qilinmagan. **Rasmiy hujjatlashtirilmagan** — o'zgarishi yoki O'zbekistondan tashqaridagi serverlarga javob
  bermasligi mumkin (ochiq MIT kutubxona `mxik` / github.com/azabroflovski/mxik-js ham shuni ogohlantiradi).
  Shuning uchun: kesh, timeout, rate-limit va har doim qo'lda kiritish + rasmiy sayt havolasi.
- Tashqi so'rovga faqat qidiruv matni (nom/kod/shtrix-kod) va til ketadi — do'kon, foydalanuvchi, mijoz ma'lumoti yo'q.
- `lang=uz` nomlarni **kirill** o'zbekchada qaytaradi (lotin varianti qidiruvda yo'q) — rasmiy matn o'zgartirilmay ko'rsatiladi.
- Kod tuzilishi (katalog daraxti): guruh 3 · sinf 5 · pozitsiya 8 · subpozitsiya 11 · brend 14 · atribut 17 raqam.
  Eski 8 xonali kodlar 17 xonaliga almashtirilgan (buxgalter.uz izohlari), shuning uchun yangi kiritish faqat 17 raqam.
- Katalogda yozuvning `label = 1` belgisi markirovkali tovarlarda uchraydi (tamaki, pivo — tekshirildi; non — 0).
  Bu rasmiy hujjatda tasdiqlanmagan kuzatuv: forma faqat «Markirovkali»ni yoqib qo'yadi, egasi o'chira oladi.
- Prod serverdan API'ga ulanish tekshirilmadi — deploydan keyin `/api/mxik/search?q=kofe` ni sinash kerak.

## Cheklovlar (halol)

- **Fiskal emas.** Chek soliq organiga yuborilmaydi; onlayn-NKM/virtual kassadagi chek alohida beriladi (ikki marta kiritish hali qoladi).
- Markirovka kodining **haqiqiyligi** (Asl Belgisi tizimida mavjudligi, kirimi qayd etilganmi) tekshirilmaydi — faqat format, GTIN mosligi, takror va muddat.
- Kod faqat **Kassa (POS)** orqali bog'lanadi. Oddiy sotuv formasi, tez sotuv, restoran to'lovi va mobil (oflayn) sotuv kod so'ramaydi va saqlamaydi.
- Takror tekshiruvi so'rov + indeks bilan (unique emas): bir xil kodni ikki kassada aynan bir vaqtda sotish poygasi nazariy jihatdan mumkin.
- Qisman qaytarilgan sotuvdagi kodlar qayta sotishni bloklamaydi (qaysi dona qaytgani noma'lum); to'liq bekor qilingan sotuv kodlari bo'shaydi.
- GS ajratgichi yo'q kodda seriya chegarasi taxmin qilinadi (91+92, 92, 93 dumlari bo'yicha) — noodatiy formatda xato bo'lishi mumkin.
- Restoran menyu muharriri (`components/restaurant/settings/MenuEditor.tsx`) MXIK'ni hali 5–30 raqam bilan qabul qiladi (restoran agenti zonasi) — 17 raqamga moslash tavsiya etiladi.
- Excel 15 raqamdan uzun sonni yaxlitlaydi: MXIK ustunini Excel'da **matn** formatida saqlash kerak (boshi 0 bilan boshlanmaydigan 17 xonali kodlar uchun).

## Keyingi bosqichlar

- **2-bosqich (M):** kirimda (`GoodsReceipt`) markirovka kodlarini qabul qilish; omborda kod bo'yicha qoldiq; qisman qaytarishda kodni tanlash; oddiy sotuv formasi va restoran to'lovida kod.
- **3-bosqich (L):** ro'yxatdagi virtual kassa bilan integratsiya (hamkor kerak — masalan Multikassa, Poster shunday qilgan):
  Savora savatchasi → virtual kassa API (MXIK, markirovka kodi, to'lov turi) → fiskal belgi/QR chekka. ESF importi (Didox / Faktura.uz).
  Hamkor API'si, shartnoma va sertifikatsiya talablari aniqlanmaguncha boshlanmaydi.
