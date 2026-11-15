# Savora Reels #02 — «Bitta tizim» (brend reklama)

**Format:** 1080×1920, 30 fps, 24.0 s, ovoz + musiqa (−14 LUFS). **Platforma:** Instagram Reels / target.
**Auditoriya:** telefon, maishiy texnika, mebel do'koni egalari. **Taklif:** savora.uz — 14 kun bepul, karta talab qilinmaydi.
**Uslub:** AI yaratgan fiktiv (hayotda yo'q) odamlar kliplari + 3D motion: chuqurlikdan uchib chiqadigan qalin kartalar, klip telefon ekraniga aylanadi, modullar telefon atrofida 3D orbitada, lenta-S logo.

## Ssenariy

| Vaqt | Sahna | Ekranda | Ovoz (uz-UZ-SardorNeural, +10%) |
| --- | --- | --- | --- |
| 0.0–3.0 | AI klip 1: do'kon egasi kechqurun uyda telefonga qarab jilmayadi | Siz uydasiz. / Do'koningiz esa ishlayapti. + «Bugungi tushum» 3D kartasi (jonli sanaladi) | 0.30, 1.20 |
| 3.0–6.0 | AI klip 2: kassir telefon qutisini uzatadi | 01 KASSA · Sotuv 2 daqiqada + chek kartasi (Naqd/Karta/Nasiya/Bank krediti, 1:48) | 3.20 |
| 6.0–9.0 | AI klip 3: juftlik yangi divanda | 02 NASIYA · Har bir to'lov nazoratda + 6 oylik jadval (3/6 to'landi) | 6.20 |
| 9.0–12.0 | AI klip 4: omborchi shtrix-kod skanerlaydi | 03 OMBOR · Har bir tovar hisobda + skaner, «Kam qoldi: 2 dona» | 9.20 |
| 12.0–16.0 | Klip kichrayib telefon ekraniga aylanadi → Savora bosh sahifasi; 6 modul chiqadi va 3D orbitaga qo'shiladi | Kassa · Ombor · Nasiya · Filiallar · Qarz daftari · AI yordamchi → Hammasi bitta tizimda | 12.35 |
| 16.0–18.0 | Chaqnash → logo konturdan chiziladi, «Savora» | Do'koningiz uchun yagona tizim | 16.05 |
| 18.0–24.0 | CTA: logo tepaga, tugma, barmoq bosadi | Telefon, texnika va mebel do'konlari uchun · savora.uz · 14 kun bepul · Karta talab qilinmaydi | 18.45 |

Kesimlar velocity-matched zoom-through (chiquvchi klip kattalashib xiralashadi, kiruvchi kattadan joyiga tushadi) + yorug'lik chizig'i.

## AI kliplar (`assets/clips/c1–c4.mp4`)

Hozir fayllar — **vaqtinchalik gradient fonlar**, kadrda «AI klip N … (vaqtinchalik)» yorlig'i chiqadi.
Haqiqiy kliplar ManyMotions'da tayyorlab qo'yilgan (Kling 3.0 Pro, 9:16, 5 s, har biri 525 kredit):

| Fayl | Sahna | ManyMotions loyiha |
| --- | --- | --- |
| c1.mp4 | Do'kon egasi uyda, telefonga qarab jilmayadi (dolly in) | https://manymotions.com/dashboard/media-forge?prefill=4694d97a60171762c0572e0fe464606c |
| c2.mp4 | Kassir telefon qutisini uzatadi (arc right) | https://manymotions.com/dashboard/media-forge?prefill=ec1793c785b1dd2ce0dc255b56090a8b |
| c3.mp4 | Juftlik mebel do'konida divanga o'tiradi (dolly left) | https://manymotions.com/dashboard/media-forge?prefill=18845aa51f5dcbfc86bd5b598d68e2e7 |
| c4.mp4 | Omborchi skanerlaydi (dolly right) | https://manymotions.com/dashboard/media-forge?prefill=8ee8f72289578f57cf130a2abbb92030 |

Klip almashtirilgach:
1. Fayllarni `assets/clips/` ga `c1.mp4 … c4.mp4` nomi bilan qo'ying (5 s, vertikal).
2. `index.html` da `const PLACEHOLDER = true;` → `false`.
3. Kadrlarni tekshiring: yuz/qo'llarda nuqson, kadrdagi o'qiladigan yozuv yoki boshqa brend logosi bo'lmasin (bo'lsa — klipni qayta yarating).
4. Qayta render (pastda).

## Da'volar tekshiruvi (kod, 2026-11-14)
- «Sotuv 2 daqiqada», «14 kun bepul», «Karta talab qilinmaydi» — `web/lib/i18n/dict/landing.ts`, `auth.ts`.
- Shtrix-kod skaner — `web/lib/barcodeCameraScan.ts`, `dict/stock.ts`; kam qolgan tovar — `app/app/products`, dashboard; nasiya jadvali — `lib/installment.ts`; qarz daftari, filiallar, AI yordamchi — mavjud.
- Telefondagi ekran va kartalar — brend uslubida qayta chizilgan namoyish, raqamlar demo («Mobi Market», «Aziz R.» — fiktiv).
- Ishlatilmagan: mijozga avtomatik SMS, shartnoma/SMS-kod, tekshirib bo'lmaydigan statistika, haqiqiy mashhur odamlar (roziligisiz yuzidan foydalanish taqiqlangan — faqat fiktiv AI odamlar yoki shartnomali shaxs videosi).

## Qayta yig'ish
```bash
cd marketing/video
.venv/bin/python src/tts_lines.py savora-reel-02/vo/lines.txt   # ovoz jumlalari
.venv/bin/python src/music02.py savora-reel-02/assets/audio/music.wav
.venv/bin/python src/mix_tts.py savora-reel-02                   # vo.wav + mix.wav (voice_slots.json bo'yicha)
cd savora-reel-02
npx --yes hyperframes@0.8.185 check
npx --yes hyperframes@0.8.185 render -o renders/savora-reel-02.mp4 --fps 30 --quality delivery
```
Shriftlar: Onest, Unbounded — SIL OFL 1.1. Musiqa — original protsedural sintez. Ovoz — Microsoft Edge TTS (tijoriy foydalanish shartlarini tekshiring; ishonchli variant — Azure Speech yoki jonli diktor, `src/ovoz.sh`). AI kliplar — ManyMotions (Kling 3.0 Pro); tijoriy foydalanish huquqi tarifingiz shartlariga bog'liq.
