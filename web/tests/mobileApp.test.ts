import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { httpsUrl, stableUrl, localApk, mobileDownloadLinks, parseRange, APK_FILE_NAME } from '@/lib/mobileApp';
import { GET as androidGET, HEAD as androidHEAD } from '@/app/download/android/route';
import { GET as iosGET } from '@/app/download/ios/route';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'savora-dl-'));
  vi.stubEnv('MOBILE_DOWNLOADS_DIR', '');
  vi.stubEnv('MOBILE_ANDROID_URL', '');
  vi.stubEnv('MOBILE_IOS_URL', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

const req = (p: string, headers: Record<string, string> = {}) => new Request(`http://127.0.0.1:3001${p}`, { headers });

describe('httpsUrl — faqat https havola', () => {
  it('https qabul, boshqasi bo\'sh', () => {
    expect(httpsUrl(' https://testflight.apple.com/join/AbC123 ')).toBe('https://testflight.apple.com/join/AbC123');
    expect(httpsUrl('http://example.com/a.apk')).toBe('');
    expect(httpsUrl('javascript:alert(1)')).toBe('');
    expect(httpsUrl('savora.apk')).toBe('');
    expect(httpsUrl(undefined)).toBe('');
  });
});

describe('stableUrl — EAS artefakti saytga chiqmaydi', () => {
  it('expo.dev/artifacts rad, boshqa https qabul', () => {
    expect(stableUrl('https://expo.dev/artifacts/eas/UeLH-YgWjQjfNc.apk')).toBe('');
    expect(stableUrl('https://play.google.com/store/apps/details?id=uz.savora.app')).toBe('https://play.google.com/store/apps/details?id=uz.savora.app');
    expect(stableUrl('https://testflight.apple.com/join/Ka55rhfs')).toBe('https://testflight.apple.com/join/Ka55rhfs');
    expect(stableUrl('https://expo.dev/accounts/otabekikromov')).toBe('https://expo.dev/accounts/otabekikromov');
  });
});

describe('localApk', () => {
  it('papka yoki fayl yo\'q / bo\'sh fayl — null', () => {
    expect(localApk('')).toBeNull();
    expect(localApk(dir)).toBeNull();
    writeFileSync(path.join(dir, APK_FILE_NAME), '');
    expect(localApk(dir)).toBeNull();
  });

  it('fayl bor — yo\'l va hajm', () => {
    writeFileSync(path.join(dir, APK_FILE_NAME), 'PK\x03\x04data');
    expect(localApk(dir)?.size).toBe(8);
  });
});

describe('parseRange', () => {
  it('sarlavha yo\'q yoki tushunarsiz — butun fayl', () => {
    expect(parseRange(null, 100)).toBeNull();
    expect(parseRange('bytes=-', 100)).toBeNull();
    expect(parseRange('bytes=0-1,5-6', 100)).toBeNull();
  });
  it('oraliqlar', () => {
    expect(parseRange('bytes=10-', 100)).toEqual({ start: 10, end: 99 });
    expect(parseRange('bytes=10-19', 100)).toEqual({ start: 10, end: 19 });
    expect(parseRange('bytes=90-500', 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange('bytes=-30', 100)).toEqual({ start: 70, end: 99 });
  });
  it('fayl tashqarisi — invalid', () => {
    expect(parseRange('bytes=100-', 100)).toBe('invalid');
    expect(parseRange('bytes=20-10', 100)).toBe('invalid');
  });
});

describe('mobileDownloadLinks — landing tugmalari', () => {
  it('manba yo\'q — ikkalasi «Tez kunda»', () => {
    expect(mobileDownloadLinks()).toEqual({ android: '', ios: '' });
  });
  it('env\'da eskirgan EAS havolasi qolsa ham tugma ochilmaydi', () => {
    vi.stubEnv('MOBILE_ANDROID_URL', 'https://expo.dev/artifacts/eas/UeLH-YgWjQjfNc.apk');
    expect(mobileDownloadLinks().android).toBe('');
  });
  it('APK fayl va iOS havola bor — barqaror ichki yo\'llar', () => {
    writeFileSync(path.join(dir, APK_FILE_NAME), 'PK');
    vi.stubEnv('MOBILE_DOWNLOADS_DIR', dir);
    vi.stubEnv('MOBILE_IOS_URL', 'https://testflight.apple.com/join/AbC123');
    expect(mobileDownloadLinks()).toEqual({ android: '/download/android', ios: '/download/ios' });
  });
});

describe('/download/android', () => {
  it('manba yo\'q — nisbiy /#ilova ga', () => {
    const res = androidGET(req('/download/android'));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/#ilova');
  });

  it('fayl yo\'q, tashqi havola bor — o\'shanga', () => {
    vi.stubEnv('MOBILE_ANDROID_URL', 'https://play.google.com/store/apps/details?id=uz.savora.app');
    const res = androidGET(req('/download/android'));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://play.google.com/store/apps/details?id=uz.savora.app');
  });

  it('fayl tashqi havoladan ustun; to\'liq va qisman yuklash', async () => {
    writeFileSync(path.join(dir, APK_FILE_NAME), '0123456789');
    vi.stubEnv('MOBILE_DOWNLOADS_DIR', dir);
    vi.stubEnv('MOBILE_ANDROID_URL', 'https://expo.dev/artifacts/eas/eskirgan.apk');

    const full = androidGET(req('/download/android'));
    expect(full.status).toBe(200);
    expect(full.headers.get('content-type')).toBe('application/vnd.android.package-archive');
    expect(full.headers.get('content-length')).toBe('10');
    expect(full.headers.get('content-disposition')).toContain('Savora.apk');
    expect(await full.text()).toBe('0123456789');

    const part = androidGET(req('/download/android', { range: 'bytes=4-' }));
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe('bytes 4-9/10');
    expect(await part.text()).toBe('456789');

    const bad = androidGET(req('/download/android', { range: 'bytes=50-' }));
    expect(bad.status).toBe(416);

    const head = androidHEAD(req('/download/android'));
    expect(head.status).toBe(200);
    expect(head.headers.get('content-length')).toBe('10');
    expect(head.body).toBeNull();
  });
});

describe('/download/ios', () => {
  it('havola yo\'q — /#ilova; bor — TestFlight', () => {
    expect(iosGET().headers.get('location')).toBe('/#ilova');
    vi.stubEnv('MOBILE_IOS_URL', 'https://testflight.apple.com/join/AbC123');
    const res = iosGET();
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://testflight.apple.com/join/AbC123');
  });
});
