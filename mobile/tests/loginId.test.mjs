// Yagona kirish katagi «Telefon raqam yoki login» (lib/phone.ts → loginIdKind) — sof funksiya testi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loginIdKind } from '../lib/phone.ts';

test('to\'liq O\'zbekiston raqami — telefon (har xil yozuvda)', () => {
  for (const v of ['+998 90 123 45 67', '998901234567', '901234567', ' 90-123-45-67 ', '(90) 123 45 67']) {
    assert.deepEqual(loginIdKind(v), { kind: 'phone', phone: '+998901234567', login: v.replace(/\D/g, '') }, v);
  }
});

test('harfli matn — biznes logini (kichik harf, bo\'sh joysiz)', () => {
  assert.deepEqual(loginIdKind('Jasur_Shop'), { kind: 'login', login: 'jasur_shop' });
  assert.deepEqual(loginIdKind('  rami  '), { kind: 'login', login: 'rami' });
});

test('faqat raqamli qisqa login va noto\'g\'ri telefon', () => {
  assert.deepEqual(loginIdKind('12345'), { kind: 'login', login: '12345' });
  assert.equal(loginIdKind('+998 90 12'), null);
  assert.equal(loginIdKind('+7 916 123 45 67'), null);
  assert.equal(loginIdKind(''), null);
  assert.equal(loginIdKind('   '), null);
});
