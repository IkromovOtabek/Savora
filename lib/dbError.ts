/** MongoDB ulanish xatolarini aniqlash */
export function isDbConnectionError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; message?: string };
  if (e.name === 'MongooseServerSelectionError') return true;
  if (e.name === 'MongoServerSelectionError') return true;
  if (e.name === 'MongoNetworkError') return true;
  const msg = e.message ?? '';
  return msg.includes('ECONNREFUSED') || msg.includes('failed to connect');
}

export const DB_UNAVAILABLE_MESSAGE =
  "Ma'lumotlar bazasiga ulanib bo'lmadi. MongoDB ishlayotganini tekshiring (mongod) va .env fayldagi MONGO_URI ni ko'ring.";
