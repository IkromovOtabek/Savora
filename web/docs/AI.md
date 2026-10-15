# AI yordamchi va Topshiriqlar

## 1. Qanday ishlaydi

```
/app/ai ochildi
  └─ bugungi hisobot (ai_reports, shu doira) bormi? ── ha ──► ko'rsatiladi (AI chaqirilmaydi)
        │ yo'q
        ▼
  lib/ai/snapshot.ts  — 30 kunlik AGREGAT ko'rsatkichlar (Mongo aggregate)
  lib/ai/report.ts    — xesh (o'zgarmagan bo'lsa kesh) → kunlik limit (10) → tahlil
  lib/ai/analyze.ts   — ANTHROPIC_API_KEY bor: Claude (Messages API, JSON sxema, 30 s timeout)
                        yo'q / xato / timeout / yaroqsiz javob: lib/ai/rules.ts (qoidalar)
  lib/ai/validate.ts  — AI javobini himoyali tekshirish (enum, uzunlik, son chegaralari)
        ▼
  ai_reports ga yoziladi (day, scopeKey, model, snapshotHash, snapshot, result, createdAt)
```

- **Natija shakli** (AI ham, qoidalar ham bir xil):
  `{ summary, health: 'yaxshi'|'o'rta'|'xavfli', insights[{title, detail, metric?}], recommendations[{title, detail, priority, impact}], tasks[{title, detail, role, dueInDays}] }`.
- **Manba belgisi:** sahifada "AI" yoki "Qoidalar asosida" + oxirgi yangilanish vaqti. AI ishlamagan
  bo'lsa sababi (`fallbackReason`: `no_key`, `timeout`, `http_XXX`, `refusal`, `invalid_json`...) saqlanadi.
- **Qayta tahlil** (server action `rerunAiAnalysisAction`): yangi snapshot olinadi; ma'lumot o'zgarmagan va
  bugungi hisobot AI'dan bo'lsa — qayta chaqirilmaydi ("ma'lumot o'zgarmagan").
