import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';

/**
 * Push bildirishnomalar: ruxsat, Expo push token va serverga yozish (POST /api/mobile/push).
 * Server xabarni Expo orqali yuboradi (web/lib/push.ts); ovoz — iOS'da standart,
 * Android'da shu yerda yaratiladigan «Savora» kanali orqali.
 */

/** Android kanal — web/lib/push.ts dagi PUSH_CHANNEL_ID bilan bir xil bo'lishi shart */
export const PUSH_CHANNEL_ID = 'savora';
const TOKEN_KEY = 'savora_push_token';

/** Bosilganda ochilishi mumkin bo'lgan ekranlar (server `data.url` yuboradi) */
const ALLOWED_URLS = ['/shifts', '/(tabs)/nasiya', '/(tabs)/sales', '/daftar'] as const;
export type PushUrl = (typeof ALLOWED_URLS)[number];

export function pushUrlOf(data: unknown): PushUrl | null {
  const url = (data as { url?: unknown } | null | undefined)?.url;
  return typeof url === 'string' && (ALLOWED_URLS as readonly string[]).includes(url) ? (url as PushUrl) : null;
}

// Ilova ochiq turganda ham: banner + ovoz
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Android 8+: ovoz va muhimlik kanalda belgilanadi (keyin dasturdan o'zgartirib bo'lmaydi) */
async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
    name: 'Savora',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    enableVibrate: true,
    vibrationPattern: [0, 250, 150, 250],
    lightColor: '#1A5FE0',
  });
}

export type PushStatus = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export async function getPushStatus(): Promise<PushStatus> {
  if (!Device.isDevice) return 'unsupported';
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted' || status === 'denied' ? status : 'undetermined';
  } catch {
    return 'unsupported';
  }
}

/**
 * Ruxsat (kerak bo'lsa so'raydi), token va serverga yozish. Xato bo'lsa jim —
 * push majburiy emas, ilova ishlashda davom etadi. Har ochilishda chaqirish xavfsiz.
 */
export async function registerForPush(): Promise<PushStatus> {
  if (!Device.isDevice) return 'unsupported';
  try {
    // Android 13+: ruxsat oynasi kanal bo'lgandagina chiqadi
    await ensureChannel();
    const current = await Notifications.getPermissionsAsync();
    let status = current.status;
    if (status !== 'granted' && current.canAskAgain) {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return status === 'denied' ? 'denied' : 'undetermined';

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api('/api/mobile/push', {
      method: 'POST',
      body: { token, platform: Platform.OS === 'ios' ? 'ios' : 'android' },
    });
    await AsyncStorage.setItem(TOKEN_KEY, token);
    return 'granted';
  } catch {
    return getPushStatus();
  }
}

/** Chiqishda (token hali amal qilayotganda chaqiring): bu telefonga endi push bormaydi */
export async function unregisterPush(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) return;
    await AsyncStorage.removeItem(TOKEN_KEY);
    await api('/api/mobile/push', { method: 'DELETE', body: { token }, timeoutMs: 4000 });
  } catch {
    // Internet yo'q — server keyingi kirgan foydalanuvchiga tokenni o'tkazadi
  }
}
