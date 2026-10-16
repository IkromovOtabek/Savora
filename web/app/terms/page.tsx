import Link from 'next/link';
import { getDict } from '@/lib/i18n/server';
import { LegalDoc, Ph, TRIAL_DAYS, type LegalSection } from './legal';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.landing.legal.termsMetaTitle, description: d.landing.legal.termsMetaDesc };
}

/*
 * TODO(yurist): Matn relizdan oldin O'zbekiston huquqi bo'yicha litsenziyali yurist tomonidan
 * tasdiqlanishi shart. [Kvadrat qavs] ichidagi joylar (rekvizitlar, sud, muddatlar) asoschi
 * tomonidan to'ldiriladi. Ro'yxat: web/docs/business/LEGAL_TODO.md
 */

const SECTIONS: LegalSection[] = [
  {
    id: 'umumiy',
    title: 'Umumiy qoidalar',
    body: (
      <>
        <p>
          Ushbu hujjat O&apos;zbekiston Respublikasi Fuqarolik kodeksining ommaviy oferta va aksept to&apos;g&apos;risidagi
          qoidalariga hamda &laquo;Elektron tijorat to&apos;g&apos;risida&raquo;gi qonunga muvofiq Savora platformasidan
          foydalanish shartlarini taklif qiluvchi ommaviy ofertadir (keyingi o&apos;rinlarda &mdash; Oferta).
        </p>
        <p>Ofertadagi atamalar:</p>
        <dl>
          <dt>Ijrochi</dt><dd>Savora platformasini taqdim etuvchi yuridik shaxs (2-bo&apos;lim).</dd>
          <dt>Platforma</dt><dd>savora.uz sayti, do&apos;kon kabinetlari, mobil ilova, Telegram bot va mini-ilova.</dd>
          <dt>Mijoz</dt><dd>Platformada ro&apos;yxatdan o&apos;tgan yuridik shaxs, yakka tartibdagi tadbirkor yoki o&apos;zini o&apos;zi band qilgan shaxs (do&apos;kon).</dd>
          <dt>Xodim</dt><dd>Mijoz tomonidan Platformaga login berilgan shaxs.</dd>
          <dt>Xaridor</dt><dd>Mijozning o&apos;z mijozi &mdash; tovar yoki xizmat sotib oluvchi, jumladan nasiyaga oluvchi shaxs.</dd>
          <dt>Tarif</dt><dd>Xizmat hajmi va narxi (filial, xodim, mahsulot soni, modullar).</dd>
        </dl>
      </>
    ),
  },
  {
    id: 'taraflar',
    title: 'Taraflar',
    body: (
      <>
        <p>
          <b>Ijrochi:</b> Savora (yuridik shaxs ma&apos;lumotlari: <Ph>to&apos;liq nomi</Ph>, STIR <Ph>…</Ph>,
          ro&apos;yxatdan o&apos;tgan manzili <Ph>…</Ph>, bank rekvizitlari <Ph>…</Ph>, rahbar <Ph>F.I.Sh.</Ph>).
        </p>
        <p>
          <b>Mijoz:</b> ro&apos;yxatdan o&apos;tish shaklida o&apos;z ma&apos;lumotlarini kiritgan va Ofertani qabul qilgan shaxs.
          Mijoz kiritgan ma&apos;lumotlarning to&apos;g&apos;riligi uchun o&apos;zi javob beradi.
        </p>
      </>
    ),
  },
  {
    id: 'aksept',
    title: 'Ofertani qabul qilish (aksept)',
    body: (
      <>
        <p>Quyidagi harakatlardan biri Ofertani to&apos;liq va so&apos;zsiz qabul qilish hisoblanadi:</p>
        <ul>
          <li>ro&apos;yxatdan o&apos;tish shaklini to&apos;ldirib, shartlarga roziligini belgilash;</li>
          <li>Platformadan sinov yoki pulli tarifda foydalanishni boshlash;</li>
          <li>Tarif uchun to&apos;lovni amalga oshirish.</li>
        </ul>
        <p>Aksept qilingan paytdan boshlab Ijrochi va Mijoz o&apos;rtasida shartnoma yozma shaklda tuzilgan hisoblanadi.</p>
      </>
    ),
  },
  {
    id: 'xizmat',
    title: 'Xizmat tavsifi',
    body: (
      <>
        <p>
          Ijrochi Mijozga obuna asosida (SaaS) savdo, ombor, kassa, nasiya va bo&apos;lib to&apos;lash hisobi,
          qarz daftari, filiallar, xodim huquqlari, hisobotlar, eslatmalar va yordamchi (shu jumladan sun&apos;iy intellekt
          asosidagi) vositalardan foydalanish huquqini beradi.
        </p>
        <p>
          Modullar tarkibi Tarif va biznes turiga qarab belgilanadi. Ijrochi Platformani takomillashtirib boradi;
          asosiy imkoniyatni olib tashlash Mijozga oldindan xabar qilinadi.
        </p>
      </>
    ),
  },
  {
    id: 'sinov',
    title: 'Bepul sinov muddati',
    body: (
      <>
        <p>
          Yangi Mijozga <b>{TRIAL_DAYS} kunlik bepul sinov</b> beriladi. Sinov uchun bank kartasi talab qilinmaydi va
          sinov tugagach hech qanday summa avtomatik yechilmaydi.
        </p>
        <p>
          Sinov tugagach Mijoz Tarifni tanlab to&apos;lov qiladi. To&apos;lov qilinmasa kabinet faqat o&apos;qish rejimiga
          o&apos;tadi yoki cheklanadi, ma&apos;lumotlar esa <Ph>30</Ph> kun davomida saqlanadi (13-bo&apos;lim).
        </p>
      </>
    ),
  },
  {
    id: 'tolov',
    title: 'Tariflar va to\'lov tartibi',
    body: (
      <>
        <ul>
          <li>Amaldagi tariflar va narxlar <Link href="/#tariflar" className="au-link">savora.uz</Link> sahifasida e&apos;lon qilinadi. Individual kelishuv bo&apos;lsa, uning shartlari ustun.</li>
          <li>Obuna oylik yoki yillik davr uchun <b>oldindan</b> to&apos;lanadi. Narxlar so&apos;mda; soliqlar <Ph>QQS bilan / QQSsiz &mdash; Ijrochining soliq rejimiga qarab</Ph>.</li>
          <li>To&apos;lov usullari: bank o&apos;tkazmasi yoki kabinetda ko&apos;rsatilgan rekvizitlarga to&apos;lov va chekni yuklash; <Ph>Payme / Click &mdash; ulanganda</Ph>. To&apos;lov Ijrochi tasdiqlagandan so&apos;ng obuna muddati uzaytiriladi.</li>
          <li>Ijrochi narxlarni o&apos;zgartirishi mumkin; yangi narx kamida <b>30 kun</b> oldin xabar qilinadi va allaqachon to&apos;langan davrga ta&apos;sir qilmaydi.</li>
          <li>To&apos;langan davr uchun mablag&apos; qaytarilmaydi, Ijrochi aybi bilan xizmat ko&apos;rsatilmagan holatlar bundan mustasno &mdash; bunda foydalanilmagan davr ulushi qaytariladi yoki muddat uzaytiriladi.</li>
          <li>Hisob-faktura va dalolatnoma Mijoz so&apos;rovi bilan <Ph>elektron hujjat aylanishi tizimi orqali</Ph> taqdim etiladi.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'savora-roli',
    title: 'Savora roli: dasturiy vosita, kreditor emas',
    body: (
      <>
        <p className="pp-note">
          Savora &mdash; hisob yuritish uchun dasturiy vosita. Savora kredit, qarz yoki nasiya bermaydi, bank, mikromoliya
          tashkiloti yoki muddatli to&apos;lov xizmati operatori emas.
        </p>
        <ul>
          <li>Xaridor bilan oldi-sotdi, nasiya va bo&apos;lib to&apos;lash shartnomasining tarafi &mdash; <b>Mijoz</b> (sotuvchi va kreditor). Savora bu shartnomaning tarafi emas.</li>
          <li>Xaridorlarning to&apos;lovlari Savora hisobidan o&apos;tmaydi &mdash; to&apos;g&apos;ridan-to&apos;g&apos;ri Mijozga tushadi.</li>
          <li>Mijoz o&apos;z faoliyatida qonunchilikka, jumladan iste&apos;molchilar huquqlarini himoya qilish, fiskal chek va soliq, shaxsiy ma&apos;lumotlar hamda 2027-yil 1-yanvardan kuchga kiradigan muddatli to&apos;lov xizmatlari qoidalariga (PQ-294, 14.08.2026) rioya qilishga o&apos;zi javobgar.</li>
          <li>Platformadagi hisob-kitoblar, limit ogohlantirishlari va namunaviy matnlar yordamchi vosita bo&apos;lib, yuridik yoki soliq maslahati hisoblanmaydi.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'mijoz',
    title: 'Mijozning majburiyatlari',
    body: (
      <ul>
        <li>Ro&apos;yxatdan o&apos;tishda to&apos;g&apos;ri ma&apos;lumot berish va uni dolzarb saqlash.</li>
        <li>Login va parollarni sir saqlash; xodimlarga faqat zarur huquqlarni berish; xodim ketganda loginini o&apos;chirish.</li>
        <li>Xaridorlarning shaxsiy ma&apos;lumotlarini Platformaga kiritishdan oldin qonunda talab qilingan rozilikni olish.</li>
        <li>Xaridorlarga eslatmalarni qonuniy, hurmatli tarzda va ruxsat etilgan vaqtda yuborish; tahdid, haqorat yoki qarzni uchinchi shaxslarga oshkor qilishga yo&apos;l qo&apos;ymaslik.</li>
        <li>Platformadan noqonuniy maqsadlarda foydalanmaslik, uni buzishga, boshqa Mijozlar ma&apos;lumotiga kirishga urinmaslik.</li>
        <li>Tarif uchun o&apos;z vaqtida to&apos;lov qilish.</li>
      </ul>
    ),
  },
  {
    id: 'ijrochi',
    title: 'Ijrochining majburiyatlari',
    body: (
      <ul>
        <li>Platformaning uzluksiz ishlashini ta&apos;minlashga harakat qilish (maqsad &mdash; oyiga <Ph>99%</Ph> ishlash vaqti); rejali texnik ishlarni oldindan e&apos;lon qilish.</li>
        <li>Har bir Mijoz ma&apos;lumotini alohida bazada saqlash, muntazam zaxira nusxa olish va zamonaviy xavfsizlik choralarini qo&apos;llash.</li>
        <li>Mijoz ma&apos;lumotlarini faqat xizmat ko&apos;rsatish uchun ishlatish, uchinchi shaxslarga sotmaslik.</li>
        <li>Telegram va boshqa kanallar orqali ish kunlari <Ph>09:00&ndash;19:00</Ph> texnik yordam ko&apos;rsatish.</li>
        <li>Ma&apos;lumotlar xavfsizligi buzilganda Mijozni kechiktirmasdan xabardor qilish.</li>
      </ul>
    ),
  },
  {
    id: 'malumot',
    title: 'Ma\'lumotlarga ishlov berish',
    body: (
      <>
        <p>
          Mijoz Platformaga kiritgan ma&apos;lumotlar (mahsulotlar, sotuvlar, Xaridorlar, to&apos;lovlar) <b>Mijozga tegishli</b>.
          Xaridorlarning shaxsiy ma&apos;lumotlari bo&apos;yicha Mijoz &mdash; ma&apos;lumotlar <b>mulkdori</b>, Ijrochi esa Mijoz
          topshirig&apos;i asosida ishlov beruvchi <b>operator</b>.
        </p>
        <ul>
          <li>Ijrochi bu ma&apos;lumotlarga faqat xizmat ko&apos;rsatish, texnik yordam (Mijoz so&apos;rovi bilan) va qonun talabi bilan ishlov beradi.</li>
          <li>Umumlashtirilgan, shaxsni aniqlab bo&apos;lmaydigan statistika Platformani yaxshilash uchun ishlatilishi mumkin.</li>
          <li>Batafsil tartib &mdash; <Link href="/privacy" className="au-link">Maxfiylik siyosati</Link>da. U Ofertaning ajralmas qismi.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'mulk',
    title: 'Intellektual mulk',
    body: (
      <p>
        Platforma, uning dasturiy kodi, dizayni va &laquo;Savora&raquo; belgisi Ijrochiga tegishli. Mijozga obuna davrida
        Platformadan foydalanishning mutlaq bo&apos;lmagan huquqi beriladi. Kodni nusxalash, qayta sotish yoki teskari
        muhandislik qilish taqiqlanadi.
      </p>
    ),
  },
  {
    id: 'javobgarlik',
    title: 'Javobgarlik chegarasi',
    body: (
      <ul>
        <li>Platforma &laquo;boricha&raquo; taqdim etiladi; Ijrochi Mijozning tijorat natijasini (savdo hajmi, qarz undirilishi) kafolatlamaydi.</li>
        <li>Ijrochi Mijozning boy berilgan foydasi va bilvosita zararlari uchun javob bermaydi.</li>
        <li>Ijrochining umumiy javobgarligi zarar yetgan oydan oldingi <b>3 oy</b> davomida Mijoz to&apos;lagan obuna summasi bilan cheklanadi, qonunda boshqacha belgilangan hollar bundan mustasno.</li>
        <li>Xaridor bilan nizolar, nasiya shartnomasi shartlari va ularning qonuniyligi uchun Mijoz javob beradi.</li>
        <li>Fors-major (tabiiy ofat, aloqa va elektr ta&apos;minotidagi uzilishlar, davlat organlari qarorlari) holatlarida taraflar javobgarlikdan ozod etiladi.</li>
      </ul>
    ),
  },
  {
    id: 'bekor',
    title: 'Muddat va bekor qilish',
    body: (
      <ul>
        <li>Shartnoma aksept qilingan kundan boshlab muddatsiz amal qiladi va obuna to&apos;lovi bilan uzaytirib boriladi.</li>
        <li>Mijoz istalgan vaqtda obunani to&apos;xtatishi mumkin &mdash; buning uchun yordam xizmatiga yozadi yoki keyingi davr uchun to&apos;lov qilmaydi.</li>
        <li>Ijrochi Mijoz to&apos;lov qilmasa, Ofertani qo&apos;pol buzsa yoki Platformadan noqonuniy foydalansa, xabar berib kirishni cheklashi yoki shartnomani bekor qilishi mumkin.</li>
        <li>Shartnoma tugagach ma&apos;lumotlar <Ph>30</Ph> kun saqlanadi: shu muddatda Mijoz ularni eksport qilishi yoki obunani tiklashi mumkin. Keyin ma&apos;lumotlar o&apos;chiriladi, zaxira nusxalardan esa <Ph>90</Ph> kun ichida yo&apos;qoladi.</li>
      </ul>
    ),
  },
  {
    id: 'eksport',
    title: 'Ma\'lumotlarni eksport qilish va o\'chirish',
    body: (
      <ul>
        <li>Mijoz mahsulot va sotuv ro&apos;yxatlarini kabinetdan CSV ko&apos;rinishida yuklab olishi mumkin (tarifga bog&apos;liq).</li>
        <li>So&apos;rov bo&apos;yicha Ijrochi Mijozning barcha ma&apos;lumotlari nusxasini <Ph>10</Ph> ish kuni ichida mashinada o&apos;qiladigan formatda beradi.</li>
        <li>Mijoz yozma so&apos;rovi bilan ma&apos;lumotlar muddatidan oldin o&apos;chiriladi, qonun saqlashni talab qiladigan yozuvlar (masalan, to&apos;lov hujjatlari) bundan mustasno.</li>
      </ul>
    ),
  },
  {
    id: 'ozgartirish',
    title: 'Ofertaga o\'zgartirish kiritish',
    body: (
      <p>
        Ijrochi Ofertaga o&apos;zgartirish kiritishi mumkin. Yangi tahrir saytda e&apos;lon qilinadi va muhim o&apos;zgarishlar
        haqida Mijoz kamida <Ph>10</Ph> kun oldin kabinet yoki Telegram orqali xabardor qilinadi. Shundan keyin
        Platformadan foydalanishni davom ettirish yangi tahrirga rozilik hisoblanadi.
      </p>
    ),
  },
  {
    id: 'nizolar',
    title: 'Nizolar va qo\'llaniladigan huquq',
    body: (
      <ul>
        <li>Ofertaga O&apos;zbekiston Respublikasi qonunchiligi qo&apos;llaniladi.</li>
        <li>Nizolar avval muzokara yo&apos;li bilan hal qilinadi. Pretenziyaga javob muddati &mdash; <Ph>15</Ph> kalendar kun.</li>
        <li>Kelishuvga erishilmasa, nizo <Ph>Ijrochi joylashgan joydagi vakolatli sud</Ph>da ko&apos;riladi.</li>
      </ul>
    ),
  },
  {
    id: 'rekvizitlar',
    title: 'Ijrochi rekvizitlari',
    body: (
      <dl>
        <dt>Nomi</dt><dd><Ph>yuridik shaxs to&apos;liq nomi</Ph></dd>
        <dt>STIR</dt><dd><Ph>…</Ph></dd>
        <dt>Manzil</dt><dd><Ph>…</Ph></dd>
        <dt>Bank</dt><dd><Ph>bank nomi, h/r, MFO</Ph></dd>
        <dt>Aloqa</dt><dd><Link href="/contact" className="au-link">Bog&apos;lanish sahifasi</Link></dd>
      </dl>
    ),
  },
];

export default async function TermsPage() {
  const d = await getDict();
  return (
    <LegalDoc
      title={d.landing.legal.termsTitle}
      lead={d.landing.legal.termsLead}
      sections={SECTIONS}
    />
  );
}