- **Dashboard** (`/app`) — faqat bugungi keshdagi birinchi tavsiya ("AI tavsiya" kartasi). Dashboard ochilganda AI chaqirilmaydi.
- **Mobil** `GET /api/mobile/ai` — faqat keshdagi oxirgi hisobot, yangi tahlil boshlamaydi.
- **Topshiriqqa aylantirish:** "Topshiriq sifatida qo'shish" → `tasks` kolleksiyasiga `source: 'ai'` bilan yoziladi,
  hisobotda `addedTasks.<index>` belgilanadi (ikki marta qo'shilmaydi).

### Doira (scope)
- Egasi (admin) — barcha filiallar, `scopeKey = 'all'`.
- Filial login (`ai.view` berilgan bo'lsa) — faqat o'z filiali, `scopeKey = <branchId>`; keshi alohida.

### Qoidalar dvigateli (`lib/ai/rules.ts`, testlar: `tests/aiRules.test.ts`)
| Shart | Natija |
|---|---|
| Muddati o'tgan qarz ulushi > 15% | undirish tavsiyasi (>30% — "yuqori", holat "xavfli") + kassirga qo'ng'iroq topshirig'i |
| 90+ kun kechikkan qarz bor | alohida "yuqori" tavsiya |
| Faol nasiyada muddat > 12 oy | PQ-294 (2027) ogohlantirishi |
| 7 kun ichida to'lov muddati keladi | sotuvchiga eslatma topshirig'i |
| Qoldig'i ≤ 3 ta mahsulot | buyurtma topshirig'i (egasi / filialda — rahbar); ≥5 ta — minimal zaxira tavsiyasi |
| Haftalik tushum ≤ −15% | aksiya tavsiyasi + topshiriq (≤ −30% — "xavfli") |
| Filialda 7 kun sotuv yo'q (asosiy ombordan tashqari) | filial rahbariga topshiriq |
| Nasiya tushumning ≥ 60% | naqd savdo ulushini oshirish tavsiyasi |
| Bitta mahsulot tushumning ≥ 40% | assortiment tavsiyasi |
| 30 kunda sotuv yo'q | "ma'lumot yetarli emas" |

## 2. Maxfiylik — faqat agregat ma'lumot

Claude'ga **faqat** `AiSnapshot` (`lib/ai/types.ts`) yuboriladi:
summalar, sonlar, o'rtacha chek, kunlik tushum, to'lov turlari ulushi, mahsulot nomi + soni (top 10, qoldig'i oz),
qarz savatlari (1-30 / 31-60 / 61-90 / 90+ kun), filial nomi + tushumi, biznes turi.

**Yuborilmaydi:** mijoz ismi, telefoni, IMEI, sotuv raqami, xodim username'lari, izohlar, manzil.
`Sale.customerSnapshot`, `productSnapshot.imei`, `payments.note` snapshot qurishda umuman so'ralmaydi yoki
faqat server ichida hisob uchun ishlatiladi. Bu qoidani o'zgartirish — maxfiylik siyosatini o'zgartirish demakdir.

`ai_reports` tenant bazasida 90 kun saqlanadi (TTL indeks), keyin avtomatik o'chadi.

## 3. Muhit o'zgaruvchilari

| O'zgaruvchi | Majburiy | Izoh |
|---|---|---|
| `ANTHROPIC_API_KEY` | yo'q | Bo'lmasa AI chaqirilmaydi — qoidalar asosida tahlil ishlaydi |
| `ANTHROPIC_MODEL` | yo'q | Standart `claude-sonnet-5-5` |

So'rov: `POST https://api.anthropic.com/v1/messages` (`x-api-key`, `anthropic-version: 2023-06-01`),
`output_config.format` — JSON sxema (strukturali javob), `output_config.effort: 'low'` (30 s ga sig'ishi uchun).
Sonnet 5.5 / Opus 5.5 / Opus 5 / Fable 5.1 da `fallbacks: 'default'` (beta `server-side-fallback-2026-07-01`)
yoqilgan — xavfsizlik klassifikatori rad etsa, server boshqa modelda qayta urinadi. `stop_reason: 'refusal'` yoki
`'max_tokens'` bo'lsa — qoidalarga o'tiladi. SDK o'rnatilmagan (bog'liqliksiz `fetch`).

## 4. Limitlar

- **10 ta tahlil / do'kon / kun** (`AI_DAILY_LIMIT`, barcha foydalanuvchilar va doiralar birga) — atomik
  hisoblagich `counters` kolleksiyasida (`_id: ai:YYYY-MM-DD`). Kesh (ma'lumot o'zgarmagan) limitni sarflamaydi.
- Timeout — 30 soniya; sahifa `maxDuration = 60`.
- Natija chegaralari: insights ≤ 8, recommendations ≤ 6, tasks ≤ 6; matnlar qisqartiriladi.

## 5. Narx (taxminiy)

Claude Sonnet 5.5: $2 / 1M kirish, $10 / 1M chiqish tokeni.
Bitta tahlil ≈ 4–6 ming kirish + 1.5–3 ming chiqish tokeni ⇒ **≈ $0.02–0.05**.
Odatda kuniga 1–2 tahlil (sahifa birinchi ochilganda + "Qayta tahlil") ⇒ do'kon uchun **≈ $1–3 / oy**;
eng yomon holat (har kuni 10 ta) ≈ $15 / oy. Bu taxmin — haqiqiy sarfni Anthropic Console → Usage'da kuzating.
Tejash: kalit qo'yilmasa yoki limit tugasa — bepul qoidalar dvigateli ishlaydi.

## 6. Topshiriqlar (`tasks` moduli)

- Model: `lib/models/tenant/Task.ts` (`tasks` kolleksiyasi) — title, detail, role, assigneeUserId, branchId,
  status (`todo` / `doing` / `done`), priority, dueDate, source (`ai` / `manual`), createdBy, completedAt.
- Server action'lar (`app/actions/tasks.ts`): yaratish, AI'dan yaratish, holat, biriktirish, o'chirish — har biri
  audit jurnaliga (`entity: 'task'`) yoziladi.
- Huquqlar: `docs/HUQUQLAR.md` → `tasks.manage`, `ai.view`.
- Sahifa `/app/tasks`: desktopda 3 ustun (Bajarish kerak / Jarayonda / Bajarildi), mobilda holat segmenti +
  ro'yxat va "Topshiriq" FAB; filtr Mening / Filial / Hammasi; muddati o'tganlar qizil.
- Menyu badge'i — bajarilmagan topshiriqlar soni (indeksli `countDocuments`).
- Mobil: Kabinet → "Topshiriqlar" (`mobile/app/tasks.tsx`), "Bajarildi" tugmasi → `PATCH /api/mobile/tasks/[id]`.
