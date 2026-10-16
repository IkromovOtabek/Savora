import { logWarn } from './logger';

/**
 * Telegram HTML parse_mode uchun foydalanuvchi matnini ekranlash.
 * Mahsulot/mijoz/do'kon nomida `<` yoki `&` bo'lsa Telegram 400 qaytarib xabar yetib bormasdi
 * (jumladan parol tiklash kodi); `<a href>` orqali havola injektsiyasi ham yopiladi.
 */
export function tgEscape(v: unknown): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Telegram API xato qaytarganda (400 parse xatosi, 403 bot bloklangan, 429 limit)
 * jimgina `false` o'rniga ogohlantirish yozamiz — chat id va token loglanmaydi,
 * faqat status va javobning qisqartirilgan tanasi.
 */
async function warnTelegramFailure(fn: string, res: Response): Promise<void> {
  let body = '';
  try { body = (await res.text()).slice(0, 200); } catch { /* tana o'qilmasa ham status yetarli */ }
  logWarn(`telegram ${fn} muvaffaqiyatsiz`, { status: res.status, body });
}

/** Telegram bot orqali xabar yuborish (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID) */
export async function sendTelegram(text: string): Promise<boolean> {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) return false;
  return sendTelegramTo(chatId, text);
}

/** Aniq chat ID ga xabar yuborish (do'konning ulangan Telegram'i) */
export async function sendTelegramTo(chatId: string, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return false;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
    if (!res.ok) await warnTelegramFailure('sendMessage', res);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Mini App'ni ochuvchi web_app tugmasi bilan xabar yuborish.
 * Telegram private chat inline web_app tugmasini qo'llab-quvvatlaydi.
 */
export async function sendTelegramWebApp(
  chatId: string,
  text: string,
  buttonText: string,
  webAppUrl: string
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return false;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: buttonText, web_app: { url: webAppUrl } }]] },
      }),
    });
    if (!res.ok) await warnTelegramFailure('sendMessage(web_app)', res);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Doimiy pastki menyu (reply keyboard): "Savora'ni ochish" (web_app) + "Boshlash".
 * Bot ochilganda foydalanuvchi shu tugmalardan foydalanadi.
 */
export async function sendTelegramReplyMenu(
  chatId: string,
  text: string,
  webAppUrl: string
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return false;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        reply_markup: {
          keyboard: [
            [{ text: '🚀 Savora’ni ochish', web_app: { url: webAppUrl } }],
            [{ text: 'Boshlash' }],
          ],
          resize_keyboard: true,
          is_persistent: true,
        },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
