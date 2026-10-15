'use client';

import { useState } from 'react';
import Link from 'next/link';

interface FaqItem { q: string; a: string }

function buildFaqs(trialDays: number, limits: string): FaqItem[] {
  return [
    {
      q: 'Ma\'lumotlarim xavfsizmi?',
      a: 'Ha. Har bir do\'kon alohida bazada izolyatsiya qilinadi — boshqa do\'kon sizning ma\'lumotingizni ko\'ra olmaydi. Parollar shifrlangan, xodimlar faqat ruxsat berilgan bo\'limlarni ko\'radi, zaxira nusxa muntazam olinadi. Ma\'lumot sizniki: istalgan vaqtda eksport qilasiz. Batafsil — Maxfiylik siyosatida.',
    },
    {
      q: '2027-yildagi yangi nasiya qoidalari (PQ-294) menga tegishlimi?',
      a: '1-yanvar 2027 dan nasiya muddati 12 oydan, bitta xarid 250 BHM dan (≈110 mln so\'m) oshmasligi, ustama + komissiya + penya yiliga 50% dan oshmasligi kerak, oldin yopish esa jarimasiz. Choraklik aylanmasi 500 mln so\'mdan oshgan va savdosining yarmi nasiya bo\'lgan do\'konlar Markaziy bank reyestriga kirishi kerak bo\'lishi mumkin. Savora jadval va nasiya ulushini kuzatishga yordam beradi; aniq holatingizni buxgalter yoki yurist bilan tekshiring.',
    },
    {
      q: 'Savora nasiya yoki kredit beradimi?',
      a: 'Yo\'q. Savora — hisob yuritish dasturi. Nasiyani do\'kon o\'zi beradi, to\'lovlar to\'g\'ridan-to\'g\'ri do\'konga tushadi. Biz savdodan komissiya olmaymiz — faqat oylik obuna.',
    },
    {
      q: 'Bepul sinov tugagach pul yechiladimi?',
      a: `Yo'q. Ro'yxatdan o'tishda karta talab qilinmaydi. ${trialDays} kun tugagach o'zingiz tarif tanlab to'lovni amalga oshirasiz — avtomatik hech narsa yechilmaydi, ma'lumotlaringiz saqlanib turadi.`,
    },
    {
      q: 'Necha filial va xodim qo\'sha olaman?',
      a: `Tarifga bog'liq: ${limits}. Istalgan vaqtda tarifni oshirishingiz mumkin.`,
    },
    {
      q: 'Telefondan ishlaydimi?',
      a: 'Ha. Savora telefon, planshet va kompyuter brauzerida bir xil ishlaydi, Telegram mini-ilova orqali parolsiz kirish mumkin. Ega va filial uchun mobil ilova ham tayyorlanmoqda.',
    },
    {
      q: 'Eski ma\'lumotlarimni (Excel, daftar) ko\'chira olamanmi?',
      a: 'Ha. Tovarlar ro\'yxati va qarzdorlarni Excel yoki daftardan ko\'chirishda jamoamiz bepul yordam beradi.',
    },
    {
      q: 'Qo\'llab-quvvatlash qanday?',
      a: 'Telegram va telefon orqali tezkor yordam, Yordam markazida qadamma-qadam qo\'llanmalar. Xodimlaringizni o\'rgatishga ham yordam beramiz.',
    },
  ];
}

export default function Faq({ trialDays, limits }: { trialDays: number; limits: string }) {
  const [open, setOpen] = useState<number | null>(0);
  const faqs = buildFaqs(trialDays, limits);

  return (
    <section className="section section--soft" id="faq">
      <div className="container">
        <div className="head">
          <span className="eyebrow">Savollar</span>
          <h2>Ko&apos;p so&apos;raladigan savollar</h2>
          <p>Javobini topa olmadingizmi? <Link href="/help" className="lp-inl">Yordam markazi</Link>ga qarang yoki bizga yozing.</p>
        </div>
        <div className="faq-list">
          {faqs.map((f, i) => (
            <div key={f.q} className={`faq-item${open === i ? ' faq-item--open' : ''}`}>
              <button className="faq-q" onClick={() => setOpen(open === i ? null : i)} type="button" aria-expanded={open === i}>
                <span>{f.q}</span>
                <span className="faq-icon" aria-hidden="true">+</span>
              </button>
              <div className="faq-a"><p>{f.a}</p></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
