/**
 * Markazlashtirilgan xato/log qatlami.
 *
 * Hozir: structured console. Keyin Sentry/Logtail ulash uchun shu yerga
 * bitta joydan qo'shiladi (kod o'zgarmaydi). Server action'lardagi `catch`
 * bloklarida `logError(...)` chaqiriladi — xatolar yo'qolmaydi.
 *
 * Sentry ulash (keyingi bosqich):
 *   npm i @sentry/nextjs && SENTRY_DSN=... → bu yerda Sentry.captureException
 */
type Meta = Record<string, unknown>;

function emit(level: 'error' | 'warn' | 'info', msg: string, meta?: Meta) {
  const payload = { level, msg, ts: new Date().toISOString(), ...meta };
  // Hozircha console; production'da JSON struktura log yig'uvchilar uchun qulay
  const line = JSON.stringify(payload);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export function logError(msg: string, err?: unknown, meta?: Meta) {
  const errInfo =
    err instanceof Error ? { error: err.message, stack: err.stack } : err ? { error: String(err) } : {};
  emit('error', msg, { ...meta, ...errInfo });
  // TODO(keyingi bosqich): Sentry.captureException(err, { extra: meta })
}

export function logWarn(msg: string, meta?: Meta) {
  emit('warn', msg, meta);
}

export function logInfo(msg: string, meta?: Meta) {
  emit('info', msg, meta);
}
