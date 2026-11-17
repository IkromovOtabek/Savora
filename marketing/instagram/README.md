# Savora — Instagram profilini sozlash

Fayllar shu papkada. Qayta yasash: `node marketing/instagram/src/make.mjs` (repo ildizidan).
Profil ko'rinishi maketi: `preview.html` (brauzerda oching).

| Fayl | Nima uchun |
|---|---|
| `avatar/avatar-tun.png` | **Profil rasmi (tavsiya)** — ilova ikonkasi bilan bir xil, App Store/Play'da ham shu belgini ko'rishadi |
| `avatar/avatar-kok.png` | Muqobil: ko'k fon, oq logo — lentada eng yorqin ko'rinadi |
| `avatar/avatar-kun.png` | Muqobil: oq fon (Instagram oq fonida chegarasi yo'qoladi — kam tavsiya) |
| `highlights/01…09-*.png` | Highlight muqovalari (1080×1920, Stories o'lchami) |

Fayllarni telefonga AirDrop bilan o'tkazing — profilning ko'p qismi faqat ilovada sozlanadi.

---

## 1. Akkaunt ochish — siz

- Shaxsiy emas, **brend pochtasi** bilan oching (masalan `support@savora.uz` yoki alohida `hello@savora.uz`). Keyin xodimga topshirish oson bo'ladi.
- **Username** (bo'shligini Instagram o'zi ko'rsatadi), tartib bo'yicha:
  1. `savora.uz` — sayt manzili bilan bir xil, eng yaxshisi
  2. `savora_uz`
  3. `savora.app`
  4. `savorauz`
- Ochilgan zahoti **ikki bosqichli himoya** (2FA): Sozlamalar → Hisoblar markazi → Parol va xavfsizlik → Ikki bosqichli autentifikatsiya → *Autentifikatsiya ilovasi* (SMS emas). Zaxira kodlarni saqlab qo'ying.

## 2. Biznes akkauntga o'tkazish — siz

Sozlamalar → **Akkaunt turi va vositalar** → *Professional akkauntga o'tish*:

1. Kategoriya: **Dasturiy ta'minot** (Software). «Profilda ko'rsatish» — yoqiq.
2. Tur: **Biznes** (Creator emas — target reklama, kontakt tugmalari va Meta Business Suite uchun).
3. **Facebook sahifasini bog'lash**: «Savora» nomli Facebook sahifa oching yoki mavjudini tanlang. Target reklama berish uchun bu shart — reklama Facebook sahifa va reklama akkaunti orqali ishlaydi.

## 3. Profilni to'ldirish

**Ism** (qidiruvda shu so'zlar bo'yicha topiladi, 30 belgigacha):
```
Savora · Nasiya dasturi
```
Muqobil: `Savora — nasiya, ombor, kassa`

**Bio** (135/150 belgi — nusxa olib qo'ying):
```
Nasiya, ombor va kassa — bitta ilovada
✅ To'lov jadvali va qarz nazorati
✅ Ko'p filial, AI yordamchi
🎁 14 kun bepul, karta shart emas 👇
```

**Havolalar** (Profilni tahrirlash → Havolalar, 5 tagacha; birinchisi bio ostida ko'rinadi):

| Sarlavha | URL |
|---|---|
| 14 kun bepul boshlash | `https://savora.uz/?utm_source=instagram&utm_medium=bio` |
| Android ilova | `https://savora.uz/download/android` |
| iPhone ilova (beta) | `https://savora.uz/download/ios` — hozircha TestFlight'ga olib boradi; App Store'ga chiqqach «beta»ni olib tashlang |
| Telegram | haqiqiy Telegram akkauntingiz |

`utm_source=instagram` — saytga Instagram'dan kelganlarni analitikada ajratish uchun.

**Kontakt tugmalari** (Profilni tahrirlash → Kontakt ma'lumotlari):
- Email: `support@savora.uz` — pochta qutisi haqiqatan ishlashini oldin tekshiring.
- Telefon: **haqiqiy** qo'llab-quvvatlash raqami. Saytdagi `+998 90 000 00 00` vaqtinchalik — Instagram'ga qo'ymang (saytdagisini ham almashtirish kerak: `web/app/contact/page.tsx`).
- Manzil: qo'ymang (onlayn xizmat).

## 4. Highlightlar

Story joylang → Highlight'ga qo'shing → *Muqovani tahrirlash* → `highlights/` dagi rasmni tanlang (markazga to'g'rilang). Bo'sh highlight bo'lmaydi — har biriga kamida 1 ta story kerak.

| Muqova | Nomi | Ichida nima bo'ladi |
|---|---|---|
| `01-nasiya` | Nasiya | Nasiya rasmiylashtirish, to'lov jadvali, kechikish nazorati |
| `02-ombor` | Ombor | Tovar qabul qilish, qoldiq, inventar |
| `03-kassa` | Kassa | Sotuv, chek, kunlik kassa |
| `04-ai` | AI | AI yordamchidan savol-javob misollari |
| `05-darslar` | Darslar | 30–60 soniyalik «qanday qilinadi» videolari |
| `06-tariflar` | Tariflar | Tariflar va 14 kunlik sinov |
| `07-ilova` | Ilova | Mobil ilovani yuklab olish, ekranlar |
| `08-fikrlar` | Fikrlar | Mijozlar fikri — **faqat haqiqiylari**, birinchisi kelgach oching |
| `09-aloqa` | Aloqa | Telegram, telefon, ish vaqti (09:00–19:00) |

Boshlash uchun 5 tasi yetarli: Nasiya, Ombor, Kassa, Ilova, Aloqa.

## 5. Xabarlar (Direct)

Sozlamalar → **Biznes vositalari** → *Tez-tez beriladigan savollar* — yangi yozganlarga tugmalar chiqadi:

1. **Narxi qancha?** → «Tariflar savora.uz saytida, har biri 14 kun bepul sinov bilan. Qaysi sohada ishlaysiz — mosini aytib beraman.»
2. **Telefonda ishlaydimi?** → «Ha: telefon, planshet va kompyuter brauzerida, Android ilovasi ham bor.»
3. **Daftar/Excel'dagi ma'lumotlarni ko'chirsa bo'ladimi?** → «Ha, Excel'dan import qilsa bo'ladi, kerak bo'lsa yordam beramiz.»
4. **Qanday boshlayman?** → «savora.uz → «Bepul boshlash», karta talab qilinmaydi.»

Shu yerda *Saqlangan javoblar*ga ham shu matnlarni qo'shing.

## 6. Xavfsizlik va tartib

- Xodim yoki SMM mutaxassisiga **parol bermang** — Meta Business Suite → Sozlamalar → Odamlar orqali kirish bering, kerak bo'lmasa olib tashlaysiz.
- Maxfiylik → *Yashirin so'zlar* → haqoratli izohlarni yashirish — yoqiq.
- Akkaunt **ochiq** (public) bo'lsin.

## 7. Birinchi postlar

- Profil to'ri endi **3:4** ko'rinadi: post/reels muqovasini 1080×1350 qiling yoki matnni markaziy 3:4 qismda saqlang.
- Ochilishda kamida 6–9 ta post bo'lsin, 3 tasini **mahkamlang** (pin):
  1. «Savora nima?» — qisqa reels (`marketing/video/` dagi reels)
  2. «Nasiya qanday ishlaydi» — 4 qadam (landingdagi «Sotuvdan undirishgacha»)
  3. «14 kun bepul boshlang» — havola biodaligini ayting
- Har kungi reels rejasi — `marketing/video/` (savora-reel-NN).
- Da'volar: faqat ishlab turgan funksiyani ayting. Mijozga avtomatik SMS eslatma yo'q — «eslatma» desangiz, egaga Telegram'da va mijozga bir tugmada yuborilishini aniq ayting.
