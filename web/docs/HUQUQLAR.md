# Modullar, biznes turlari va huquqlar

Ikki alohida qatlam bor:

| Qatlam | Savol | Kim boshqaradi | Kod |
|---|---|---|---|
| **Modul** (feature) | Do'konga qaysi bo'lim OCHIQ? | Tarif + biznes turi + Super Admin | `lib/features.ts`, `lib/businessPresets.ts` |
| **Huquq** (permission) | Do'kon ichida KIM nima qila oladi? | Rol standarti + do'kon egasi + Super Admin | `lib/permissions.ts`, `lib/permissionGuard.ts` |

Bo'lim ko'rinishi uchun **ikkalasi ham** kerak: modul yoqiq **va** foydalanuvchida huquq bor.

## 1. Modullarni hisoblash tartibi

```
1) Tarif standarti     TENANT_MODULES[key].defaultByPlan[tier]
2) Biznes preseti      BUSINESS_FEATURE_PRESETS[businessType]
                       false → o'chiradi
                       true  → faqat tarif ruxsat bersa yoqadi (planAllows: allowedByPlan ?? defaultByPlan)
3) Super Admin         org.features — faqat aniq qiymatlar, eng ustun (tarifdan tashqari ham yoqishi mumkin)
```

- Ro'yxatdan o'tishda `org.features` **saqlanmaydi** — tarif + preset har safar hisoblanadi.
  Shuning uchun tarif yoki biznes turi o'zgarsa, modullar ham avtomatik o'zgaradi.
- Super Admin "Modullarni saqlash" bosganda faqat **bazadan farq qiladigan** modullar override bo'lib yoziladi.
- "Biznes turiga mos funksiyalarni qo'llash" — biznes turini o'rnatadi va barcha override'larni tozalaydi.
- Tarif o'zgarsa override'lar tozalanadi (yangi tarif + preset).
- Eski do'konlarda `features` to'liq saqlangan — ular override hisoblanadi, xulq o'zgarmaydi.
  Presetga o'tkazish uchun Super Admin'da "qo'llash" tugmasini bosing.
- UI'da har modul yonida manba: **Tarif** / **Preset** / **Qo'lda**.

## 2. Biznes turi → preset

`+` — yoqadi (tarif ruxsat bersa), `−` — o'chiradi, `·` — tarif standarti.

| Biznes turi | id | Nasiya | Variant | Kredit kassa | Daftar | Inventar | Filialga berildi | Rasm |
|---|---|---|---|---|---|---|---|---|
| Umumiy savdo | `general` | · | · | · | · | · | · | · |
| Telefon do'kon | `phone_shop` | + | + | + | · | · | + | · |
| Maishiy texnika | `electronics` | + | + | + | · | + | + | · |
| Mebel | `furniture` | + | + | + | · | · | · | + |
| Kiyim-kechak | `clothing` | − | − | − | · | + | · | + |
| Oziq-ovqat / minimarket | `grocery` | − | − | − | + | + | · | · |
| Qurilish mollari | `building` | − | − | − | + | + | + | · |
| Kosmetika / parfyumeriya | `cosmetics` | − | − | − | · | + | · | + |
| Dorixona | `pharmacy` | − | − | − | · | + | + | · |
| Avto ehtiyot qism | `auto_parts` | − | − | − | + | + | · | · |
| Optom savdo | `wholesale` | − | − | − | + | + | + | · |
| Restoran / kafe | `restaurant` | − | − | − | · | + | − | + |
| Xizmat markazi | `service` | − | − | − | · | − | − | · |

Barcha biznes turlari presetida `ai` va `tasks` ham `+` (yo'nalishdan qat'i nazar foydali) — tarif ruxsat bersa yoqiladi.

Tarif ruxsatlari: Nasiya, Variant, Kredit kassa, Inventar, Hisobot, Eksport, Rasm, **AI yordamchi** (`ai`) — **Pro+**.
**Topshiriqlar** (`tasks`) — barcha pullik tariflar (**Starter+**), bepulda o'chiq.
Daftar — standart o'chiq, lekin preset **Starter+** da yoqa oladi. Bepul tarifda preset faqat o'chira oladi.

Boshqa farqlar (`lib/businessTypes.ts` → `TERMS`): bo'lim nomi va birlik ("Menyu/Taom", "Dorixona/Dori",
"Material", "Kiyim"...), kod maydoni ("IMEI", "Artikul", "Shtrix"). IMEI rejimi — faqat `phone_shop`.

## 3. Huquqlar ro'yxati

