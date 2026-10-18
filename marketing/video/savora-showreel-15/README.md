# Savora Showreel 15 s

Premium brend/mahsulot filmi (brief: `../promptsmotion-prompt.md`, sahnalar: `STORYBOARD.md`).

| Fayl | Format |
| --- | --- |
| `../savora-showreel-15-16x9.mp4` | 1920×1080, 60 fps, 15 s, musiqa bilan (master) |
| `../savora-showreel-15-9x16.mp4` | 1080×1920, 60 fps, 15 s — Reels/Shorts uchun qayta komponovka |

## Sahnalar

| Vaqt | Sahna | Ekrandagi matn |
| --- | --- | --- |
| 0.0–2.0 | Qog'oz nasiya daftari, oltin marker bitta summani belgilaydi | Qarzlar — qog'ozda. |
| 2.0–5.0 | Daftar qatori nasiya kartasiga aylanadi (6 oylik jadval), karta telefondagi o'z qatoriga qo'nadi | 01 · NASIYA — Nasiya — tartibda. Har bir to'lov — jadvalda. |
| 5.0–8.0 | Ekran "Yangi sotuv"ga o'tadi, to'lov turlari chiqadi, "Sotuv tasdiqlandi" | 02 · KASSA — Sotuv — 2 daqiqada. |
| 8.0–11.0 | Telefon chetga suriladi, Hisobot (filiallar reytingi), AI xulosa + topshiriq | 03 · FILIALLAR — Barcha filiallar. Bitta ekran. |
| 11.0–15.0 | Kamera orqaga, logo yig'iladi, so'z belgisi, CTA (oxirgi ~1.5 s ushlanadi) | Savora · Do'koningiz uchun yagona tizim · savora.uz · 14 kun bepul |

## Da'volar tekshiruvi

- "Sotuv 2 daqiqada" — `web/lib/i18n/dict/landing.ts` (landing matni).
- Naqd / Qarz / Nasiya / Bank krediti — `web/lib/i18n/dict/crm.ts` `payTypes`, "Yangi sotuv" ekrani.
- Nasiya jadvali, keyingi to'lov — `app_nasiya.png` (haqiqiy ekran, demo ma'lumot).
- Filiallar reytingi — Hisobot ekrani (`desk_monitoring_c.png`).
- AI yordamchi tavsiya va topshiriq — `web/app/app/ai/page.tsx` (`AiTaskButton`, suggested tasks). AI paneldagi "43 foizi / 17,5 mln" demo Hisobotdan: nasiya 17 500 000 / aylanma 40 700 000.
- Ishlatilmagan: shartnoma/SMS-kod imzo, mijozga avtomatik SMS, mijozlar soni va boshqa tekshirib bo'lmaydigan raqamlar.

## Manbalar

- Shriftlar: Onest, Unbounded — SIL OFL 1.1 (`assets/fonts/*-OFL.txt`).
- UI kadrlari: Savora ilovasining haqiqiy skrinshotlari (demo ma'lumot).
- Musiqa: `../src/music15.py` — numpy/scipy protsedural sintez, original asar. `.wav` gitda yo'q; qayta yaratish:
  `../.venv/bin/python ../src/music15.py assets/audio/music.wav` (keyin loudnorm −14 LUFS, `vertical/assets/audio/` ga ham nusxa).

## Qayta render

```bash
npx hyperframes check && npx hyperframes render -o renders/savora-showreel-15-16x9.mp4 --fps 60 --quality delivery
cd vertical && npx hyperframes check && npx hyperframes render -o renders/savora-showreel-15-9x16.mp4 --fps 60 --quality delivery
```

Vertikal variant alohida loyiha (`vertical/`), chunki bitta loyihada ikki root kompozitsiya bo'lishi mumkin emas.
