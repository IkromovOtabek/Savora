'use client';

import { useEffect } from 'react';

/**
 * Barcha telefon kataklari (`type="tel"` yoki `data-phone`) uchun: bo'sh katakka bosilganda
 * "+998 " o'zi yoziladi; foydalanuvchi o'chirsa — prefiks ham o'chadi (qulflanmaydi).
 * Katakdan chiqilganda yoki forma yuborilganda faqat "+998" qolgan bo'lsa — katak tozalanadi,
 * shunda `required` tekshiruvi aldanmaydi va bazaga yarim raqam yozilmaydi.
 * Root layout'da bir marta ulanadi — har bir formaga alohida kod kerak emas.
 */
const PREFIX = '+998 ';

function phoneInput(el: EventTarget | null): HTMLInputElement | null {
  if (!(el instanceof HTMLInputElement)) return null;
  if (el.type !== 'tel' && el.dataset.phone === undefined) return null;
  if (el.readOnly || el.disabled || el.dataset.noPrefix !== undefined) return null;
  return el;
}

/** React boshqaradigan (controlled) katak ham yangilanishi uchun — native setter + input hodisasi */
function setValue(el: HTMLInputElement, v: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function clearBare(el: HTMLInputElement) {
  if (el.value.replace(/\s/g, '') === '+998') setValue(el, '');
}

export default function PhonePrefix() {
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const el = phoneInput(e.target);
      if (!el || el.value.trim() !== '') return;
      setValue(el, PREFIX);
      // Kursor prefiksdan keyin turadi (mobil brauzerlar ba'zan boshiga qo'yadi)
      requestAnimationFrame(() => {
        try { el.setSelectionRange(PREFIX.length, PREFIX.length); } catch { /* qo'llamaydigan brauzer */ }
      });
    };
    const onFocusOut = (e: FocusEvent) => {
      const el = phoneInput(e.target);
      if (el) clearBare(el);
    };
    // Enter bilan yuborishda katakdan chiqilmaydi — FormData o'qilishidan oldin tozalaymiz
    const onSubmit = (e: SubmitEvent) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement)) return;
      form.querySelectorAll('input').forEach((input) => {
        const el = phoneInput(input);
        if (el) clearBare(el);
      });
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('submit', onSubmit, true);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('submit', onSubmit, true);
    };
  }, []);
  return null;
}
