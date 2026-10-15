import Link from 'next/link';
import PublicPage, { PublicSection } from '@/components/auth/PublicPage';

export const metadata = { title: 'Yordam — Savora' };

export default function HelpPage() {
  return (
    <PublicPage title="Yordam" lead="Savora bilan ishlashni boshlash uchun qisqa yo'riqnoma.">
      <PublicSection title="Boshlash">
        <ol>
          <li><Link href="/register" className="au-link">Ro&apos;yxatdan o&apos;ting</Link> — pulli tariflarda 14 kun bepul sinov.</li>
          <li>Do&apos;kon manzilini (slug) tanlang.</li>
          <li>Mahsulot va xodimlarni qo&apos;shing.</li>
          <li>Do&apos;koningiz manzilidan tizimga kiring.</li>
        </ol>
      </PublicSection>

      <PublicSection title="Manzillar">
        <ul>
          <li>Asosiy sayt: <code>savora.uz</code></li>
          <li>Kirish: <code>savora.uz/login</code></li>
          <li>Do&apos;kon: <code>savora.uz/t/&lt;do&apos;kon&gt;/login</code></li>
        </ul>
      </PublicSection>

      <PublicSection title="Savollar">
        <p>
          Savolingiz bo&apos;lsa, <Link href="/contact" className="au-link">Bog&apos;lanish</Link> sahifasi orqali yozing.
        </p>
      </PublicSection>
    </PublicPage>
  );
}
