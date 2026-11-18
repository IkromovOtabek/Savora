'use client';

import { useMemo, useState } from 'react';
import SegmentSwitch from '@/components/ui/SegmentSwitch';
import { useDict } from '@/lib/i18n/client';
import {
  defaultAnswers,
  isQuestionVisible,
  questionViews,
  type AnswerValue,
  type OnboardingAnswers,
  type QuestionView,
} from '@/lib/onboardingQuestions';
import type { BusinessType } from '@/lib/businessTypes';

/**
 * Ro'yxatdan o'tish ustasi — tanlangan biznes turi uchun 2–5 ta savol (lib/onboardingQuestions.ts).
 * Javoblar formaga yashirin `onboarding` maydonida (JSON) ketadi; server (registerAction) zod bilan tekshiradi.
 * Biznes turi o'zgarsa komponent `key` orqali qayta tug'iladi — javoblar standartga qaytadi.
 */
export default function OnboardingQuestions({
  bizType,
  sampleData,
  onSampleData,
  disabled,
}: {
  bizType: BusinessType;
  sampleData: boolean;
  onSampleData: (v: boolean) => void;
  disabled?: boolean;
}) {
  const d = useDict();
  const t = d.onboarding;
  const views = useMemo(() => questionViews(bizType, d), [bizType, d]);
  const [answers, setAnswers] = useState<OnboardingAnswers>(() => defaultAnswers(bizType));
  const set = (key: string, v: AnswerValue) => setAnswers((a) => ({ ...a, [key]: v }));
  const visible = views.filter((q) => isQuestionVisible(q, answers));

  return (
    <fieldset className="rg-set rg-q" aria-describedby="rg-q-lead">
      <legend>{t.title}</legend>
      <p id="rg-q-lead" className="rg-hint rg-q-lead">{t.lead}</p>
      <input type="hidden" name="onboarding" value={JSON.stringify({ answers, sampleData })} />

      <div className="rg-q-list">
        {visible.map((q) => (
          // Tanlov (variantlar uzun) — boshqaruv savol ostida, to'liq kenglikda
          <div key={q.key} className={`rg-q-item${q.kind === 'choice' ? ' rg-q-item--stack' : ''}`}>
            <div className="rg-q-text">
              <span className="rg-q-label" id={`rg-q-${q.key}`}>{q.label}</span>
              {q.hint && <span className="rg-q-hint">{q.hint}</span>}
            </div>
            <div className="rg-q-ctl">
              <Control q={q} value={answers[q.key]} onChange={(v) => set(q.key, v)} disabled={disabled} yes={t.yes} no={t.no} />
            </div>
          </div>
        ))}
      </div>

      <label className="au-consent rg-q-sample" htmlFor="rg-sample">
        <input id="rg-sample" type="checkbox" checked={sampleData} onChange={(e) => onSampleData(e.target.checked)} disabled={disabled} />
        <span><b>{t.sampleData}</b><br />{t.sampleHint}</span>
      </label>
      <p className="rg-hint">{t.planNote}</p>
    </fieldset>
  );
}

function Control({
  q, value, onChange, disabled, yes, no,
}: {
  q: QuestionView;
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue) => void;
  disabled?: boolean;
  yes: string;
  no: string;
}) {
  if (q.kind === 'yesno') {
    return (
      <SegmentSwitch
        options={[{ value: 'yes', label: yes }, { value: 'no', label: no }]}
        value={value === true ? 'yes' : 'no'}
        onChange={(v) => onChange(v === 'yes')}
        label={q.label}
        disabled={disabled}
        className="seg-sw--sm"
      />
    );
  }
  if (q.kind === 'choice' && q.options) {
    // Ko'p variant (sex profili, xizmat turi) — ro'yxat; 2–3 variant — segment tugma
    if (q.options.length > 3) {
      return (
        <select
          className="rg-q-select"
          aria-labelledby={`rg-q-${q.key}`}
          value={String(value ?? q.default)}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        >
          {q.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    }
    return (
      <SegmentSwitch
        options={q.options}
        value={String(value ?? q.default)}
        onChange={onChange}
        label={q.label}
        disabled={disabled}
        className="seg-sw--sm"
      />
    );
  }
  return <NumberInput q={q} value={typeof value === 'number' ? value : Number(q.default)} onChange={onChange} disabled={disabled} />;
}

function NumberInput({ q, value, onChange, disabled }: { q: QuestionView; value: number; onChange: (v: number) => void; disabled?: boolean }) {
  const [text, setText] = useState(String(value));
  const min = q.min ?? 0;
  const max = q.max ?? Number.MAX_SAFE_INTEGER;
  const clamp = (raw: string) => {
    const n = Number(raw.replace(/\s/g, '').replace(',', '.'));
    const v = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : Number(q.default);
    setText(String(v));
    onChange(v);
  };
  return (
    <span className="rg-q-num">
      <input
        type="number"
        inputMode="decimal"
        aria-labelledby={`rg-q-${q.key}`}
        min={min}
        max={max}
        step={q.step ?? 1}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value !== '' && Number.isFinite(n) && n >= min && n <= max) onChange(n);
        }}
        onBlur={(e) => clamp(e.target.value)}
        disabled={disabled}
      />
      {q.suffix && <span aria-hidden="true">{q.suffix}</span>}
    </span>
  );
}
