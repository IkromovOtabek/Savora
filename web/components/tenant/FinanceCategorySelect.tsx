'use client';

import { useState } from 'react';
import SelectAdd from '@/components/ui/SelectAdd';
import { deleteFinanceCategoryAction, quickFinanceCategoryAction, renameFinanceCategoryAction } from '@/app/actions/finance';
import { useDict } from '@/lib/i18n/client';

/**
 * Moliyaviy toifa tanlovi: maydon ichida «+» (yangi toifa), o'ngda tanlanganini tahrirlash/o'chirish.
 * Qiymat — toifa nomi (yozuvlar toifani nomi bilan saqlaydi). Faqat do'kon egasi (server ham tekshiradi).
 */
export default function FinanceCategorySelect({ id, type, categories, value, onChange, placeholder, required, disabled }: {
  id: string;
  type: 'income' | 'expense';
  categories: string[];
  value: string;
  onChange: (name: string) => void;
  /** Bo'sh qiymat matni («Toifasiz»); berilmasa — toifa majburiy */
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const f = useDict().sales.fin;
  const [list, setList] = useState(categories);
  const sorted = (names: string[]) => [...new Set(names)].sort((a, b) => a.localeCompare(b));

  return (
    <SelectAdd
      id={id}
      name="category"
      value={value}
      onChange={onChange}
      options={list.map((n) => ({ value: n, label: n }))}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      addLabel={f.catAdd}
      addPlaceholder={f.catName}
      onAdd={async (name) => {
        const res = await quickFinanceCategoryAction(name, type);
        if (!res.ok) return { error: res.error };
        setList((prev) => sorted([...prev, res.name]));
        return { value: res.name, label: res.name };
      }}
      onRename={async (old, name) => {
        const res = await renameFinanceCategoryAction(old, type, name);
        if (!res.ok) return { error: res.error };
        setList((prev) => sorted(prev.map((n) => (n === old ? res.name : n))));
        return { value: res.name, label: res.name };
      }}
      onRemove={async (name) => {
        const res = await deleteFinanceCategoryAction(name, type);
        if (res.ok) setList((prev) => prev.filter((n) => n !== name));
        return res;
      }}
    />
  );
}
