# Yurist va asoschi tasdiqlashi kerak bo'lgan bandlar

Tahrir: 2026-yil oktabr. Ommaviy sahifalardagi matn toza, to'ldiriladigan joylar `[kvadrat qavs]` da (`<Ph>` komponenti, `app/terms/legal.tsx`). **Relizdan oldin litsenziyali yurist ko'rib chiqishi shart.** Bu hujjat yuridik maslahat emas.

## Ommaviy oferta (`app/terms/page.tsx`)

- [ ] Ijrochi rekvizitlari: to'liq nomi, STIR, manzil, bank (h/r, MFO), rahbar.
- [ ] Aksept usuli: ro'yxatdan o'tish formasida "Oferta va Maxfiylik siyosatiga roziman" belgisi **hozir yo'q** (`app/register/RegisterForm.tsx` — boshqa egasi bor). Qo'shish tavsiya etiladi, rozilik vaqti va oferta versiyasi saqlansin.
- [ ] Fuqarolik kodeksi ommaviy oferta/aksept moddalariga va "Elektron tijorat to'g'risida"gi qonunga (O'RQ-792, 29.09.2022) havola to'g'riligi.
- [ ] QQS: Ijrochining soliq rejimi (IT Park rezidentligi bo'lsa — shartlar).
- [ ] Sinov tugagach va shartnoma tugagach ma'lumot saqlash muddati (hozir [30] kun) va zaxiradan o'chish ([90] kun) — texnik jihatdan bajariladimi.
- [ ] Ma'lumot eksporti muddati ([10] ish kuni).
- [ ] Javobgarlik chegarasi (3 oylik obuna) — iste'molchi bo'lmagan (B2B) shartnoma uchun qonuniyligi.
- [ ] Ofertani o'zgartirish haqida xabar muddati ([10] kun), pretenziya muddati ([15] kun), sudlov (Ijrochi joylashgan joydagi vakolatli sud — iqtisodiy/fuqarolik).
- [ ] Ishlash vaqti maqsadi ([99%]) va yordam ish vaqti ([09:00–19:00]).
- [ ] To'lov usullari: Payme/Click qachon ulanadi; hozir chek yuklash va qo'lda tasdiqlash.

## Maxfiylik siyosati (`app/privacy/page.tsx`)

- [ ] **Saqlash joyi** (eng muhim): ma'lumotlar qayerda (davlat, provayder). "Shaxsga doir ma'lumotlar to'g'risida"gi qonun 27¹-modda; 26.03.2026 dagi 1125-son o'zgartirishlarga ko'ra majburiy lokalizatsiya faqat biometrik, genetik va mahalliy telekom abonentlari ma'lumotlariga qoldi; boshqalari — VM 29.07.2026 dagi ro'yxatdagi 49 "adekvat" davlatda yoki namunaviy shartnoma shartlari bilan. Provayder (MongoDB klaster, Cloudflare R2) joylashuvi va ro'yxatga mosligini tekshirish.
- [ ] Ma'lumotlar bazasini davlat reyestrida ro'yxatdan o'tkazish talabi (tekshirilmadi).
- [ ] Vakolatli organ nomi (shikoyat uchun).
- [ ] Ma'lumot sizib chiqqanda xabar berish: 24 soat ichida xabar, 72 soatda batafsil hisobot (kun.uz, 04.08.2026) — ichki tartib (RUNBOOK) bilan moslash.
- [ ] Uchinchi tomon provayderlar ro'yxati: hosting, fayl saqlash, SMS (Eskiz), Telegram, AI provayder — har biri bilan ma'lumotga ishlov berish kelishuvi.
- [ ] Saqlash muddatlari: [30]/[90] kun, texnik jurnallar [12] oy.
- [ ] Ma'lumot himoyasi mas'uli F.I.Sh. va email.
- [ ] Do'kon (mulkdor) va Savora (operator) o'rtasida alohida **ma'lumotlarga ishlov berish kelishuvi (DPA)** kerakmi yoki oferta bandi yetarlimi.

## Bog'lanish (`app/contact/page.tsx`)

- [ ] Telefon `+998 90 000 00 00` — vaqtinchalik, haqiqiysi bilan almashtirish.
- [ ] Telegram `@savora`, email `support@savora.uz` — mavjudligini tekshirish.
- [ ] Rekvizitlar.

## Mahsulot va marketing (huquqiy xavf)

- [ ] **Hero animatsiyasi** (`components/landing/HeroMotion.tsx`, o'zgartirilmadi — talab bo'yicha) "Shartnoma №1048 imzolandi · SMS-kod orqali" va "Shartnomani" so'zini ko'rsatadi; `app/layout.tsx` metadata ham "shartnoma" deydi. Shartnoma/SMS-imzo moduli kodda **yo'q**. Iste'molchini chalg'itish xavfi — modul chiqquncha matnni o'zgartirish tavsiya etiladi (asoschi qarori).
- [ ] Sotuv formasi nasiyani 60 oygacha qabul qiladi (`app/actions/sales.ts`). 2027-01-01 dan 12 oy chegarasi — `lib/pq294.ts` dagi `checkPq294` bilan ogohlantirish qo'shish (sotuv modulining egasi bilan).
- [ ] PQ-294 matnini lex.uz'dagi asl nusxa bilan solishtirish: 50% chegarasi qanday hisoblanadi (yillik/asosiy qarzga), 250 BHM — tovar narximi yoki jami summa, "operator" ta'rifi va 500 mln/50% chegarasi.
- [ ] BHM qiymati (`lib/pq294.ts` → `BHM_SUM = 440 000`, 250 BHM ≈ 110 mln) — rasmiy qiymat bilan yangilash.
- [ ] Landingdagi BNPL komissiyalari (Alif 12 oy ≈30%) — "taxminiy" deb belgilangan; rasmiy manba topilmadi.
- [ ] Reklama SMS: 01.11.2026 dan faqat rozilik bilan va 09:00–18:00 (strategiya tadqiqoti) — Daftar SMS eslatmalari xizmat xabari sifatida tasniflanishini tasdiqlash.
