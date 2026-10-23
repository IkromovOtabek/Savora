# Ovoz yozish — Reels #01 «Nazorat»

## Qanday yozish kerak
1. Jim xona, yumshoq buyumlar ko'p joy: shkaf oldi, yotoqxona. Oshxona yoki vannaxona to'g'ri kelmaydi, ularda aks-sado bo'ladi.
2. iPhone «Diktofon» (Voice Memos) yoki Android'dagi diktofon ilovasini oching. Telegram ovozli xabari ham bo'ladi.
3. Telefon og'izdan 15–20 sm uzoqda, biroz yonda tursin. Shunda «p», «b» tovushlari pufillamaydi.
4. **Har jumladan keyin 1 soniya jim turing.** Skript jumlalarni shu pauzalar bo'yicha ajratadi.
5. Tetik, ishonchli, biroz tez o'qing: xuddi do'stingizga maslahat berayotgandek, reklama diktori ohangida emas.
6. Xato qilsangiz, to'xtamang, butun matnni boshidan qayta yozing. Faylda faqat 10 ta jumla bo'lsin.

## Matn (10 ta jumla)
1. Do'koningizdan uzoqdasiz.
2. Hozir u yerda nima bo'lyapti?
3. Kassada qancha pul?
4. Kim qarzga oldi?
5. Qaysi tovar tugadi?
6. Savora bilan — hammasi telefoningizda.
7. Bugungi tushum, har bir sotuv va to'lov — bir qarashda.
8. Kam qolgan tovar va qarzdorlar ham nazoratda.
9. Telefon, texnika va mebel do'konlari uchun.
10. Savora.uz — o'n to'rt kun bepul sinab ko'ring!

3–5-jumlalar qisqa va keskin bo'lsin, har biri taxminan 1 soniya.

## Keyin
Faylni `marketing/video/` papkasiga tashlang (masalan, `ovoz-01.m4a`), so'ng:
```bash
./src/ovoz.sh ovoz-01.m4a
```
Natija `savora-reel-01-jonli-ovoz.mp4` faylida bo'ladi. Skript ovozni tozalaydi (shovqin, sibilyant, balandlik), jumlalarni videodagi vaqtlarga joylaydi, kerak bo'lsa 20% gacha tezlashtiradi va qaysi jumla sig'maganini aytadi.
