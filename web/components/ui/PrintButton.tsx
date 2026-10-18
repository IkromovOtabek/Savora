'use client';

import Icon from '@/components/icons/Icon';

/** Sahifani chop etish (dalolatnoma, hisobot) */
export default function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" className="btn btn-primary btn-with-icon no-print" onClick={() => window.print()}>
      <Icon name="download" size={16} />{label}
    </button>
  );
}
