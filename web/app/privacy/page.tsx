import PublicPage, { PublicSection } from '@/components/auth/PublicPage';

export const metadata = { title: 'Maxfiylik siyosati — Savora' };

export default function PrivacyPage() {
  return (
    <PublicPage title="Maxfiylik siyosati" lead="Ma'lumotlaringiz qanday saqlanishi va ishlatilishi haqida.">
      <PublicSection title="Ma'lumotlardan foydalanish">
        <p>Savora foydalanuvchi ma&apos;lumotlarini faqat xizmat ko&apos;rsatish uchun ishlatadi. Har bir do&apos;kon ma&apos;lumoti alohida bazada saqlanadi.</p>
      </PublicSection>
      <PublicSection title="Uchinchi shaxslar">
        <p>Shaxsiy ma&apos;lumotlar uchinchi shaxslarga sotilmaydi.</p>
      </PublicSection>
      <PublicSection title="O'chirish">
        <p>Ma&apos;lumotlarni o&apos;chirish uchun platforma egasiga murojaat qiling.</p>
      </PublicSection>
    </PublicPage>
  );
}
