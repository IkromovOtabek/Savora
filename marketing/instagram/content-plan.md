# Savora — Instagram kontent rejasi (@savora__uz)

Profil: **Savora · Nasiya dasturi**. Maqsad — do'kon egasiga «nasiya, ombor, kassa bitta joyda» degan fikrni ishonchli yetkazish va biodagi havola orqali 14 kunlik bepul sinovga olib kelish.

Ohang: rasmiy, xotirjam, bank/fintech darajasida. Kreativlik — tasvir va birinchi qatorda, va'dalarda emas. Murojaat — «Siz».

**Qat'iy qoidalar (har bir post va story uchun):**
- Faqat kodda bor funksiya aytiladi (pastdagi «Tekshirilgan faktlar» bo'limiga qarang).
- Mijozga **avtomatik** SMS eslatma yo'q. To'g'ri ifoda: «muddati o'tganlar har kuni egaga Telegram'da keladi, mijozga eslatma — bir tugmada, o'z telefoningizdan (WhatsApp, Telegram yoki SMS)».
- Shartnoma PDF va SMS-kod bilan imzolash — **yo'q**, tilga olinmaydi.
- iPhone ilovasi — **TestFlight orqali beta**; Android — **savora.uz dan APK** (Play Market emas).
- Soxta mijoz, soxta sharh, soxta statistika yo'q. Raqam kerak bo'lsa — «Misol» yorlig'i bilan hisob-kitob; ekran rasmi kerak bo'lsa — «Demo ma'lumot» yorlig'i bilan demo do'kon.
- Raqobatchi nomi aytilmaydi («hamkor BNPL xizmati» deyiladi).
- PQ-294 haqida faqat landing darajasida va har safar «yuridik maslahat emas» izohi bilan.
- 14 kunlik sinov — **faqat sayt orqali** (biodagi havola). Mobil ilovadan ro'yxatdan o'tganda bepul tarif ochiladi, sinov emas — shuning uchun chaqiriq doim «Biodagi havola orqali 14 kun bepul».

---

## 1. Kontent ustunlari

| № | Ustun | Ulush | Nima haqida | Misol mavzular |
|---|---|---|---|---|
| 1 | **Nasiya va qarz nazorati** | 30% | Do'kon egasining asosiy og'rig'i: kim qancha qarz, kim kechikdi, pul qachon keladi | Nasiya 4 qadamda, kechikkanlar Telegram'da, eslatma bir tugmada, daftar va Savora farqi |
| 2 | **Mahsulot ichidan** | 25% | Savora qanday ishlaydi: ombor, kassa, filiallar, mobil ilova, qisqa darslar | Nasiya 2 daqiqada, IMEI va qora ro'yxat, Excel'dan import, kunlik yakun |
| 3 | **Do'kon egasi uchun bilim** | 20% | Foydali hisob-kitob va qoidalar — sotmasdan foyda berish | 2027 nasiya qoidalari, misol hisob (komissiya va o'z nasiyangiz), yil yakuni inventarizatsiyasi |
| 4 | **Ishonch va shaffoflik** | 15% | Xavfsizlik, ma'lumot egaligi, qo'llab-quvvatlash, halol cheklovlar | Ma'lumotingiz xavfsizmi, Savora kredit bermaydi, ko'chirishda bepul yordam |
| 5 | **Taklif va harakat** | 10% | Sinov, tariflar, demo | 14 kun bepul, tariflar, 10 daqiqalik onlayn demo |

Format ulushi (oyiga): reels — 40%, karusel — 45%, yakka rasm — 15%.

---

## 2. Dizayn shabloni (dizayner uchun)

