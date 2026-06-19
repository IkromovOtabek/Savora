import mongoose, { Connection, ConnectionStates } from 'mongoose';

/**
 * Bazaviy (klaster) ulanish — master DB ga ishora qiladi.
 * Tenant bazalari shu ulanish ustida `useDb()` orqali ochiladi.
 * Next.js hot-reload uchun global kesh.
 */

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
const MASTER_DB_NAME = process.env.MASTER_DB_NAME || 'savdopro_master';

interface Cache {
  conn: Connection | null;
  promise: Promise<Connection> | null;
}

const globalForDb = global as unknown as { _savdoproDb?: Cache };
const cache: Cache = globalForDb._savdoproDb ?? { conn: null, promise: null };
globalForDb._savdoproDb = cache;

export async function getBaseConnection(): Promise<Connection> {
  if (cache.conn?.readyState === ConnectionStates.connected) {
    return cache.conn;
  }

  // Ulanish uzilgan yoki xato — keshni tozalab qayta ulanamiz
  cache.conn = null;
  cache.promise = null;

  cache.promise = mongoose
    .createConnection(MONGO_URI, {
      dbName: MASTER_DB_NAME,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    })
    .asPromise()
    .catch((err) => {
      cache.promise = null;
      cache.conn = null;
      throw err;
    });

  cache.conn = await cache.promise;
  return cache.conn;
}