Saqlash: tenant `User.permissions?: string[]`. Bo'sh (`undefined`) → rol standarti.
**Admin (do'kon egasi) doim hammasiga ega.** "Faqat egasi" huquqlarini filialga berib bo'lmaydi.

| Kalit | Nomi | Admin | Filial (standart) | Server tekshiruvi |
|---|---|---|---|---|
| `sale.create` | Sotuv qilish | ✓ | ✓ | createSale, quickSale, quickMarkSold, `/app/sales/new`, mobil POST /sales |
| `sale.cancel` | Sotuvni bekor qilish | ✓ | — | cancelSaleAction (filial — faqat o'z filiali) |
| `sale.discount` | Chegirma berish | ✓ | ✓ | createSale: sotuv narxidan arzon |
| `sale.editPrice` | Sotuvda narxni o'zgartirish | ✓ | ✓ | quickSale: narxni qo'lda o'zgartirish |
| `payment.accept` | To'lov qabul qilish | ✓ | ✓ | addSalePayment, mobil POST /sales/[id] |
| `product.create` | Mahsulot qo'shish | ✓ | ✓ | createProduct, import, `/app/products/new`, mobil POST /products |
| `product.edit` | Mahsulotni tahrirlash | ✓ | ✓ | updateProduct |
| `product.delete` | Mahsulotni o'chirish | ✓ | — | deleteProduct |
| `product.viewCost` | Kelish narxini ko'rish | ✓ | ✓ | ro'yxat/batafsil/sotuvlar, CSV, mobil products |
| `transfer.create` | Filialga berish | ✓ | ✓ | transferProduct, mobil POST /transfer |
| `kassa.view` | Kassani ko'rish | ✓ | ✓ | `/app/kassa` layout |
| `kirimChiqim.manage` | Kirim-chiqim | ✓ | faqat egasi | `/app/kirim-chiqim` (admin), mobil /kirim-chiqim |
| `reports.view` | Hisobot | ✓ | ✓ | `/app/monitoring` layout |
| `customers.manage` | Mijozlar | ✓ | ✓ | customers action'lari |
| `export.data` | Eksport (CSV) | ✓ | — | `/api/export/*` |
| `audit.view` | Amallar tarixi | ✓ | faqat egasi | `/app/audit` |
| `daftar.manage` | Daftar | ✓ | ✓ | daftar action'lari, `/app/daftar` |
| `users.manage` | Filial va loginlar | ✓ | faqat egasi | `/app/users`, mobil POST /branches |
| `ai.view` | AI yordamchi | ✓ | — (egasi bera oladi) | `/app/ai` layout, rerunAiAnalysis, createTaskFromAi, mobil GET /ai, dashboard "AI tavsiya" |
| `tasks.manage` | Topshiriqlarni boshqarish | ✓ | — (egasi bera oladi) | createTask, createTaskFromAi, assignTask, deleteTask |

**Topshiriqlar — ko'rish va bajarish huquqsiz:** `tasks` moduli yoqiq bo'lsa, har bir login o'z doirasidagi
topshiriqlarni ko'radi va holatini o'zgartiradi (updateTaskStatus, mobil PATCH /tasks/[id]).
Doira (`lib/tasks.ts → taskScope`): egasi — hammasi; filial login — o'z filiali + o'ziga biriktirilganlar.
`tasks.manage` berilgan filial login faqat o'z filialida va o'z filiali xodimlariga topshiriq yarata oladi.

**AI yordamchi doirasi:** egasi — barcha filiallar bo'yicha tahlil; `ai.view` berilgan filial login — faqat
o'z filiali bo'yicha (alohida kesh). Batafsil: `docs/AI.md`.

Kelish narxi huquqsiz: tahrir formasida maydon ko'rinmaydi va server eski qiymatni saqlaydi;
yangi mahsulot qo'shishda kiritiladi (kirim hujjati). Mobil javobda `purchasePrice: 0`, `costHidden: true`.

## 4. Qayerda boshqariladi

- **Do'kon egasi:** `/app/users` → login qatoridagi kalit tugmasi → "Huquqlar" oynasi.
- **Super Admin:** `/super/organizations/[id]` → "Modullar" (preset tugmasi + manba belgisi) va
  "Huquqlar" (loginlar × huquqlar matritsasi, saqlash va standartga qaytarish).
- **Mobil:** `GET /api/mobile/me` → `features` (o'zgarmagan) + yangi `permissions` massivi.
  Topshiriqlar: `GET /api/mobile/tasks?f=mine|branch|all&s=todo|doing|done`, `PATCH /api/mobile/tasks/[id]` `{ status }`.
  AI: `GET /api/mobile/ai` — faqat keshdagi oxirgi hisobot (yangi tahlil boshlamaydi).

Huquqlar sessiyada saqlanmaydi — har so'rovda tenant bazadan o'qiladi, o'zgarish darhol kuchga kiradi.
