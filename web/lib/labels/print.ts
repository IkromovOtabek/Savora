/**
 * Yorliq hujjatini chop etish: yashirin iframe (srcdoc) ichida `print()`. Sahifa joyidan qimirlamaydi,
 * tizim qobig'i (menyu, tugmalar) chop etilmaydi va @page o'lchami faqat yorliqqa qo'llanadi.
 *
 * sandbox: skript YO'Q (allow-scripts berilmagan) — hujjat butunlay statik; allow-same-origin — ota sahifa
 * print() ni chaqira olishi uchun, allow-modals — print oynasi uchun (busiz Chrome print() ni e'tiborsiz qoldiradi).
 */
let current: HTMLIFrameElement | null = null;

export function printLabelDocument(html: string): void {
  current?.remove();
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:600px;height:600px;border:0;opacity:0;pointer-events:none';
  frame.onload = () => {
    const w = frame.contentWindow;
    if (!w) return;
    // Chrome'da print() oyna yopilguncha kutadi, Safari'da — yo'q: iframe keyingi chop etishda olib tashlanadi
    w.addEventListener('afterprint', () => {
      window.setTimeout(() => {
        if (current === frame) {
          frame.remove();
          current = null;
        }
      }, 500);
    }, { once: true });
    w.focus();
    w.print();
  };
  frame.srcdoc = html;
  document.body.appendChild(frame);
  current = frame;
}
