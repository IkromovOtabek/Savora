import Link from 'next/link';
import { getDict } from '@/lib/i18n/server';
import { LegalDoc, Ph, type LegalSection } from '../terms/legal';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.landing.legal.privacyMetaTitle, description: d.landing.legal.privacyMetaDesc };
}

/*
 * TODO(yurist): Ma'lumot saqlash joyi (lokalizatsiya — "Shaxsga doir ma'lumotlar to'g'risida"gi
 * qonun, 27¹-modda, 2026-yil 26-martdagi 1125-son o'zgartirishlar va VM ning 29.07.2026 dagi
 * "adekvat himoya" davlatlar ro'yxati), bazani davlat reyestrida ro'yxatdan o'tkazish, vakolatli
 * organ nomi va saqlash muddatlari yurist bilan tasdiqlansin. Ro'yxat: web/docs/business/LEGAL_TODO.md
 */

const SECTIONS: LegalSection[] = [
  {
    id: 'kim',
    title: 'Kim ishlov beradi',
    body: (
      <>
        <p>
          Savora (<Ph>yuridik shaxs nomi, STIR, manzil</Ph>) &mdash; savdo va nasiya hisobi platformasi. Ma&apos;lumotlar
          bo&apos;yicha ikki xil rolimiz bor:
        </p>
        <ul>
          <li><b>Do&apos;kon egasi va xodimlar ma&apos;lumoti</b> (hisob, login, to&apos;lovlar) &mdash; Savora mulkdor va operator.</li>
          <li><b>Do&apos;kon xaridorlari ma&apos;lumoti</b> (do&apos;kon o&apos;zi kiritadi) &mdash; mulkdor do&apos;kon, Savora esa do&apos;kon topshirig&apos;i bilan ishlov beruvchi operator. Xaridor o&apos;z huquqlari bo&apos;yicha avvalo do&apos;konga murojaat qiladi.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'qanday',
    title: 'Qanday ma\'lumotlar',
    body: (
      <>
        <h3>Hisob va biznes</h3>
        <ul>
          <li>Ism, telefon raqami, login, parol (faqat shifrlangan xesh ko&apos;rinishida).</li>
          <li>Do&apos;kon nomi, biznes turi, filiallar, tarif va to&apos;lov tarixi, yuklangan to&apos;lov cheklari.</li>
          <li>Telegram bog&apos;langan bo&apos;lsa &mdash; Telegram foydalanuvchi va chat identifikatori.</li>
        </ul>
        <h3>Do&apos;kon kiritadigan ma&apos;lumotlar</h3>
        <ul>
          <li>Xaridor F.I.Sh., telefoni, manzili, izohlar va rasm (agar do&apos;kon kiritsa).</li>
          <li>Sotuvlar, nasiya jadvali, to&apos;lovlar, qarz daftari yozuvlari, tovarlar va IMEI raqamlari.</li>
        </ul>
        <h3>Texnik ma&apos;lumotlar</h3>
        <ul>
          <li>IP manzil, brauzer turi, kirish vaqti, ochilgan sahifalar, reklama manbasi (UTM).</li>
          <li>Xodimlar amallari jurnali (audit): kim, qachon, qaysi amalni bajargani.</li>
        </ul>
        <p>Savora biometrik (yuz, barmoq izi) va genetik ma&apos;lumotlarni yig&apos;maydi.</p>
      </>
    ),
  },
  {
    id: 'maqsad',
    title: 'Nima uchun ishlatamiz',
    body: (
      <ul>
        <li>Hisob ochish, tizimga kirish va xizmat ko&apos;rsatish (sotuv, ombor, nasiya hisobi, hisobotlar).</li>
        <li>Do&apos;kon egasiga eslatmalar: to&apos;lov muddati, kechikkan nasiya, obuna tugashi.</li>
        <li>Do&apos;kon topshirig&apos;i bilan xaridorga SMS yoki Telegram eslatma yuborish.</li>
        <li>Xavfsizlik: firibgarlik, ruxsatsiz kirish va suiiste&apos;molni aniqlash.</li>
        <li>Texnik yordam va xizmat sifatini yaxshilash (umumlashtirilgan statistika).</li>
        <li>Qonun talablarini bajarish (soliq, buxgalteriya, davlat organlari so&apos;rovlari).</li>
      </ul>
    ),
  },
  {
    id: 'asos',
    title: 'Huquqiy asos va rozilik',
    body: (
      <>
        <p>Ma&apos;lumotlarga &laquo;Shaxsga doir ma&apos;lumotlar to&apos;g&apos;risida&raquo;gi qonunga muvofiq quyidagi asoslarda ishlov beriladi:</p>
        <ul>
          <li><b>Rozilik</b> &mdash; ro&apos;yxatdan o&apos;tishda beriladi va istalgan vaqtda qaytarib olinishi mumkin;</li>
          <li><b>Shartnomani bajarish</b> &mdash; <Link href="/terms" className="au-link">Ommaviy oferta</Link> bo&apos;yicha xizmat ko&apos;rsatish;</li>
          <li><b>Qonuniy majburiyat</b> &mdash; qonunda talab qilingan hollarda.</li>
        </ul>
        <p className="pp-note">
          Do&apos;kon xaridor ma&apos;lumotini Savora&apos;ga kiritishdan oldin xaridordan rozilik olishi shart. Reklama
          xabarlari uchun alohida rozilik kerak; eslatma va chek kabi xizmat xabarlari bundan farq qiladi.
        </p>
      </>
    ),
  },
  {
    id: 'joy',
    title: 'Ma\'lumotlar qayerda saqlanadi',
    body: (
      <>
        <p>
          Ma&apos;lumotlar <Ph>saqlash joyi: davlat va ma&apos;lumot markazi / provayder nomi</Ph> serverlarida saqlanadi.
          Har bir do&apos;konning ma&apos;lumoti alohida bazada izolyatsiya qilingan.
        </p>
        <p>
          Istisno &mdash; umumiy shtrix-kod lug&apos;ati: zavod shtrix-kodli tovar qo&apos;shilganda uning kodi va nomi
          umumiy lug&apos;atga yoziladi, shunda boshqa do&apos;kon shu tovarni skanerlasa nom o&apos;zi chiqadi. Lug&apos;atda
          do&apos;kon nomi, narx, qoldiq, mijoz yoki sotuv ma&apos;lumoti bo&apos;lmaydi; do&apos;konning ichki kodlari
          (tarozi yorlig&apos;i va h.k.) yozilmaydi.
        </p>
        <p>
          O&apos;zbekiston qonunchiligiga ko&apos;ra biometrik va genetik ma&apos;lumotlar faqat O&apos;zbekiston hududida saqlanadi.
          Boshqa ma&apos;lumotlar xorijda saqlansa, bu faqat qonunda belgilangan asosda &mdash; <Ph>himoya darajasi adekvat deb
          tan olingan davlatda yoki tasdiqlangan namunaviy shartnoma shartlari asosida</Ph> amalga oshiriladi.
        </p>
      </>
    ),
  },
  {
    id: 'uchinchi',
    title: 'Uchinchi tomonlar',
    body: (
      <>
        <p>Ma&apos;lumotlarni sotmaymiz va reklama uchun bermaymiz. Xizmat ko&apos;rsatish uchun faqat zarur qismi quyidagilarga uzatiladi:</p>
        <ul>
          <li>Hosting va ma&apos;lumotlar bazasi &mdash; <Ph>provayder</Ph>;</li>
          <li>Fayl va rasm saqlash &mdash; <Ph>provayder</Ph>;</li>
          <li>SMS yuborish &mdash; SMS-shlyuz provayderi (masalan, Eskiz.uz): faqat telefon raqami va xabar matni;</li>
          <li>Telegram &mdash; bog&apos;langan hisobga bildirishnomalar;</li>
          <li>Sun&apos;iy intellekt yordamchisi (yoqilgan bo&apos;lsa) &mdash; <Ph>AI provayder</Ph>: faqat so&apos;rovga javob berish uchun zarur ma&apos;lumot, provayderga modelni o&apos;qitish uchun berilmaydi;</li>
          <li>Davlat organlari &mdash; faqat qonunda belgilangan tartibda.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'muddat',
    title: 'Saqlash muddati',
    body: (
      <ul>
        <li>Hisob faol bo&apos;lgan davrda &mdash; xizmat uchun zarur bo&apos;lgancha.</li>
        <li>Obuna tugagach &mdash; <Ph>30</Ph> kun (eksport va tiklash uchun), keyin o&apos;chiriladi; zaxira nusxalardan <Ph>90</Ph> kun ichida.</li>
        <li>To&apos;lov va buxgalteriya hujjatlari &mdash; qonunda belgilangan muddatda.</li>
        <li>Tashrif statistikasi va texnik jurnallar &mdash; <Ph>12</Ph> oygacha.</li>
      </ul>
    ),
  },
  {
    id: 'xavfsizlik',
    title: 'Xavfsizlik',
    body: (
      <ul>
        <li>Har bir do&apos;kon uchun alohida ma&apos;lumotlar bazasi.</li>
        <li>Parollar qaytarib bo&apos;lmaydigan xesh ko&apos;rinishida saqlanadi; ulanish shifrlangan (HTTPS).</li>
        <li>Xodimlarga rol va huquqlar; filial xodimi faqat o&apos;z filialini ko&apos;radi.</li>
        <li>Muhim amallar jurnali va muntazam zaxira nusxa.</li>
        <li>Ma&apos;lumot sizib chiqsa, qonunda belgilangan muddatlarda vakolatli organ va tegishli foydalanuvchilarni xabardor qilamiz.</li>
      </ul>
    ),
  },
  {
    id: 'huquqlar',
    title: 'Sizning huquqlaringiz',
    body: (
      <>
        <ul>
          <li>o&apos;zingiz haqingizdagi ma&apos;lumotlar va ularga qanday ishlov berilayotganini bilish;</li>
          <li>nusxasini olish, noto&apos;g&apos;ri ma&apos;lumotni tuzattirish;</li>
          <li>ma&apos;lumotni o&apos;chirishni talab qilish (qonun saqlashni talab qilganlaridan tashqari);</li>
          <li>rozilikni qaytarib olish va reklama xabarlaridan voz kechish;</li>
          <li>vakolatli davlat organiga (<Ph>organ nomi</Ph>) yoki sudga shikoyat qilish.</li>
        </ul>
        <p>So&apos;rovga <Ph>10</Ph> ish kuni ichida javob beramiz. Do&apos;kon xaridori bo&apos;lsangiz, avval do&apos;konning o&apos;ziga murojaat qiling &mdash; biz do&apos;konga so&apos;rovni bajarishda yordam beramiz.</p>
      </>
    ),
  },
  {
    id: 'cookie',
    title: 'Cookie fayllar',
    body: (
      <p>
        Tizimga kirgan holatni saqlash uchun zarur sessiya cookie&apos;lari va tashriflarni hisoblash uchun anonim
        identifikator ishlatiladi. Uchinchi tomon reklama cookie&apos;lari ishlatilmaydi.
      </p>
    ),
  },
  {
    id: 'yosh',
    title: 'Yosh chegarasi',
    body: <p>Platforma tadbirkorlar uchun. Hisob ochuvchi 18 yoshdan katta bo&apos;lishi kerak.</p>,
  },
  {
    id: 'ozgarish',
    title: 'Siyosatdagi o\'zgarishlar',
    body: <p>Yangi tahrir shu sahifada e&apos;lon qilinadi. Muhim o&apos;zgarishlar haqida kabinet yoki Telegram orqali oldindan xabar beramiz.</p>,
  },
  {
    id: 'aloqa',
    title: 'Aloqa',
    body: (
      <dl>
        <dt>Ma&apos;lumotlar himoyasi bo&apos;yicha mas&apos;ul</dt><dd><Ph>F.I.Sh.</Ph></dd>
        <dt>Email</dt><dd><Ph>privacy@…</Ph></dd>
        <dt>Pochta manzili</dt><dd><Ph>…</Ph></dd>
        <dt>Boshqa kanallar</dt><dd><Link href="/contact" className="au-link">Bog&apos;lanish sahifasi</Link></dd>
      </dl>
    ),
  },
];

export default async function PrivacyPage() {
  const d = await getDict();
  return (
    <LegalDoc
      title={d.landing.legal.privacyTitle}
      lead={d.landing.legal.privacyLead}
      sections={SECTIONS}
    />
  );
}
