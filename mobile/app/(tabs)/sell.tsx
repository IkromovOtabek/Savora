import { Redirect } from 'expo-router';

/** "Sotish" tab'i — bosilganda /sale-new ochiladi (tabPress). Bu ekran faqat zaxira yo'nalish. */
export default function SellTab() {
  return <Redirect href="/sale-new" />;
}
