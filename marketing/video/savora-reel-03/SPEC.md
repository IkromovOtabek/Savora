GOAL:    do'kon egasi «Savora mening sohamga moslashadi» deb his qiladi va savora.uz ga kiradi
OUTPUT:  HyperFrames, 1080 x 1920, 30 fps
TIME:    26.5 s x 30 = 795 kadr; musiqa 120 BPM (bit = 15 kadr); ovoz — soat (UzbekVoice «jasur»)
LOOK:    yer: yorug' studiya supurgisi #F5F8FE (tepa) → #DCE5F4 (past), chiziqsiz; sohaga qarab 25% rang
         to'lqini (telefon #E4ECFF, dorixona #DDF3FB, kiyim #ECE8FF, restoran #F4EEE4, shablon #E6E7EB);
         siyoh #101828, ikkinchi #667085; urg'u — brend ko'ki #1A5FE0, kadrda bitta so'z;
         oltin #FFA800 ishlatilmaydi (pul yo'q); sarlavha Montserrat 800, 92 px, -2%;
         matn Onest 500/600, 30–40 px; muhit — 3D studiya: yaltiroq ko'k kub (clearcoat 1, roughness 0.32),
         oq bo'rtma ikonkalar; issiq kalit chapdan-yuqoridan, sovuq kontur o'ngdan-orqadan; kontakt soya 0.22
OBJECTS: soha kubi — 1 birlik, qirra radiusi 0.14, yuzlarida mahsulotning o'z ikonkalari (components/icons/Icon.tsx);
         «Yangi tovar» kartasi — Savora Kun UI: oq, radius 28, soya 0 24 60 rgba(16,40,90,.16),
         maydon #F2F4F7 radius 16, sarlavha = TERMS.addItem, maydonlar = PRODUCT_FIELDS yorliqlari (d.stock.fields);
         14 kichik kub (har biri bitta yo'nalish ikonkasi); 3D lenta-S logo (web/lib/brand.ts yo'llari, ekstruziya 0.12)
MOTION:  kirish expo.out 0.5 s; kub dumalashi 0.46 s power2.inOut + 6° ortiqcha burilish, prujina damping 0.6;
         chiqish power3.in, kirishdan 45% qisqa; kamera power2.inOut; so'zlar 0.067 s oraliq, blur 6→0 px;
         karta maydoni almashuvi — morf 0.3 s power3.out, gorizontal blur 10→0
SHOTS:   0.0–2.4   HOOK — kub tez dumalaydi (6 yuz), ostida soha nomi slot kabi almashadi; kadr 0 da ikonka aniq
         2.4–4.9   SHABLON — fon kulrang, kub kulrangga o'chadi; oddiy «Mahsulot qo'shish» kartasi; 3 chip
                   (IMEI, Yaroqlilik muddati, O'lcham) kartaga uriladi va qaytib tushadi; «Hammaga bir xil?»
         4.9–7.3   REVEAL — ko'k rang kubdan tarqaladi, kub sakrab 360° aylanadi, yuzida lenta-S bo'rtadi;
                   «Har sohaga — o'z formasi»
         7.3–9.7   TELEFON — dumalash, «Telefon do'kon», karta: Telefon qo'shish · IMEI · Kafolat (oy)
         9.7–12.5  DORIXONA — «Dorixona», karta: Dori qo'shish · Seriya raqami · Yaroqlilik muddati*
         12.5–14.8 KIYIM — «Kiyim-kechak», karta: Kiyim qo'shish · O'lcham (S M L XL) · Rang
         14.8–17.1 RESTORAN — «Restoran / kafe», karta: Menyu · Taom qo'shish · Nomi · Kategoriya
         17.1–18.2 MONTAJ — 3 tez dumalash: Qurilish (kg · m² · qop), Avto (OEM kod), Mebel (Artikul)
         18.2–21.2 PAYOFF — kub 14 kubga bo'linadi, 4-3-4-3 devor; «14» sanaladi, «yo'nalish»
         21.2–26.5 END — kublar markazga yig'iladi, 3D logo yon tomondan burilib keladi, «Savora» harflari,
                   savora.uz, «7 kun bepul · karta talab qilinmaydi»; 2.5 s ushlab turiladi
BANNED:  qora/to'q ko'k bo'shliq, nur/bloom/zarrachalar, shisha kartalar, binafsha gradient, uchta karta qatori,
         hamma narsa pastdan suzib chiqishi, qo'nganidan keyin suzayotgan sarlavha, burchakdagi logo,
         UI kartasini 3D ga qiyshaytirish, kodda yo'q funksiya (avto-SMS, shartnoma, Play Market)
QA:      0.0 (thumbnail: kub + soha nomi), 3.6 (chip qaytishi), 6.2 (ko'k kub + logo yuzi), 8.6, 11.2, 13.8, 16.0
         (har soha kartasi o'qiladi), 17.6 (montaj), 20.0 (14 kub devori), 25.0 (end card)
