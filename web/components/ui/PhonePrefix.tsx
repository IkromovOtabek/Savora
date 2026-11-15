'use client';

import { useEffect } from 'react';
import { formatUzPhoneInput, uzLocalDigits } from '@/lib/phone';

/**
 * Barcha telefon kataklari (`type="tel"` yoki `data-phone`) uchun: bo'sh katakka bosilganda
 * "+998 " o'zi yoziladi; foydalanuvchi o'chirsa — prefiks ham o'chadi (qulflanmaydi).
 * Yozilayotganda raqam «+998 99 000 00 00» ko'rinishiga keltiriladi (niqob, lib/phone).
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

/** Native setter (prototipdan) — React kuzatuvchisini chetlab o'tadi; faqat brauzerda chaqiriladi (SSR'da HTMLInputElement yo'q) */
function setNative(el: HTMLInputElement, v: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, v);
}

/** React boshqaradigan (controlled) katak ham yangilanishi uchun — native setter + input hodisasi */
function setValue(el: HTMLInputElement, v: string) {
  setNative(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function clearBare(el: HTMLInputElement) {
  if (el.value.replace(/\s/g, '') === '+998') setValue(el, '');
}

const isDigit = (c: string) => c >= '0' && c <= '9';
const countDigits = (s: string) => [...s].filter(isDigit).length;

/** `n`-raqamdan keyingi kursor o'rni */
function caretAfterDigits(s: string, n: number): number {
  let c = 0;
  for (let i = 0; i < s.length; i++) {
    if (isDigit(s[i]) && ++c === n) return i + 1;
  }
  return s.length;
}

export default function PhonePrefix() {
  useEffect(() => {
    // Oxirgi niqoblangan qiymat — ajratgich (bo'sh joy) o'chirilganini aniqlash uchun
    const last = new WeakMap<HTMLInputElement, string>();

    const onFocusIn = (e: FocusEvent) => {
      const el = phoneInput(e.target);
      if (!el) return;
      if (el.value.trim() !== '') {
        // Eski erkin formatdagi qiymat — ko'rinishi bir xil bo'lsin
        const f = formatUzPhoneInput(el.value);
        if (f !== el.value && uzLocalDigits(el.value)?.local.length === 9) setValue(el, f);
        last.set(el, el.value);
        return;
      }
      setValue(el, PREFIX);
      last.set(el, PREFIX);
      // Kursor prefiksdan keyin turadi (mobil brauzerlar ba'zan boshiga qo'yadi)
      requestAnimationFrame(() => {
        try { el.setSelectionRange(PREFIX.length, PREFIX.length); } catch { /* qo'llamaydigan brauzer */ }
      });
    };

    // Capture bosqichida — React onChange (document'da, bubble) niqoblangan qiymatni o'qiydi
    const onInput = (e: Event) => {
      const el = phoneInput(e.target);
      if (!el || (e as InputEvent).isComposing) return;
      let raw = el.value;
      let caret = el.selectionStart ?? raw.length;
      const prev = last.get(el) ?? '';
      const type = (e as InputEvent).inputType ?? '';
      // Faqat bo'sh joy o'chirildi (raqamlar o'zgarmadi) — yonidagi raqam ham o'chadi, aks holda
      // niqob bo'sh joyni qaytarib qo'yadi va Backspace «qotib» qoladi
      if (type.startsWith('delete') && raw.length < prev.length && countDigits(raw) === countDigits(prev)) {
        if (type === 'deleteContentForward') {
          const i = [...raw].findIndex((c, j) => j >= caret && isDigit(c));
          if (i >= 0) raw = raw.slice(0, i) + raw.slice(i + 1);
        } else {
          let i = caret - 1;
          while (i >= 0 && !isDigit(raw[i])) i--;
          if (i >= 0) { raw = raw.slice(0, i) + raw.slice(i + 1); caret = i; }
        }
      }
      const formatted = formatUzPhoneInput(raw);
      if (formatted === el.value) { last.set(el, formatted); return; }

      // Kursor: undan oldingi mahalliy raqamlar soni saqlanadi (kod 998 qo'shilgan bo'lsa ham)
      const before = raw.slice(0, caret);
      const parts = uzLocalDigits(raw);
      const localBefore = countDigits(before) - (parts?.hadCode ? 3 : 0);
      setNative(el, formatted);
      last.set(el, formatted);
      if (parts && formatted.startsWith(PREFIX)) {
        const pos = localBefore > 0 ? caretAfterDigits(formatted, localBefore + 3) : Math.min(PREFIX.length, formatted.length);
        try { el.setSelectionRange(pos, pos); } catch { /* e'tiborsiz */ }
      }
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
    document.addEventListener('input', onInput, true);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('submit', onSubmit, true);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('input', onInput, true);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('submit', onSubmit, true);
    };
  }, []);
  return null;
}
