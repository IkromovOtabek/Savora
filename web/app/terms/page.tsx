import PublicPage, { PublicSection } from '@/components/auth/PublicPage';

export const metadata = { title: 'Foydalanish shartlari — Savora' };

export default function TermsPage() {
  return (
    <PublicPage title="Foydalanish shartlari" lead="Savora platformasidan foydalanishning asosiy qoidalari.">
      <PublicSection title="Xizmat">
        <p>Savora SaaS platformasi do&apos;konlar uchun obuna asosida taqdim etiladi.</p>
      </PublicSection>
      <PublicSection title="Sinov va to'lov">
        <p>Pulli tariflarda 14 kunlik bepul sinov muddati beriladi. Sinov tugagach, tanlangan tarif bo&apos;yicha to&apos;lov talab qilinadi.</p>
      </PublicSection>
      <PublicSection title="Javobgarlik">
        <p>Platforma &laquo;boricha&raquo; taqdim etiladi. Muhim ma&apos;lumotlar uchun muntazam zaxira nusxa olish tavsiya etiladi.</p>
      </PublicSection>
    </PublicPage>
  );
}
