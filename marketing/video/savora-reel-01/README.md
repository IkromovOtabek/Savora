# Savora Reels #01 — «Nazorat» (target reklama uchun)

**Fayl:** `../savora-reel-01-nazorat.mp4` — 1080×1920, 30 fps, 22.0 s, ovoz + musiqa (−14 LUFS), subtitr ichida.
**Muqova:** `../savora-reel-01-cover.png` (19.9 s kadr).
**Auditoriya:** telefon, maishiy texnika, mebel do'koni egalari. **Taklif:** savora.uz — 14 kun bepul, karta talab qilinmaydi.

## Ssenariy

| Vaqt | Sahna | Ekranda | Ovoz (uz-UZ-SardorNeural) |
| --- | --- | --- | --- |
| 0.0–3.5 | HOOK: «Siz → Do'kon 12 km» yo'li, so'zlar zarbasi, zoom-through | Do'koningizdan uzoqdasiz. / Hozir u yerda nima bo'lyapti? | 0.30, 1.85 |
| 3.5–7.0 | OG'RIQ: 3 savol (slam / snap / aylanib), qizil fon, bir nuqtaga yig'ilish | Kassada qancha pul? · Kim qarzga oldi? · Qaysi tovar tugadi? | 3.55, 4.65, 5.75 |
| 7.0–9.5 | REVEAL: lenta-S logo konturdan chiziladi, ustunlar o'sadi, «Savora» harflari | Hammasi telefoningizda. | 7.35 |
| 9.5–15.5 | ISBOT: telefon (Kun mavzusi UI), bugungi tushum sanaladi, jonli sotuvlar, «Kam qoldi» va «Qarzdorlar» kartalari | subtitr | 9.70, 12.75 |
| 15.5–18.0 | AUDITORIYA: Telefon → Texnika → Mebel, 6 modul | do'konlari uchun · Kassa · Ombor · Nasiya · Qarz daftari · Filiallar · AI yordamchi | 15.60 |
| 18.0–22.0 | CTA: logo, savora.uz tugmasi (barmoq bosadi), 14 kun bepul | savora.uz · 14 kun bepul · Karta talab qilinmaydi | 18.20 |

## Da'volar tekshiruvi
- Tushum, sotuvlar, to'lov usullari (naqd/karta/Click/HUMO) — kassa va dashboard; kam qolgan tovar — `app/app/products`, dashboard; qarz daftari — `app/app/daftar`; filiallar, AI yordamchi — mavjud.
- Telefondagi ekran — brend uslubida qayta chizilgan namoyish, raqamlar demo («Mobi Market» — landingdagi demo do'kon nomi).
- Ishlatilmagan: mijozga avtomatik SMS, shartnoma/SMS-kod, mijozlar soni va tekshirib bo'lmaydigan statistika, App Store/Play Market (ilova hali do'konlarda yo'q).

## Qayta yig'ish
```bash
# ovoz: vo/ ichida edge-tts (uz-UZ-SardorNeural, +10%), sukut kesiladi, adelay bilan joylanadi
../.venv/bin/python ../src/music01.py assets/audio/music.wav
# mix.wav = vo (sidechain ducking) + music, loudnorm −14 LUFS (buyruq: sessiya tarixida, ../src/build.sh uslubida)
npx --yes hyperframes@0.8.185 check
npx --yes hyperframes@0.8.185 render -o renders/savora-reel-01.mp4 --fps 30 --quality delivery
```
Shriftlar: Onest, Unbounded — SIL OFL 1.1. Musiqa — original protsedural sintez. Ovoz — Microsoft Edge TTS (tijoriy foydalanish shartlarini tekshiring; ishonchli variant — Azure Speech yoki jonli diktor).
