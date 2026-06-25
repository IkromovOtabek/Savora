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
    return res.ok;
  } catch {
    return false;
  }
}