**Kanvas:** 1080×1350 (4:5). Profil to'ri 3:4 ko'rsatadi — chap va o'ng chetdan ~34 px qirqiladi. **Matn va logo chetlardan kamida 96 px ichkarida.**
**Reels muqovasi:** 1080×1920; sarlavha markaziy 1080×1350 zonada (yuqoridan 285 px, pastdan 285 px bo'sh), to'rda shu qism ko'rinadi.

**Ikki fon (navbatlashadi):**
- **«Tun»** — tik gradient `#0A1530 → #13254D`, yuqori o'ng burchakda `#1A5FE0` yumshoq radial nur (20% shaffof).
- **«Ko'k»** — 135° gradient `#2CC3FF → #1F5BE6`, o'ng pastda lenta-S logoning katta konturi (6% oq, suv belgisi).

**Oltin `#FFA800`** — faqat pul summasi, «0 so'm», nasiya to'lovi holati. Bir postda ko'pi bilan 1–2 oltin urg'u.
Holat ranglari (faqat demo ekranlarida): to'landi — `#12B76A`, kechikkan — `#F04438`.

**Joylashuv (barcha postlarda bir xil):**
- Yuqori chap: lenta-S logo 56 px + «Savora» (Montserrat Bold 30 px, oq).
- Yuqori o'ng: ustun kapsulasi — «NASIYA», «OMBOR», «KASSA», «BILIM», «TAKLIF» (Onest SemiBold 24 px, harf oralig'i 2 px, oq 12% fon, to'liq yumaloq).
- Sarlavha: Montserrat ExtraBold 92–104 px, qator oralig'i 1.05, oq, chapga tekis, y ≈ 240–620 px.
- Kichik matn: Onest Regular 38 px, oq 80%, ko'pi bilan 2 qator.
- Vizual element: pastki ~45%.
- Pastki chiziq: «savora.uz» (Onest Medium 26 px, oq 70%), chapda.
- Demo ekran bo'lsa — burchakda kichik «Demo ma'lumot» yorlig'i (Onest 20 px, oq 60%).

**Profil to'ri (3 × 3) — shaxmat tartibi:**

```
┌─────────┬─────────┬─────────┐
│ 1  Tun  │ 2  Ko'k │ 3  Tun  │  ← mahkamlangan (pin)
├─────────┼─────────┼─────────┤
│ 4  Ko'k │ 5  Tun  │ 6  Ko'k │
├─────────┼─────────┼─────────┤
│ 7  Tun  │ 8  Ko'k │ 9  Tun  │
└─────────┴─────────┴─────────┘
```

Keyingi postlar uchun qoida: **har yangi postning foni oldingi postnikidan farq qilsin (Tun ↔ Ko'k)** — 3 ustunli to'rda shaxmat tartibi o'z-o'zidan saqlanadi. Ochilishdan keyingi birinchi yangi post — **Tun** (chunki eng yangi mahkamlanmagan post — 4, Ko'k).

---

## 3. Ochilish uchun 9 ta post

**Joylash tartibi:** avval 9 → 8 → 7 → 6 → 5 → 4 (eng eskisi birinchi), keyin 3, 2, 1. So'ng 3, 2, 1 tartibida mahkamlang (oxirgi mahkamlangani birinchi turadi). Joylagach profilni ochib tekshiring; tartib boshqacha chiqsa, mahkamlashni olib, qayta qo'ying.

---

### Post 1 — mahkamlangan · Reels · fon «Tun»

**Sarlavha (muqovada):** Nasiya, ombor, kassa — bitta ilovada
**Kichik matn:** Daftar va Excel o'rniga — do'koningizning to'liq hisobi bitta tizimda
**Ustun:** Mahsulot ichidan

**Vizual g'oya:** «Tun» fon. Markazda telefon maketi — Savora mobil bosh sahifasi («Bugungi tushum», demo do'kon «Mobi Market»). Telefon atrofida uchta suzuvchi kapsula: «Nasiya» (oltin nuqta bilan), «Ombor», «Kassa» (ko'k chegara). Video lenta-S logoning «Chiziq» animatsiyasi bilan ochiladi. Asos — `marketing/video/savora-reel-01` loyihasi (joylashdan oldin undagi da'volarni shu reja bilan solishtiring).

**Ssenariy (20–25 s, 9:16):** 0–2 s — ilmoq: daftar sahifalari tez varaqlanadi, ustida «Kim qancha qarz?» → 2–8 s — nasiya jadvali ekrani → 8–13 s — ombor qoldig'i → 13–18 s — kassa, chek → 18–22 s — «14 kun bepul · biodagi havola».

**Caption:**
```
Daftar, Excel, kalkulyator va xotira — ko'p do'konda hisob shu to'rt joyga bo'lingan. Natijada kim qancha qarz, omborda nima qolgani va bugungi tushum aniq bilinmaydi.

Savora — O'zbekiston do'konlari uchun savdo tizimi:
• nasiya jadvali va har bir to'lov nazorati;
• ombor: kirim, qoldiq, inventarizatsiya;
• kassa: skaner, aralash to'lov, chek;
• bir nechta filial va xodim huquqlari — bitta ekranda.

Telefon, planshet va kompyuterda ishlaydi.

👉 Biodagi havola orqali 14 kun bepul sinab ko'ring. Karta talab qilinmaydi.
```
**Heshteglar:** #savora #dokon #dokonegasi #nasiya #ombor #kassa #savdo #ozbekiston

---

### Post 2 — mahkamlangan · Karusel (7 slayd) · fon «Ko'k»

**Sarlavha:** Nasiya: sotuvdan undirishgacha 4 qadam
**Kichik matn:** Daftarsiz va qo'lda hisobsiz: har nasiya jadvalda, har to'lov nazoratda
**Ustun:** Nasiya va qarz nazorati

**Vizual g'oya:** «Ko'k» fon. Pastki qismda to'rtta raqamli doira (1→2→3→4), ingichka oq chiziq bilan ulangan; 1–3 doiralar oq kontur, 4-doira oltin (pul keladi). Har doira ostida bir so'z: «Tovar», «Jadval», «Mijoz», «To'lov».
Slaydlar (har biri bitta fon, chapda katta raqam, o'ngda ekran parchasi):
2 — Tovarni tanlang: skaner yoki qidiruv, miqdor, chegirma.
3 — Jadval tayyor: boshlang'ich to'lov va muddat → oylik to'lov va sanalar darhol.
4 — Mijoz kartasi: jadval va har bir to'lov bitta joyda.
5 — Nazorat: qisman va muddatidan oldin to'lov; qarzlar «Muddati o'tgan / Yaqin (7 kun) / Muddatida» guruhlarida.
6 — Kechikkanlar har kuni Telegram'da + «Eslatma» tugmasi (WhatsApp, Telegram, SMS menyusi).
7 — Chaqiriq: «14 kun bepul · biodagi havola».

**Caption:**
```
Nasiya sotuvi uchun daftar va kalkulyator shart emas.

Savora'da jarayon to'rt qadam:
1 — Tovarni tanlang: skaner yoki qidiruv orqali, miqdor va chegirma bilan.
2 — Boshlang'ich to'lov va muddatni kiriting: oylik to'lov va sanalar darhol hisoblanadi.
3 — Mijoz kartasi: jadval va har bir to'lov bitta joyda — kim qancha qarz, qachon to'laydi.
4 — Nazorat: qisman va muddatidan oldin to'lov qabul qilinadi, muddati o'tganlar har kuni Telegram'ingizga keladi.

Mijozga eslatmani esa bir tugma bilan o'z telefoningizdan yuborasiz — WhatsApp, Telegram yoki SMS orqali.

Saqlab qo'ying: xodimlaringizga tushuntirishda asqotadi.

👉 Biodagi havola orqali 14 kun bepul — nasiya moduli bilan.
```
**Heshteglar:** #nasiya #nasiyadasturi #bolibtolash #qarznazorati #dokonegasi #savora #tadbirkor

---

### Post 3 — mahkamlangan · Rasm · fon «Tun»

**Sarlavha:** 14 kun bepul sinab ko'ring
**Kichik matn:** Karta talab qilinmaydi. Sinov tugagach hech narsa avtomatik yechilmaydi.
**Ustun:** Taklif va harakat

**Vizual g'oya:** «Tun» fon. Chap-markazda ulkan «14» (Montserrat Black ~520 px), harflar ichi ko'k gradient `#2CC3FF → #1F5BE6`; ostida «kun bepul» (oq, 72 px). O'ng yuqorida kichik oltin kapsula «0 so'm». Pastda uchta oq chiziqli ikonka qatorda: kalendar — «14 kun», ustidan chizilgan karta — «Kartasiz», qalqon — «Ma'lumot saqlanadi». Eng pastda: «Biodagi havola → savora.uz».

**Caption:**
```
Yangi tizimga o'tishdan oldin uni o'z do'koningizda sinab ko'rish — to'g'ri qaror.

Savora'da:
• 14 kun barcha imkoniyatlar bepul (ro'yxatdan o'tishda Pro tarifi tanlangan bo'ladi — nasiya va AI yordamchi bilan);
• karta so'ralmaydi;
• sinov tugagach hech narsa avtomatik yechilmaydi — tarifni o'zingiz tanlaysiz, ma'lumotlaringiz saqlanib turadi;
• Excel yoki daftardagi tovar va qarz ro'yxatini ko'chirishda bepul yordam beramiz.

👉 Biodagi havola orqali 14 kun bepul boshlang.
```
**Heshteglar:** #savora #bepulsinov #dokon #dokonegasi #nasiyadasturi #savdo #ozbekiston

---

### Post 4 · Karusel (6 slayd) · fon «Ko'k»

**Sarlavha:** Daftar yo'qolsa, qarz ham yo'qoladi
**Kichik matn:** Daftar, Excel va Savora: olti farq bitta jadvalda
**Ustun:** Nasiya va qarz nazorati

**Vizual g'oya:** «Ko'k» fon. Chap pastda biroz qiyshaygan eski katak daftar sahifasi (qo'lda yozilgan, xira, o'qib bo'lmaydigan ismlar va summalar — to'qima), sahifa burchagi yirtilgan. O'ng tomonda uning ustiga chiqib turgan telefon — Savora mijoz kartasi (jadval, «To'landi» yashil, «Kutilmoqda» kulrang). Burchakda «Demo ma'lumot».
Slaydlar: 2 — og'riq (uch qator: «Kim, qachon, qancha to'lashi esdan chiqadi», «Kechikish faqat oy oxirida bilinadi», «Daftar yo'qolsa — qarz ham yo'qoladi»); 3–4 — taqqoslash jadvali, 6 qator, ustunlar «Daftar / Excel» — «Yo'q», «Savora» — «Bor» (ko'k belgi); 5 — «Eski yozuvlarni ko'chirishda bepul yordam»; 6 — chaqiriq.

