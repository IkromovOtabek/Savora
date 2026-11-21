# Savora Reels #03 — «Sohangizga moslashadi» (3D motion)

**Fayl:** `../savora-reel-03-sohangizga.mp4` — 1080×1920, 30 fps, 26.5 s, erkak ovozi + musiqa (−14.6 LUFS, ovoz musiqadan ~17 dB baland).
**Muqova:** `../savora-reel-03-cover.png` (19.8 s kadr — 14 kub devori va «14 yo'nalish»).
**G'oya:** bitta 3D «soha kubi» dumalaydi, har yuzida yangi soha — pastdagi Savora «Yangi tovar» kartasi shu sohaga moslashadi. Oxirida kub 14 kubga bo'linadi, so'ng 3D lenta-S logoga yig'iladi. Syujet variantlari — `STORYLINES.md`, kadrma-kadr reja — `SPEC.md`.

## Ssenariy

| Vaqt | Sahna | Ekranda | Ovoz (Edge TTS uz-UZ-SardorNeural, erkak) |
| --- | --- | --- | --- |
| 0.0–2.4 | HOOK: kub tez dumalaydi (6 yuz), soha nomi slot kabi almashadi | Biznes turi · Telefon do'kon → … → Avto ehtiyot qism | 0.30 Har bir do'kon o'zgacha ishlaydi. |
| 2.4–4.9 | SHABLON: fon va kub kulrang, oddiy forma; IMEI / Yaroqlilik muddati / O'lcham chiplari sig'maydi | Hammaga bir xil? | 2.50 Bitta shablon hammaga to'g'ri kelmaydi. |
| 4.9–7.3 | REVEAL: ko'k to'lqin kubdan tarqaladi, kub sakrab aylanadi, yuzida lenta-S | Har sohaga — o'z formasi | 5.00 Savora esa sohangizga moslashadi. |
| 7.3–9.7 | Telefon do'kon | Telefon qo'shish · IMEI · Kafolat (oy) | 7.50 Telefon do'konida — IMEI va kafolat. |
| 9.7–12.5 | Dorixona | Dori qo'shish · Dorixona · Seriya raqami · Yaroqlilik muddati | 9.80 Dorixonada — seriya raqami va yaroqlilik muddati. |
| 12.5–14.8 | Kiyim-kechak | Kiyim qo'shish · O'lcham S M L XL · Rang | 12.60 Kiyim do'konida — o'lcham va rang. |
| 14.8–17.1 | Restoran / kafe | Taom qo'shish · Menyu · Nomi · Kategoriya | 14.90 Restoranda esa — menyu va taomlar. |
| 17.1–18.2 | Tez montaj | Qurilish (kg · m² · qop), Avto (OEM kod), Mebel (Artikul) | — |
| 18.2–21.2 | PAYOFF: kub 14 kubga bo'linadi, 4-3-4-3 devor | 14 yo'nalish · ro'yxatdan o'tishda tanlanadi | 18.55 O'n to'rt yo'nalish — bitta tizimda. |
| 21.2–26.5 | END: kublar markazga, 3D logo burilib keladi, «Savora» harflari | savora.uz · 14 kun bepul · karta talab qilinmaydi | 21.50 Sohangizni tanlang: savora.uz — o'n to'rt kun bepul. |

## Da'volar tekshiruvi (kod bilan)

- 14 yo'nalish, nomlari va ikonkalari — `web/lib/businessTypes.ts` (`BUSINESS_TYPE_IDS`, `BUSINESS_TYPES`), ikonkalar `web/components/icons/Icon.tsx` dan aynan nusxa.
- Sohaga qarab atamalar: «Telefon qo'shish», «Dori qo'shish», «Taom qo'shish», «Menyu», «Dorixona» — `TERMS`; maydonlar (IMEI, Kafolat (oy), Seriya raqami, Yaroqlilik muddati, O'lcham, Rang, O'lchov birligi, OEM kod, Artikul) — `PRODUCT_FIELDS` + `web/lib/i18n/dict/stock.ts` `fields.labels`.
- «Menyu va modullar shunga moslandi» — `web/lib/i18n/dict/shell.ts` (businessType hint); soha ro'yxatdan o'tishda tanlanadi.
- 14 kun bepul, karta talab qilinmaydi — `landing.ts` `hero.noCard`, `TRIAL_DAYS = 14`.
- Kartadagi qiymatlar (IMEI raqami, PT-2411, 03.2027, Osh…) — namuna, haqiqiy mijoz ma'lumoti emas.
- Ishlatilmagan: avto-SMS, shartnoma, Play Market / App Store, mijozlar soni.

## Texnika

- 3D: Three.js r169 (`src3d/stage3d.js` → `npm run build3d` → `lib/stage3d.js`, gitda yo'q). Har kadr `hf-seek` vaqtidan chiziladi; Three ichidagi `Math.random` urug'li PRNG ga almashtirilgan, rAF nomlari olib tashlangan (deterministik render).
- Kub: RoundedBoxGeometry, clearcoat, bo'rtma ikonkalar (emissive + bump), VSM yumshoq soya; logo — `web/lib/brand.ts` yo'llaridan ekstruziya, brend gradienti vertex ranglarda.
- HTML sahnalar: `compositions/` (bg, stage, hook, tension, reveal, proof, card, payoff, endcard). Shriftlar: Montserrat (HyperFrames ichida), Onest (OFL, `assets/fonts`).
- Ovoz: erkak — Edge TTS `uz-UZ-SardorNeural` +10% (`../src/tts_lines.py`), o'rtacha asosiy ton ~130 Hz. UzbekVoice'ning 5 ta ovozi (shoira, lola, kamola, jasur, sevinch) o'lchanganda hammasi ~230–250 Hz (ayol diapazoni), «jasur» ham — shuning uchun almashtirildi; eski jasur jumlalari `vo/jasur/` da (gitda yo'q).
- Miks: `../src/mix_tts.py savora-reel-03` — voice_slots.json `mix` bloki: ovozga EQ (+3 dB 3 kHz) va kompressor, musiqa −11 dB va ovoz ostida 6:1 ducking, statik gain → −14.5 LUFS, limiter −3 dB. Eski miksda ovoz musiqadan atigi ~4 dB baland edi, endi ~17 dB.
- Litsenziya: Edge TTS — Microsoft onlayn xizmati; tijoriy reklamada ishlatishdan oldin shartlarini tekshirish tavsiya etiladi (ishonchli variant — Azure Speech, xuddi shu ovoz, yoki jonli diktor, `../OVOZ-YOZISH.md`).
- Musiqa: `../src/music03.py` (protsedural, original).

## Qayta yig'ish

```bash
npm install && npm run build3d
../.venv/bin/python ../src/tts_lines.py vo/lines.txt                       # marketing/video dan: savora-reel-03/vo/lines.txt (Sardor)
../.venv/bin/python ../src/music03.py assets/audio/music.wav
../.venv/bin/python ../src/mix_tts.py .                                    # marketing/video dan: savora-reel-03
npx hyperframes@0.9.77 check
npx hyperframes@0.9.77 render -o renders/savora-reel-03-sohangizga.mp4 --fps 30 --quality high
```
