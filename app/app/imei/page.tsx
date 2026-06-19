import Link from 'next/link';
import ImeiBulkSearch from '@/components/tenant/ImeiBulkSearch';

export const metadata = { title: 'IMEI qidiruv — Savora' };

export default function ImeiPage() {
  return (
    <>
      <div className="dash-head">
        <div>
          <h1 className="dash-hello">IMEI qidiruv</h1>
          <p className="dash-sub">Bir nechta IMEI ni bir vaqtda tekshiring</p>
        </div>
        <Link href="/api/export/products" className="btn btn-ghost">Ombor CSV</Link>
      </div>
      <ImeiBulkSearch />
    </>
  );
}
