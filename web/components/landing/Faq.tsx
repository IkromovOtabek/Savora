'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';

/** Tarif chegarasi — FAQ'dagi «Necha filial va xodim» javobi uchun (matn client'da, o'z tilida yig'iladi) */
export interface FaqPlanLimit { label: string; maxFilial: number; maxUsers: number }

export default function Faq({ trialDays, plans }: { trialDays: number; plans: FaqPlanLimit[] }) {
  const d = useDict();
  const L = d.landing;
  const [open, setOpen] = useState<number | null>(0);

  const lim = (n: number, unit: string) => (n >= 999 ? tr(L.plans.unlimited, { unit }) : `${n} ${unit}`);
  const limits = plans.map((p) => `${p.label} — ${lim(p.maxFilial, L.plans.unitBranch)} / ${lim(p.maxUsers, L.plans.unitUsers)}`).join(', ');
  const faqs = L.faq.items.map((f) => ({ q: f.q, a: tr(f.a, { days: trialDays, limits }) }));

  return (
    <section className="section section--soft" id="faq">
      <div className="container">
        <div className="head">
          <span className="eyebrow">{L.faq.eyebrow}</span>
          <h2>{L.faq.title}</h2>
          <p>{L.faq.leadBefore}<Link href="/help" className="lp-inl">{L.faq.leadLink}</Link>{L.faq.leadAfter}</p>
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