**Caption:**
```
«Kim, qachon, qancha to'lashi kerak edi?» — daftar bilan ishlaydigan do'konda bu savol odatda oy oxirida paydo bo'ladi.

Daftar va Excel'da:
— to'lov kuni esdan chiqadi;
— kechikish kech bilinadi;
— daftar yo'qolsa, qarz ham yo'qoladi.

Savora'da:
— nasiya jadvali va hisob-kitob avtomatik;
— kechikkan to'lovlar har kuni Telegram'da;
— IMEI va ombor nazorati;
— bir nechta filial bitta ekranda;
— xodimlarga alohida huquqlar;
— telefondan istalgan joyda.

Eski yozuvlarni ko'chirishda jamoamiz bepul yordam beradi.

👉 Biodagi havola orqali 14 kun bepul.
```
**Heshteglar:** #qarzdaftari #nasiya #dokonegasi #savdo #savora #tadbirkor #ozbekiston

---

### Post 5 · Rasm · fon «Tun» (to'r markazi)

**Sarlavha:** Kim kechikdi — har kuni Telegram'da
**Kichik matn:** Muddati o'tgan nasiyalar egaga keladi; mijozga eslatma — bir tugmada.
**Ustun:** Nasiya va qarz nazorati

**Vizual g'oya:** «Tun» fon. Markazda telefon maketi, ekranda Telegram chati — Savora botidan xabar (koddagi haqiqiy format):
```
⏰ Nasiya to'lov muddati o'tdi
Mahsulot: Redmi 13C
Mijoz: Umid X.
Muddati o'tgan: 1 oy — 850 000 so'm
Eng erta muddat: 12.11.2026
Umumiy qoldiq: 2 550 000 so'm
```
Summalar oltin, qolgani oq. Telefon ostida ikkinchi, xiraroq xabar (ro'yxat davom etayotgani hissi). Burchakda «Demo ma'lumot».

**Caption:**
```
Kechikkan to'lovni oy oxirida emas, ertasigayoq bilsangiz — mijoz bilan gaplashish ancha oson.

Savora har kuni muddati o'tgan nasiyalarni tekshiradi va do'kon egasining Telegram'iga xabar yuboradi: mahsulot, mijoz va uning telefoni, necha oy kechikkani, summa va umumiy qoldiq.

Mijozga eslatma esa qarzdorlik sahifasidagi «Eslatma» tugmasi orqali — tayyor matn bilan, o'z telefoningizdan: WhatsApp, Telegram yoki SMS. Muloyim va o'z vaqtida.

Xabarlar kelishi uchun sozlamalarda do'koningiz Telegram'ini ulaysiz.

👉 Biodagi havola orqali 14 kun bepul.
```
**Heshteglar:** #nasiya #qarznazorati #dokonegasi #savora #nasiyadasturi #tadbirkor

---

### Post 6 · Reels (25–30 s) · fon «Ko'k»

**Sarlavha (muqovada):** Nasiya 2 daqiqada rasmiylashadi
**Kichik matn:** Tovar, boshlang'ich to'lov, muddat — oylik jadval va sanalar darhol tayyor
**Ustun:** Mahsulot ichidan

**Vizual g'oya (muqova):** «Ko'k» fon. Markazda katta sekundomer «2:00» (oq raqamlar, tashqi halqa oltin), ostida noutbuk ekranida tayyor nasiya jadvali (6 oy, sanalar ustuni).
**Video:** demo do'konda haqiqiy ekran yozuvi, **tezlashtirmasdan**. Yuqori o'ng burchakda jonli sekundomer. Qadamlar: skaner → savat → nasiya → boshlang'ich to'lov → muddat → jadval → saqlash. Burchakda «Demo ma'lumot».
⚠️ Ishlab chiqaruvchiga: agar yozuv 2 daqiqadan oshsa, sarlavhani «Nasiya bir necha daqiqada» ga almashtiring — raqam videoda isbotlanishi shart.

**Caption:**
```
Nasiya rasmiylashtirish mijozni uzoq kutdirmasligi kerak.

Videoda — real vaqtda, tezlashtirmasdan: tovar skanerlanadi, boshlang'ich to'lov va muddat tanlanadi, oylik jadval va to'lov sanalari darhol hisoblanadi. Mijoz kartasi shu zahoti tayyor.

Qo'lda hisob-kitob yo'q, kalkulyator yo'q, daftarga ko'chirish yo'q.

Videodagi do'kon va mijoz — demo ma'lumot.

👉 Biodagi havola orqali 14 kun bepul — o'z do'koningizda sinab ko'ring.
```
**Heshteglar:** #nasiya #nasiyadasturi #kassa #dokonegasi #savora #savdo #tadbirkor

---

### Post 7 · Karusel (6 slayd) · fon «Tun»

**Sarlavha:** Komissiya emas, foyda sizda qolsin
**Kichik matn:** Misol: 10 mln so'mlik telefon, 12 oyga — uch yo'l taqqoslandi
**Ustun:** Do'kon egasi uchun bilim

**Vizual g'oya:** «Tun» fon. Yuqori chapda «MISOL» yorlig'i (oq kontur kapsula). Pastda uchta tik ustun-karta yonma-yon:
- «Daftar / Excel» — «0 so'm» (oq) · «dastur xarajati»;
- «Hamkor BNPL» — «−3 000 000 so'm» (oq, minus bilan) · «≈30% komissiya, 12 oy»;
- «O'z nasiyangiz + Savora» — «649 000 so'm» (oltin) · «oyiga, savdodan foiz yo'q» — bu karta ko'k gradient chegara bilan ajratilgan va biroz balandroq.
Eng pastda mayda izoh: «Misol. BNPL komissiyasi taxminiy, ochiq manbalardagi do'kon tariflari asosida».
Slaydlar: 2–4 — har yo'l alohida (afzallik va kamchilik); 5 — «Halol eslatma: o'z nasiyangizda kechikish xavfi do'konda qoladi — Savora shu xavfni nazorat qilishga yordam beradi»; 6 — chaqiriq.

**Caption:**
```
Misol hisob: 10 000 000 so'mlik telefon, 12 oyga nasiya. Do'konga nima qoladi?

1) Daftar yoki Excel — dastur xarajati 0 so'm. Lekin to'lov kunlari esdan chiqadi, kechikish kech bilinadi, daftar yo'qolsa qarz ham yo'qoladi.

2) Hamkor BNPL xizmati — pul darhol tushadi, xavf hamkorda. Biroq do'kon komissiyasi 12 oyga taxminan 30%: ≈3 000 000 so'm. Mijoz esa hamkorning mijoziga aylanadi.

3) O'z nasiyangiz + Savora — oyiga 649 000 so'm (Pro tarifi), barcha sotuvlar uchun, savdodan foiz olinmaydi. Narx va ustama sizniki — 2027-yil chegaralari ichida.

Halol eslatma: o'z nasiyangizda kechikish xavfi va aylanma mablag' do'konda qoladi. Savora aynan shuni nazorat qilishga yordam beradi: jadval, kechikkanlar ro'yxati, eslatma.

Izoh: BNPL komissiyasi ochiq manbalardagi do'kon tariflari asosida taxminiy, hamkor va kelishuvga qarab farq qiladi.

👉 Biodagi havola orqali 14 kun bepul.
```
**Heshteglar:** #nasiya #bolibtolash #dokonegasi #tadbirkor #biznes #savora #moliya

---

### Post 8 · Karusel (8 slayd) · fon «Ko'k»

**Sarlavha:** 2027-yildan nasiyada yangi qoidalar
**Kichik matn:** PQ-294 qarori: muddat, summa va ustama chegaralari — oddiy tilda
**Ustun:** Do'kon egasi uchun bilim

**Vizual g'oya:** «Ko'k» fon. O'ng tomonda yirtma kalendar varag'i: «1-YANVAR / 2027» (oq qog'oz, ko'k matn). Chapda 2×2 kichik kartalar: «12 oy», «250 BHM», «50%», «0 so'm» (oxirgisi oltin).
Slaydlar: 2 — «12 oy · eng uzun muddat»; 3 — «250 BHM · bitta xarid, ≈110 mln so'm»; 4 — «50% · yiliga: ustama + komissiya + penya»; 5 — «0 so'm · muddatidan oldin yopishda jarima»; 6 — «500 mln / 50% · reyestr talabi bo'lishi mumkin»; 7 — «Savora'da hozir bor» (uch band, pastda); 8 — manba, «Bu yuridik maslahat emas», chaqiriq.

**Caption:**
```
1-yanvar 2027 dan nasiya savdosi uchun aniq chegaralar kuchga kiradi (Prezident qarori PQ-294, 14.08.2026).

Asosiylari:
• eng uzun muddat — 12 oy;
• bitta xarid — 250 BHM gacha (≈110 mln so'm);
• ustama + komissiya + penya — yiliga 50% dan oshmasligi kerak;
• muddatidan oldin yopishda jarima — 0 so'm.

Choraklik aylanmasi 500 mln so'mdan oshgan va savdosining yarmi yoki ko'prog'i nasiya bo'lgan do'konlar Markaziy bank reyestriga kirishi, mijozni raqamli identifikatsiya qilishi va kredit byurosiga ma'lumot berishi kerak bo'lishi mumkin.

Savora'da hozir bor:
• har nasiya jadvali, to'lovi va qoldig'i bitta joyda — tekshiruvga tayyor tarix;
• kechikkan to'lovlar har kuni Telegram'da;
• har xodim amali jurnalda: kim sotdi, kim chegirma berdi, kim bekor qildi.

Manba: PQ-294, 14.08.2026 (lex.uz); gazeta.uz, 17.08.2026. Bu yuridik maslahat emas — aniq holatingizni buxgalter yoki yurist bilan tekshiring.

👉 Biodagi havola orqali 14 kun bepul.
```
**Heshteglar:** #nasiya #nasiya2027 #pq294 #dokonegasi #tadbirkor #savora #ozbekiston

---

### Post 9 · Karusel (8 slayd) · fon «Tun»

**Sarlavha:** Ombor va filiallar — bitta ekranda
**Kichik matn:** Kirim, qoldiq, IMEI, inventarizatsiya va xodim huquqlari — hammasi nazoratda
**Ustun:** Mahsulot ichidan

**Vizual g'oya:** «Tun» fon. Pastki qismda noutbuk ekrani — ombor ro'yxati («Ombor — 1 248 mahsulot», ustunlar: Mahsulot, Narx, Holat). Ekran ustida uchta suzuvchi holat kapsulasi: «Omborda» (yashil nuqta), «Sotilgan» (kulrang), «Filialga» (ko'k). Burchakda «Demo ma'lumot».
Slaydlar: 2 — kirim, qoldiq, kam qolgan tovarlar hisoboti; 3 — IMEI va umumiy qora ro'yxat; 4 — filiallar o'rtasida tovar berish, har filial kassasi, umumiy hisobot; 5 — inventarizatsiya va CSV eksport; 6 — xodim huquqlari (kapsulalar: Sotish, Chegirma, Bekor qilish, Kelish narxi, Hisobot) va amallar jurnali; 7 — Excel'dan import (.xlsx / .csv, bir martada 5000 tagacha qator); 8 — chaqiriq.

**Caption:**
```
Omborda nechta tovar qolgani, qaysi telefon qaysi filialda ekani, kim narxni o'zgartirgani — bularni eslab yurish shart emas.

Savora'da:
• kirim, qoldiq va kam qolgan tovarlar hisoboti;
• telefonlar IMEI bo'yicha, umumiy qora ro'yxat bilan;
• filiallar o'rtasida tovar berish, har filial kassasi va umumiy hisobot;
• inventarizatsiya va CSV eksport;
• xodim huquqlari: kim narxni o'zgartiradi, kim sotuvni bekor qiladi, kim kelish narxini ko'radi — o'zingiz belgilaysiz;
• Excel'dan import: .xlsx yoki .csv, bir martada 5000 tagacha qator, ustunlar nomidan o'zi taniladi.

Filiallar soni tarifga bog'liq: Boshlang'ich — 1, Pro — 5, Biznes — cheksiz.

👉 Biodagi havola orqali 14 kun bepul.
```
**Heshteglar:** #ombor #inventarizatsiya #filial #telefondokoni #dokonegasi #savora #savdo

---

## 4. Highlight story kadrlari (1080×1920)

Story shabloni: «Tun» fon, yuqorida highlight nomi (kapsula), sarlavha Montserrat ExtraBold 84 px, matn Onest 40 px, pastda stiker. Matn yuqori 250 px va pastki 340 px ga tushmasin (Instagram tugmalari).

### Nasiya
1. **Nasiya — daftarsiz** · «Tovar, boshlang'ich to'lov va muddat — oylik to'lov va sanalar darhol hisoblanadi.» · Stiker: havola «savora.uz».
2. **Har to'lov nazoratda** · «Qisman va muddatidan oldin to'lov. Qarzlar guruhlarda: muddati o'tgan, 7 kun ichida, muddatida.» · Vizual: qarzdorlik sahifasi (demo).
3. **Kim kechikdi — har kuni Telegram'da** · «Egaga xabar keladi. Mijozga eslatma — bir tugmada, o'z telefoningizdan: WhatsApp, Telegram yoki SMS.» · Stiker-so'rovnoma: «Nasiyani hozir qayerda yuritasiz?» — «Daftar» / «Excel».

### Ombor
1. **Qoldiq doim aniq** · «Kirim, qoldiq, inventarizatsiya. Kam qolgan tovarlar hisobotda ko'rinadi.»
2. **Telefon do'koni? IMEI bilan** · «Har telefon IMEI bo'yicha. Qarzdor yoki shubhali IMEI qora ro'yxatga qo'shilsa, boshqa do'konlar ham ogohlantiriladi.»
3. **Excel'dan import** · «.xlsx yoki .csv, bir martada 5000 tagacha qator, ustunlar nomidan o'zi taniladi. Eski .xls bo'lsa — Excel'da .xlsx qilib saqlang.» · Stiker: «Ko'chirishda bepul yordam — Direct'ga yozing».

### Kassa
1. **Tez kassa** · «Skaner, savat, aralash to'lov va chek.»
2. **Smena va kassa qoldig'i** · «Smenani oching va yoping — naqd va boshqa kassalar qoldig'i bitta ekranda.»
3. **Kun yakuni — Telegram'da** · «Sozlamalarda «Kunlik yakun»ni yoqing: har kuni 21:00 da sotuvlar, qarzga berilganlar, xarajatlar va yopilmagan smenalar.»

### Ilova
1. **Savora telefoningizda** · «Sotuv, mahsulotlar, nasiya, kirim-chiqim, kamera bilan shtrix-kod. Internet uzilsa ham naqd sotuv saqlanadi va keyin yuboriladi.»
2. **Android** · «savora.uz → «Mobil ilova» → APK yuklab oling. Telefon birinchi marta noma'lum manbadan o'rnatishga ruxsat so'raydi.»
3. **iPhone — beta** · «Hozircha TestFlight orqali: avval App Store'dan TestFlight'ni o'rnating, so'ng saytdagi havolani oching. 14 kunlik sinov uchun avval savora.uz da ro'yxatdan o'ting, ilovaga shu login bilan kirasiz.»

### Aloqa
1. **Savolingiz bormi?** · «Direct'ga yozing yoki Telegram: [Telegram manzili — tasdiqlang]. Email: support@savora.uz. Dushanba–shanba, [ish vaqti — tasdiqlang].» · Stiker: havola «savora.uz/contact».
2. **Bepul demo va ko'chirish** · «10 daqiqalik onlayn demo — vaqtni Telegram orqali belgilang. Excel yoki daftardagi tovar va qarz ro'yxatini ko'chirishda bepul yordam beramiz.»

> Kvadrat qavsdagi joylarni joylashdan oldin haqiqiy ma'lumot bilan to'ldiring: saytdagi telefon va ish vaqti hozircha vaqtinchalik (`README.md`, 3-bo'lim).

### Tariflar
1. **Har tarif — 14 kun bepul** · «Karta talab qilinmaydi. Sinov tugagach hech narsa avtomatik yechilmaydi, ma'lumotlar saqlanadi.»
2. **Tariflar, oyiga** · «Boshlang'ich — 249 000 so'm: 1 filial, 3 xodim, 500 mahsulot. Pro — 649 000 so'm: 5 filial, 15 xodim, 5000 mahsulot, nasiya va AI. Biznes — 1 290 000 so'm: cheksiz filial, xodim, mahsulot va shaxsiy yordam.» (narxlar oltin)
3. **Savdodan foiz olmaymiz** · «Faqat oylik obuna. Nasiyani do'kon o'zi beradi, to'lov to'g'ridan-to'g'ri do'konga tushadi.» · Stiker: havola «14 kun bepul».

> «Fikrlar» highlight — faqat birinchi haqiqiy mijoz fikri (uning roziligi bilan) kelgach ochiladi. «AI» va «Darslar» — 30 kunlik kalendardagi story'lardan to'ldiriladi.

---

## 5. 30 kunlik kontent kalendari

**Kun 0 (19–22-noyabr):** 9 ta ochilish posti (3-bo'lim tartibida), 6 ta highlight uchun story'lar, bio havolasi va Direct sozlamalari.

Post kunlari: 1–2-haftada dushanba, chorshanba (yoki seshanba), juma, shanba; 3–4-haftada dushanba, chorshanba, juma. Story — har kuni 2–4 kadr. Postlar foni Tun ↔ Ko'k navbatlashadi.

| Kun | Sana | Kun nomi | Post (format · mavzu · fon) | Story (mavzu → highlight) |
|---|---|---|---|---|
| 1 | 23.11 | Dushanba | **Reels** · «Bugun kim to'lashi kerak?» — daftar varaqlash va Savora qarzdorlik sahifasi · Tun | Hafta savoli: «Nasiyada eng qiyini nima?» (so'rovnoma) |
| 2 | 24.11 | Seshanba | — | Dars: ro'yxatdan o'tish va soha tanlash (ekran yozuvi) → Darslar |
| 3 | 25.11 | Chorshanba | **Karusel** · «Excel'dan omborga: 3 qadam» — namuna fayl, ustunlarni moslash, natija · Ko'k | Postni ulashish + savol stikeri «Tovarlaringiz hozir qayerda: Excel'dami, daftardami?» |
| 4 | 26.11 | Payshanba | — | Demo ekran: Excel import natijasi («Qo'shildi / To'ldirildi / O'tkazildi») → Ombor |
| 5 | 27.11 | Juma | **Reels** · «Eslatma o'z raqamingizdan» — «Eslatma» tugmasi → WhatsApp tayyor matn bilan · Tun | Nasiya maslahati: eslatmani to'lov kunidan oldin muloyim ohangda yuboring → Nasiya |
| 6 | 28.11 | Shanba | **Karusel** · «Kim narxni o'zgartiradi?» — xodim huquqlari va amallar jurnali · Ko'k | So'rovnoma: «Xodimlaringiz chegirma bera oladimi?» Ha / Yo'q |
| 7 | 29.11 | Yakshanba | — | Hafta xulosasi (3 ta post muqovasi) + havola «14 kun bepul» |
| 8 | 30.11 | Dushanba | **Karusel** · «AI yordamchiga 3 savol» — ega, direktor, xodim misollari (Pro va Biznes) · Tun | AI javob ekrani (demo) → AI |
| 9 | 01.12 | Seshanba | **Rasm** · «2027-yilgacha 31 kun» — 4 ta chegara, Post 8 ga ishora · Ko'k | Dars: Telegram'ni ulash (kechikkanlar xabari uchun) → Darslar |
| 10 | 02.12 | Chorshanba | — | Savol-javob stikeri: «2027 qoidalari bo'yicha savolingiz?» |
| 11 | 03.12 | Payshanba | — | Savol-javob stikeriga javoblar (landing darajasida, «yuridik maslahat emas» izohi bilan) |
| 12 | 04.12 | Juma | **Reels** · «IMEI: telefonni qabul qilishdan oldin» — ko'p IMEI qidiruv va qora ro'yxat ogohlantirishi · Tun | Demo ekran: «Qora ro'yxat ogohlantirishi» → Ombor |
| 13 | 05.12 | Shanba | **Karusel** · «Ko'p filial — bitta ekranda» — tovar berish, filial kassasi, umumiy hisobot · Ko'k | So'rovnoma: «Nechta filialingiz bor?» 1 / 2 va undan ko'p |
| 14 | 06.12 | Yakshanba | — | Hafta xulosasi + havola «14 kun bepul» |
| 15 | 07.12 | Dushanba | **Karusel** · «Ma'lumotingiz xavfsizmi?» — alohida baza, zaxira nusxa, huquqlar, eksport · Tun | Hafta savoli: «Hisobni kim yuritadi: o'zingizmi, xodimmi?» |
| 16 | 08.12 | Seshanba | — | Konstitutsiya kuni bilan tabrik (rasmiy, bir kadr) + dars: qisman to'lovni qabul qilish → Darslar |
| 17 | 09.12 | Chorshanba | **Reels** · «Savora telefoningizda» — mobil sotuv, skaner, internetsiz naqd sotuv · Ko'k | Yuklab olish yo'riqnomasi (Android APK, iPhone beta) → Ilova |
| 18 | 10.12 | Payshanba | — | Demo ekran: mobil nasiya ro'yxati → Ilova |
| 19 | 11.12 | Juma | **Karusel** · «Yil yakuni inventarizatsiyasi: 5 qadam» — amaliy yo'riqnoma + Savora'da inventarizatsiya · Tun | Nasiya maslahati: yil oxirigacha kechikkanlar bilan uchrashuv rejasi → Nasiya |
| 20 | 12.12 | Shanba | — | So'rovnoma: «Inventarizatsiyani qachon qilasiz?» Yil oxirida / Har oy |
| 21 | 13.12 | Yakshanba | — | Hafta xulosasi + havola «14 kun bepul» |
| 22 | 14.12 | Dushanba | **Reels** · «Kun yakuni soat 21:00 da» — «Kunlik yakun» Telegram xabari · Ko'k | Dars: «Kunlik yakun»ni yoqish → Kassa |
| 23 | 15.12 | Seshanba | — | Dars: Excel namuna faylini to'ldirish → Darslar |
| 24 | 16.12 | Chorshanba | **Karusel** · «Eng ko'p beriladigan 5 savol» — kredit beradimi, sinovdan keyin pul yechiladimi, telefonda ishlaydimi, ko'chirish, xavfsizlik · Tun | Savol-javob stikeri: «Savora haqida nimani bilmoqchisiz?» |
| 25 | 17.12 | Payshanba | — | Savol-javobga javoblar (2–3 kadr) |
| 26 | 18.12 | Juma | **Reels** · «13 yo'nalish — sohangizga moslab» — soha tanlanganda menyu va atamalar o'zgaradi · Ko'k | Soha kartalari karuseli (telefon, mebel, kiyim, dorixona…) |
| 27 | 19.12 | Shanba | — | Demo taklifi: «10 daqiqalik onlayn demo» → Aloqa |
| 28 | 20.12 | Yakshanba | — | Hafta xulosasi + havola «14 kun bepul» |
| 29 | 21.12 | Dushanba | **Rasm** · «Tariflar: o'zingizga mosini tanlang» — uch tarif, 14 kun bepul · Tun | Tariflar story'lari qayta → Tariflar |
| 30 | 22.12 | Seshanba | — | Oy xulosasi: eng ko'p saqlangan post + havola; keyingi oy uchun so'rovnoma «Qaysi mavzu kerak?» |

Jami: 15 post (6 reels, 7 karusel, 2 rasm) + har kuni story.

---

## 6. Direct

### Tezkor javob (birinchi xabarga)
```
Assalomu alaykum! Savora'ga yozganingiz uchun rahmat.
Mutaxassisimiz ish vaqtida tez orada javob beradi.
Shu orada: savora.uz — 14 kun bepul, karta talab qilinmaydi.
Do'koningiz qaysi sohada? Shunga qarab mos sozlamani aytib beramiz.
```

### Tez-tez beriladigan savollar (4 ta tugma)
1. **Narxi qancha?**
   «Uch tarif bor, oyiga: Boshlang'ich — 249 000 so'm, Pro — 649 000 so'm, Biznes — 1 290 000 so'm. Nasiya moduli va AI yordamchi Pro va Biznes'da. Har biri 14 kun bepul, karta so'ralmaydi.»
2. **Telefonda ishlaydimi?**
   «Ha. Telefon, planshet va kompyuter brauzerida ishlaydi. Android ilovasini savora.uz dan yuklab olasiz, iPhone ilovasi hozircha TestFlight orqali beta.»
3. **Daftar va Excel'dagi ma'lumotni ko'chirsa bo'ladimi?**
   «Ha. Tovarlarni Excel'dan o'zingiz import qilasiz (.xlsx yoki .csv). Tovar va qarzdorlar ro'yxatini ko'chirishda jamoamiz bepul yordam beradi.»
4. **Qanday boshlayman?**
   «Biodagi havola → «Bepul boshlash». Do'kon nomi, soha va login kiritasiz — karta talab qilinmaydi. Sinov tugagach hech narsa avtomatik yechilmaydi.»

### Saqlangan javoblar (5 ta, qisqa kalit so'z bilan)
1. **tarif**
   «Tariflar (oyiga): Boshlang'ich — 249 000 so'm (1 filial, 3 xodim), Pro — 649 000 so'm (5 filial, 15 xodim, nasiya va AI), Biznes — 1 290 000 so'm (cheksiz filial va xodim, shaxsiy yordam). Savdodan foiz olmaymiz — faqat obuna. Har tarif 14 kun bepul.»
2. **eslatma**
   «Muddati o'tgan nasiyalar har kuni do'kon egasining Telegram'iga keladi. Mijozga eslatma esa qarzdorlik sahifasidagi tugma orqali — tayyor matn bilan, o'z telefoningizdan (WhatsApp, Telegram yoki SMS). Savora mijozlaringizga o'zi avtomatik SMS yubormaydi.»
3. **xavfsiz**
   «Har do'kon alohida bazada saqlanadi — boshqa do'kon sizning narx, mijoz va sotuvlaringizni ko'ra olmaydi. Parollar shifrlangan, zaxira nusxa muntazam olinadi, xodim faqat ruxsat berilgan bo'limni ko'radi. Ma'lumot sizniki — istalgan vaqtda eksport qilasiz.»
4. **ilova**
   «Android: savora.uz → «Mobil ilova» → APK. iPhone: hozircha TestFlight orqali beta. 14 kunlik sinovni avval savora.uz da oching, so'ng ilovaga shu login bilan kiring.»
5. **demo**
   «Mamnuniyat bilan ko'rsatamiz: 10 daqiqalik onlayn demo. Sizga qaysi kun va soat qulay? Telefon raqamingizni qoldirsangiz, Telegram orqali bog'lanamiz.»

---

## 7. Reels uchun 5 ta ilmoq (birinchi 2 soniya)

| № | Kadr (0–2 s) | Ekrandagi matn | Ovoz |
|---|---|---|---|
| 1 | Qo'l eski daftarni tez varaqlaydi, sahifalar xira, kamera yaqinlashadi | «Bu daftarda nechta qarz unutilgan?» | «Kim qancha qarz — aniq aytib bera olasizmi?» |
| 2 | Telefon ekranida Telegram bildirishnomasi tushadi: «⏰ Nasiya to'lov muddati o'tdi» | «Kim kechikdi — siz allaqachon bilasiz» | «Kechikkan to'lovni oy oxirida emas, ertasigayoq biling.» |
| 3 | Sekundomer 0:00 dan boshlanadi, qo'l skanerni tovarga tutadi | «Nasiya 2 daqiqada? Tekshiramiz» | «Sekundomer yoqildi — boshladik.» |
| 4 | Kalkulyator ekranida «10 000 000 × 30%» teriladi, natija «3 000 000» oltin rangda yonadi | «Misol: komissiyaga qancha ketadi?» | «Bitta telefondan uch million — kimning cho'ntagiga?» |
| 5 | Kalendar varag'i yirtiladi, ostidan «1-YANVAR 2027» chiqadi | «Nasiyada nima o'zgaradi?» | «1-yanvardan nasiya qoidalari o'zgaradi. To'rt raqamni eslab qoling.» |

---

## 8. Tekshirilgan faktlar

Har bir da'vo kod yoki landing matni bilan tekshirildi (2026-11-18 holati). Fayl yo'llari repo ildizidan.

| Da'vo | Manba |
|---|---|
| Sinov 14 kun, karta talab qilinmaydi | `web/app/page.tsx:26` (`TRIAL_DAYS = 14`), `web/app/actions/register.ts:19`, `web/lib/i18n/dict/landing.ts` → `hero.noCard`, `plans.lead` |
| Sinovdan keyin avtomatik pul yechilmaydi, ma'lumot saqlanadi | `landing.ts:194` (faq «Bepul sinov tugagach…») |
| «14 kun barcha imkoniyatlar bepul», ko'chirishda yordam | `landing.ts` → `cta.lead`, `contact.demo2` |
| Saytda ro'yxatdan o'tishda Pro tanlangan bo'ladi; mobil ilovadan — faqat bepul tarif | `web/app/register/RegisterForm.tsx:31`, `web/app/actions/register.ts:40-45` |
| Nasiya va AI yordamchi — Pro va Biznes tariflarida (Boshlang'ichda yo'q) | `web/lib/features.ts` → `variant`, `nasiya`, `ai` (`defaultByPlan`), `planAllows` |
| Tarif narxlari va chegaralari: 249 000 / 649 000 / 1 290 000 so'm; 1/5/cheksiz filial; 3/15/cheksiz xodim; 500/5000/cheksiz mahsulot | `web/lib/plans.ts` (`DEFAULT_PLAN_PRESETS`); landing'da Boshlang'ich, Pro, Biznes ko'rsatiladi — `web/app/page.tsx:54-58` |
| Savdodan komissiya yo'q, Savora kredit bermaydi | `landing.ts:192`, `why.savora.s` |
| Nasiya 4 qadam: tovar → jadval → mijoz kartasi → nazorat | `landing.ts:49-58` (`flow`) |
| Qisman va muddatidan oldin to'lov, oylik jadval | `landing.ts:117` (`features.nasiya`) |
| Nasiya 2 daqiqada rasmiylashadi | `landing.ts:22, 26-27` (`hero.sub`, `statMin`) — reels'da real vaqtda isbotlanishi kerak |
| Muddati o'tgan nasiyalar har kuni egaga Telegram'da (mahsulot, mijoz, telefon, oylar, summa, qoldiq) | `web/lib/installmentReminders.ts` (kunlik cron, xabar formati 75-81-qatorlar); `landing.ts:80` (PQ yordami — «Bor») |
| Mijozga eslatma bir tugmada: WhatsApp, Telegram, SMS (o'z telefonidan), matnni nusxalash | `web/components/tenant/DebtReminderButton.tsx` (WhatsApp va SMS — tayyor matn bilan; Telegram — chat ochiladi, matn nusxalanadi) |
| Qarzlar guruhlari: muddati o'tgan, yaqin (7 kun), muddatida | `web/lib/i18n/dict/sales.ts:383-388` |
| Daftar va Excel bilan taqqoslash (6 qator) | `landing.ts:148-160` (`compare.rows`) |
| Tez kassa: skaner, savat, aralash to'lov, chek | `landing.ts:121`; `sales.ts:461` (aralash to'lov); `web/components/tenant/PrintReceiptButton.tsx` |
| Smena va kassa qoldiqlari | `web/app/app/shifts`, `web/app/app/kassa`; `landing.ts` → `showcase.kassaTitle` |
| «Kunlik yakun» — har kuni 21:00 da Telegram'ga | `web/lib/shopNotify.ts:127` (`sendDailySummaries`); `web/lib/i18n/dict/shell.ts:346-347` |
| Ombor: kirim, qoldiq, inventarizatsiya, CSV eksport, kam qolgan tovarlar hisoboti | `landing.ts:126-127`; `web/app/app/inventory` |
| IMEI nazorati, umumiy qora ro'yxat, boshqa do'konlar ogohlantiriladi | `landing.ts:122`; `web/lib/imeiBlacklist.ts`; `web/lib/i18n/dict/stock.ts` (`imei`, `blacklist.emptyHint`) |
| Filiallar aro tovar berish, filial kassasi, umumiy hisobot | `landing.ts:125`; `web/app/app/transferred`, `mobile/app/transfer.tsx` |
| Xodim huquqlari (sotish, chegirma, bekor qilish, kelish narxi, hisobot) | `landing.ts:123-124`; `web/lib/permissions.ts` |
| Har xodim amali jurnalda | `landing.ts:81` + `web/app/page.tsx:61` (holat «Bor»); `web/lib/models/tenant/AuditLog.ts` |
| Excel import: .xlsx/.csv, 5000 qatorgacha, ustunlar nomidan taniladi, namuna fayl, .xls o'qilmaydi | `web/lib/i18n/dict/importer.ts:10-31, 46-48`; `web/lib/productImport.ts:36` (`IMPORT_MAX_ROWS = 5000`) |
| Tovar va qarzdorlarni ko'chirishda jamoa bepul yordam beradi (qarzdorlar importi — jamoa orqali) | `landing.ts:198`, `contact.demo2` |
| Xavfsizlik: alohida baza, shifrlangan parollar, zaxira nusxa, eksport | `landing.ts:128, 190` |
| AI yordamchi: ega / direktor / xodim misollari, huquq doirasida; bosqichma-bosqich yoqilmoqda | `landing.ts:137-146` (`ai`, `ai.note`) |
| 13 ta savdo yo'nalishi | `web/lib/businessTypes.ts:8-22` (`BUSINESS_TYPE_IDS`) |
| Telefon, planshet, kompyuter; Telegram mini-ilova orqali parolsiz kirish | `landing.ts:197`; `web/app/tg` |
| Mobil ilova: Android — APK; iPhone — TestFlight beta; saytdagi login | `landing.ts:211-221` (`mobileApp`) |
| Mobil: sotuv, mahsulotlar, nasiya, kirim-chiqim, kamera skaneri, internetsiz naqd sotuv | `mobile/app/(tabs)/` (sell, products, nasiya, sales), `mobile/app/scan.tsx`, `mobile/app/kirim-chiqim.tsx`, `mobile/app/offline-sales.tsx` (commit 9324a2b, APK 1.3.0 dan oldin) |
| Misol hisob: 10 mln so'm, 12 oy, BNPL ≈30% → ≈3 mln so'm; Pro 649 000 so'm/oy | `web/app/page.tsx:67-68` (`EX_PRICE`, `EX_BNPL_FEE`); `landing.ts:89-109` (`why`, manba izohi) |
| PQ-294: 12 oy, 250 BHM (≈110 mln), yiliga 50%, oldin yopishda 0 so'm, 500 mln / 50% reyestr; manba va «yuridik maslahat emas» | `landing.ts:60-87`, `191` |
| 10 daqiqalik onlayn demo, Telegram orqali vaqt | `landing.ts:283` (`contact.demo1`) |
| Email support@savora.uz | `web/app/contact/page.tsx:16` |

### Ishlatilmaydigan da'volar (kodda yo'q yoki «Tez orada»)
- Mijozga **avtomatik** SMS nasiya eslatmasi — yo'q (faqat egaga Telegram; mijozga — qo'lda, bir tugmada).
- Shartnoma PDF va SMS-kod imzo — yo'q.
- PQ-294 bo'yicha: 12 oy / 50% chegarasi ogohlantirishi, narx tarkibini alohida ko'rsatish, choraklik aylanma monitori — landing'da **«Tez orada»** (`web/app/page.tsx:61`). Postlarda «bor» deyilmaydi.
- To'lov kunidan **oldin** avtomatik eslatma — kodda kunlik xabar faqat muddati o'tganlar uchun; «yaqin» to'lovlar ro'yxatda ko'rinadi, xolos.
- Mobil push-bildirishnomalar — kodda bor, lekin APNs/FCM kalitlari sozlanishi kutilmoqda; reklamada aytilmaydi.
- Click/Payme bilan to'lov qabul qilish — landing'dagi «Click» faqat animatsiya namunasi, da'vo qilinmaydi.
- Play Market va App Store'da ilova — hali yo'q (APK va TestFlight beta).
- Mijozlar fikri, mijozlar soni, foiz o'sish kabi raqamlar — haqiqiy ma'lumot yo'q.

### E'tibor uchun (kodda topilgan nomuvofiqlik va ochiq savollar)
- `web/lib/i18n/dict/landing.ts:205` — `signupPrompt.trial` da **«7 kun bepul»** yozilgan (`components/analytics/SignupPromptModal.tsx` da ko'rsatiladi), boshqa hamma joyda 14 kun. Instagram 14 kun va'da qilgani uchun modal matnini tuzatish kerak.
- Tarif narxlari super-admin sozlamalarida o'zgartirilishi mumkin (`web/lib/platformSettings.ts` → `getEffectivePlanPresets`). Narxli postni joylashdan oldin savora.uz dagi «Tariflar» bo'limi bilan solishtiring.
- Saytdagi telefon raqami va ish vaqti vaqtinchalik (`web/app/contact/page.tsx:40` — `Ph` belgisi); «Aloqa» story'siga haqiqiy ma'lumot qo'yilishi kerak.
