'use client';

import { PAY_METHODS, type PayMethod } from '@/lib/payMethods';
import { useDict } from '@/lib/i18n/client';

/** To'lov usuli tanlovi (Naqd / UzCard / HUMO / Click / Payme); `name` berilsa — forma uchun yashirin maydon */
export default function PayMethodPicker({ value, onChange, disabled, name }: {
  value: PayMethod;
  onChange: (m: PayMethod) => void;
  disabled?: boolean;
  name?: string;
}) {
  const d = useDict();
  const labelId = `${name ?? 'pm'}-pick-l`;
  return (
    <div className="auth-field sl-pm">
      <span id={labelId} className="sl-pm-l">{d.sales.payForm.method}</span>
      {name && <input type="hidden" name={name} value={value} />}
      <div className="sl-payform-quick" role="group" aria-labelledby={labelId}>
        {PAY_METHODS.map((m) => (
          <button key={m} type="button" className="sl-quick" aria-pressed={value === m} onClick={() => onChange(m)} disabled={disabled}>
            {d.sales.payMethods[m]}
          </button>
        ))}
      </div>
    </div>
  );
}
