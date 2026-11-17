'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useDict } from '@/lib/i18n/client';

/** Admin uchun filial tanlash (?branch=<id>); bitta filial bo'lsa ko'rinmaydi */
export default function BranchPicker({ branches, value }: { branches: { id: string; name: string }[]; value: string }) {
  const d = useDict();
  const router = useRouter();
  const pathname = usePathname();
  if (branches.length < 2) return null;
  return (
    <label className="rs-branch no-print">
      <span>{d.common.branch}</span>
      <select className="input" value={value} onChange={(e) => router.push(`${pathname}?branch=${encodeURIComponent(e.target.value)}`)}>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>
    </label>
  );
}
