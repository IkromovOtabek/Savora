'use client';

import { useRouter } from 'next/navigation';

export default function KassaDateFilter({
  initialDate,
  basePath = '/app/kassa',
}: {
  initialDate: string;
  basePath?: string;
}) {
  const router = useRouter();

  return (
    <form
      className="search-bar panel"
      style={{ padding: '16px 20px', marginBottom: 20 }}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const date = String(fd.get('date') || '');
        router.push(`${basePath}?date=${date}`);
      }}
    >
      <div className="imei-search-row">
        <div className="auth-field" style={{ flex: 1, margin: 0, maxWidth: 260 }}>
          <label htmlFor="date">Sana</label>
          <input id="date" name="date" type="date" defaultValue={initialDate} required />
        </div>
        <button type="submit" className="btn btn-primary btn-sm">Ko&apos;rish</button>
      </div>
    </form>
  );
}
