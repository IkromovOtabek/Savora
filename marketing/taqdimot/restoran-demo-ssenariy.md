# Jonli namoyish ssenariysi — DOM24 restorani (~4 daqiqa)

Taqdimotning 6-slaydidan keyin brauzerga o'tasiz. Slaydlar:
- o'zbekcha — https://claude.ai/artifact/LEKJFguzdZJecvc6FDSKmE
- ruscha — https://claude.ai/artifact/QtXqem99EpVx8CZrFc21uQ

## Bir kun oldin (tayyorgarlik)

1. **Demo ma'lumot.** dom24 v3 paketi (`/root/savora-seed-v3`) prod'ga yuklanganini tekshiring. Yuklanmagan bo'lsa — uchrashuvdan OLDIN yuklang: namoyishdagi buyurtmalar dom24 ni o'zgartiradi va keyin `restore.sh` to'xtab qoladi.
2. **Stol QR'i.** Restoran sozlamalari → «Zal va stollar» → «QR kodlarni chop etish» (`/app/restaurant/tables/print`). Bitta stol kartasini (masalan, 5-stol) chop etib, uchrashuv xonasidagi stolga qo'ying. «QR-kodni almashtirish» tugmasini BOSMANG — eski QR ishlamay qoladi.
3. **Mijoz sahifasi (ixtiyoriy).** Restoran sozlamalari → «Umumiy» → «Mijoz sahifasi»: logo, manzil, telefon, ish vaqti hozir bo'sh. To'ldirsangiz, `savora.uz/m/dom24` chiroyliroq ko'rinadi.
4. **Zaxira video.** Shu ssenariyni bir marta ekranga yozib oling (QuickTime → Fayl → Yangi ekran yozuvi). Internet yoki biror narsa ishlamasa, videoni qo'yasiz.
5. **Mashq.** Ssenariyni boshidan oxirigacha 2 marta, soat bilan o'tkazing.

## Uchrashuv kuni, boshlashdan oldin

