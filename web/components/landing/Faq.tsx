'use client';

import { useState } from 'react';

const FAQS = [
  {
    q: 'Ma\'lumotlarim xavfsizmi?',
    a: 'Ha. Har bir do\'kon o\'z alohida bazasida izolyatsiya qilinadi — boshqa hech kim sizning ma\'lumotingizga kira olmaydi. Ma\'lumotlar muntazam zaxiralanadi va O\'zbekiston serverlarida saqlanadi.',
  },
  {
    q: 'Bepul sinov tugagach pul yechiladimi?',
    a: 'Yo\'q. Ro\'yxatdan o\'tishda karta talab qilinmaydi. 7 kun tugagach o\'zingiz tarif tanlab to\'lovni amalga oshirasiz — avtomatik hech narsa yechilmaydi.',
  },
  {
    q: 'Necha filial va xodim qo\'sha olaman?',
    a: 'Tarifga bog\'liq: Boshlang\'ich — 1 filial / 3 xodim, Pro — 5 filial / 15 xodim, Biznes — cheksiz. Istalgan vaqtda tarifni oshirishingiz mumkin.',
  },
  {
    q: 'Telefondan ishlaydimi?',
    a: 'Ha, Savora to\'liq moslashuvchan (responsive) — telefon, planshet va kompyuterning brauzeridan bir xil ishlaydi. Alohida ilova o\'rnatish shart emas.',
  },
  {
    q: 'Eski ma\'lumotlarimni (Excel) ko\'chira olamanmi?',
    a: 'Ha. Mahsulotlarni Excel/CSV orqali ommaviy import qilish va IMEI ro\'yxatini solishtirish imkoniyati bor. Sozlashda jamoamiz yordam beradi.',
  },
  {
    q: 'Qo\'llab-quvvatlash qanday?',
    a: 'Telegram va telefon orqali tezkor yordam ko\'rsatamiz. Biznes tarifida shaxsiy menejer biriktiriladi.',
  },
];

export default function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="section section--soft" id="faq">
      <div className="container">
        <div className="head">
          <span className="eyebrow">Savollar</span>
          <h2>Ko&apos;p so&apos;raladigan savollar</h2>
          <p>Javobini topa olmadingizmi? Bizga yozing — tez orada javob beramiz.</p>
        </div>
        <div className="faq-list">
          {FAQS.map((f, i) => (
            <div key={f.q} className={`faq-item${open === i ? ' faq-item--open' : ''}`}>
              <button className="faq-q" onClick={() => setOpen(open === i ? null : i)} type="button">
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
