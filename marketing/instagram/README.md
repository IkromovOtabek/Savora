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

## Holat (2026-11-18)

Web orqali qilingan: ism, bio (150/150), kategoriya «Dasturiy ta'minot», telefon +998 99 829 60 02 (kontakt tugmasi yoqiq),
profil rasmi, eski 9 reels profil to'ridan olingan («Убрать из сетки» — Reels bo'limida qoladi).

**2026-11-18 joylandi** (Claude in Chrome orqali): 9 post — 5 karusel, 3 rasm (6-post rasm varianti), 1 reels (#01, AI belgisi bilan). 2026-11-18 reels ovozi UzbekVoice «jasur» ga almashtirildi: yangisi joylandi, eski (Edge TTS) o'chirildi.
Caption'lar content-plan.md §3 dan (6-post rasmga moslangan). Web'da «Mahkamlash» yo'q — 1, 2, 3 hozir eng yangi bo'lgani uchun baribir yuqori qatorda.

Instagram web'da **qilib bo'lmaydi**, telefondagi ilovada:
1. **Havolalar** — Profilni tahrirlash → Havolalar: `bufu.uz` va ikkinchisini o'chirib, savora.uz havolalarini qo'shing (pastdagi jadval).
2. **Eski reels arxivi** — har birida ··· → Arxivlash (web'da faqat qaytarib bo'lmaydigan «O'chirish» bor).
3. **Story + highlight** — `stories/01…06-*.jpg` ni story qilib qo'ying → har birini o'z highlight'iga qo'shing (nomi: Nasiya, Ombor, Kassa, Ilova, Tariflar, Aloqa). Kadr o'rtasidagi ikonka muqova bo'lib qoladi — muqovani alohida tanlash shart emas.
4. **Mahkamlash** — yangi post qo'yishdan oldin 3 → 2 → 1 ni mahkamlang (post ··· → «Закрепить в профиле»), aks holda yangi post ularni pastga suradi.

Kontent rejasi, 30 kunlik kalendar va Direct javoblari: [content-plan.md](content-plan.md).
Qayta yasash: `node marketing/instagram/src/posts.mjs`, `node marketing/instagram/src/stories.mjs`.

---

## 1. Akkaunt ochish — siz

- Shaxsiy emas, **brend pochtasi** bilan oching (masalan `support@savora.uz` yoki alohida `hello@savora.uz`). Keyin xodimga topshirish oson bo'ladi.
- **Username** (bo'shligini Instagram o'zi ko'rsatadi), tartib bo'yicha:
  1. `savora__uz` — tanlangan (savora.uz va savora_uz band)
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

**Bio** (139/150 belgi — @savora__uz da o'rnatilgan):
```
Nasiya, ombor va kassa — bitta ilovada
📅 To'lov jadvali va qarz nazorati
🏪 Ko'p filial, AI yordamchi
🎁 14 kun bepul, karta shart emas 👇
```
Instagram biodagi ✅ (galochka) belgisini rad etadi — tasdiq belgisiga o'xshagani uchun.

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

Xabarlar → ⋯ → **Vositalar** → *Tez-tez beriladigan savollar* (4 tagacha) — yangi yozganlarga tugmalar chiqadi:

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

To'liq ko'rinish: [grid-preview.png](grid-preview.png). Har post papkasi — `posts/<n>-<nom>/`, slaydlar `01.png, 02.png…` tartibida.
Caption va heshteglar — [content-plan.md](content-plan.md) §3 (shu raqam bilan). Joylash **9 dan 1 ga**: eng yangisi to'rda birinchi turadi.

| Tartib | Post | Format | Fayllar |
|---|---|---|---|
| 1-chi joylanadi | 9 · Ombor va filiallar | Karusel, 8 slayd | `posts/9-ombor-filiallar/01–08.png` |
| 2 | 8 · 2027 nasiya qoidalari | Karusel, 8 | `posts/8-nasiya-2027-qoidalar/` |
| 3 | 7 · Komissiya emas, foyda | Karusel, 6 | `posts/7-komissiya-emas-foyda/` |
| 4 | 6 · Nasiya 2 daqiqada | Reels **yoki** rasm | video yo'q — `rasm-varianti.png` ni rasm qilib qo'ying; ekran yozuvi tayyor bo'lsa — reels, muqova `muqova.png` |
| 5 | 5 · Telegram eslatma | Rasm | `posts/5-telegram-eslatma/01.png` |
| 6 | 4 · Daftar va Savora | Karusel, 6 | `posts/4-daftar-vs-savora/` |
| 7 | 3 · 14 kun bepul | Rasm | `posts/3-14-kun-bepul/01.png` |
| 8 | 2 · Nasiya 4 qadam | Karusel, 7 | `posts/2-nasiya-4-qadam/` |
| 9-chi joylanadi | 1 · Bitta ilovada | Reels | video `marketing/video/savora-reel-01/renders/savora-reel-01.mp4`, muqova `posts/1-bitta-ilova/muqova.png` (video bo'lmasa — `rasm-varianti.png`) |

So'ng 3 → 2 → 1 tartibida mahkamlang (Post ··· → «Profilga mahkamlash»).

- **6-post «2 daqiqada»**: reels qilsangiz, ekran yozuvi tezlashtirilmagan bo'lsin; 2 daqiqadan oshsa sarlavhani «bir necha daqiqada» ga almashtiring (`src/posts.data.mjs`, keyin qayta render).
- Narxli postlar (7, tariflar story'si): joylashdan oldin savora.uz «Tariflar» bilan solishtiring — narxlar super-admin'da o'zgarishi mumkin.
- Demo ekranlardagi ism va summalar to'qima — har birida «Demo ma'lumot» yozuvi bor, olib tashlamang.
- Da'volar: faqat ishlab turgan funksiya. Mijozga avtomatik SMS eslatma yo'q; nasiya va AI faqat Pro/Biznes'da.
- Keyingi postlar: fon Tun ↔ Ko'k navbatlashsin (to'r shaxmat bo'lib qoladi); 30 kunlik kalendar — content-plan.md §5.