- [ ] Noutbukda dom24 egasi akkauntiga kiring. 1-tab — `/app/tables` (Stollar), 2-tab — `/app/kitchen` (Oshxona).
- [ ] Rus tilida taqdimot qilsangiz — Savora interfeysini RU ga o'tkazing. Mijozning QR sahifasi tepasida ham UZ/RU almashtirgich bor.
- [ ] Brauzer masshtabi 125–150% (proyektorda orqa qatordan ham o'qilsin).
- [ ] Ovoz: noutbuk ovozi yoqiq, qo'ng'iroqcha menyusida «Ovoz yoqiq». «Ovoz chiqishi uchun sahifaga bir marta teging» yozuvi chiqsa — sahifani bir marta bosing (brauzer shu bosishsiz ovozni bloklaydi).
- [ ] Zaxira internet: telefon hotspoti tayyor.
- [ ] Namoyishdagi stol (5-stol) bo'sh ekanini tekshiring.

## Namoyish (4 daqiqa)

| Vaqt | Qayerda | Nima qilasiz | Nima deysiz |
|---|---|---|---|
| 0:00 | Stollar | Zal taxtasini ko'rsating: bo'sh, band, «Hisob chiqdi» stollar | «Ofitsant va egasi zalni shunday ko'radi — qaysi stol nima holatda, bir qarashda.» |
| 0:30 | Stollar → 5-stol | **«Stolni ochish»**, mehmonlar soni 2 | «Ofitsant stolni ochdi.» |
| 0:50 | Telefon | Zaldagi bir kishiga stoldagi QR'ni skanerlating → 2 ta taom → **«Savatga qo'shish»** → **«Buyurtma berish»**. Keyin **«Ofitsantni chaqirish»** | «Mijoz ofitsantni kutmasdan o'zi buyurtma beradi.» |
| 1:50 | Stollar → 5-stol | Ovozli xabar keladi. Stol ichida «Mijoz QR orqali 2 ta taom qo'shdi» yozuvi → **«Tasdiqlab yuborish»** | «Ofitsant tasdiqlamaguncha oshxonaga hech narsa ketmaydi — hazil buyurtma o'tmaydi.» |
| 2:10 | 2-tab: Oshxona | Taomlar paydo bo'ldi, taymer ketyapti. **«Boshlash»** → **«Tayyor»** | «Oshpaz qog'oz kutmaydi. Har stansiya faqat o'z taomini ko'radi. Taom yuborilgan zahoti ombordan retsept bo'yicha mahsulot ayrildi.» |
| 2:40 | 1-tab: 5-stol | **«Yetkazildi»** → **«Hisob (pre-chek)»** → **«To'lov»** → **«Hisobni bo'lish»** → **«Teng bo'lish»**, 2 kishiga | «Xizmat haqi 10% o'zi qo'shildi. Hisobni ikkiga bo'ldik: biri naqd, biri karta yoki UzQR.» |
| 3:30 | Restoran hisobotlari (`/app/restaurant/reports`) | Bugungi tushum, o'rtacha chek, oshxona vaqti, ofitsantlar | «Kechqurun egasi shu sahifani ochadi — hammasi tayyor, hech kim qo'lda hisoblamaydi.» |
| 4:00 | — | 7-slaydga (narx) qayting | |

**Vaqt qolsa (ixtiyoriy):**
- **Menyu** → bitta taom → retsept: tannarx va foyda ko'rinadi.
- Yuborilgan taomni bekor qilish: sabab so'raladi va hisobotda «yo'qotish» bo'lib qoladi.

## Muhim nozikliklar

- **Avval stolni oching, keyin QR'dan buyurtma bering.** Mijoz bo'sh stolni QR orqali o'zi ochsa (ofitsantsiz), xizmat haqi olinmaydi — 0% bo'ladi va «10% o'zi qo'shildi» degan gap chiqmaydi.
- **Pre-chek fiskal chek emas.** So'rashsa: fiskal chek (soliq kassasi) hozircha yo'q, rejada.
- **Oshxona printeri** faqat printer ulangan va kompyuterda `/app/kitchen/print` ochiq bo'lsa ishlaydi. Printer bo'lmasa, uni namoyishda ko'rsatmang — og'zaki ayting.
- Namoyishdagi buyurtmalar dom24 hisobotiga qo'shiladi — bu demo do'kon, haqiqiy mijozga ta'sir qilmaydi.

## Biror narsa ishlamasa

| Holat | Nima qilasiz |
|---|---|
| Telefon QR'ni ochmayapti (internet) | Taomlarni noutbukda ofitsant sifatida qo'shing → «Oshxonaga yuborish». Davom eting. |
| Sahifa uzoq yuklanyapti | «Hozir mehmonxona internetini sinayapmiz» deb hazillashing, hotspotga o'ting. |
| Umuman ishlamayapti | Zaxira videoni qo'ying va ustidan gapiring. |

## Savollarga tayyor javoblar (faqat haqiqat)

- **Fiskal chek / soliq kassasi?** Hozircha yo'q, ishlab chiqish rejasida. Taomlarga MXIK (IKPU) kodini kiritsa bo'ladi.
- **Yandex Eats, Uzum Tezkor bilan ulanadimi?** Hozircha yo'q.
- **Internet uzilsa?** Restoran qismi onlayn ishlaydi — zaxira internet tavsiya qilinadi.
- **Qaysi qurilmada ishlaydi?** Telefon, planshet, kompyuter — brauzer orqali; maxsus uskuna shart emas.
- **Tarmoq (IP) printeri?** Hozircha kompyuterdagi Chrome orqali chop etiladi (oddiy printer yetadi); to'g'ridan IP printer — keyinroq.
- **Narx?** Boshlang'ich 249 000, Pro 499 000 (QR-menyu shu tarifdan), Biznes 1 290 000 so'm/oy. 7 kun bepul sinov, 6 oyga −10%, 1 yilga — 2 oy bepul.
