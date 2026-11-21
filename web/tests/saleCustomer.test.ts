import { describe, expect, it } from 'vitest';
import { isPhoneQuery, nameWords, resolveSaleCustomer, wordPattern } from '@/lib/saleCustomer';

describe('mijoz qidiruvi — so\'rov turi', () => {
  it('3+ raqam va faqat ajratgichlar — telefon bo\'yicha', () => {
    expect(isPhoneQuery('90 123')).toBe(true);
    expect(isPhoneQuery('+998 (90) 12-3')).toBe(true);
    expect(isPhoneQuery('90')).toBe(false);
    expect(isPhoneQuery('Ali 90')).toBe(false);
  });

  it('F.I.O so\'zlari tartibsiz, ko\'pi bilan 4 ta', () => {
    expect(nameWords('  vali   ali ')).toEqual(['vali', 'ali']);
    expect(nameWords('a b c d e')).toHaveLength(4);
  });

  it('apostrof turlari bir-biriga mos, regex belgilar ekranlangan', () => {
    const re = new RegExp(wordPattern("g'ulom"), 'i');
    expect(re.test('Gʻulomov Aziz')).toBe(true);
    expect(re.test('G‘ulomova')).toBe(true);
    expect(new RegExp(wordPattern('a.b'), 'i').test('axb')).toBe(false);
  });
});

/** Customer modelining kerakli qismi (find/findById/findOne/create) — xotirada */
function fakeCustomers(rows: { _id: string; fullName: string; phone: string }[]) {
  const lean = <T>(v: T) => ({ select: () => ({ lean: async () => v }), lean: async () => v });
  const model = {
    findById: (id: string) => lean(rows.find((r) => r._id === id) ?? null),
    findOne: (q: { phone: string }) => lean(rows.find((r) => r.phone === q.phone) ?? null),
    find: () => ({ select: () => ({ limit: () => ({ lean: async () => [] }) }) }),
    create: async (doc: { fullName: string; phone: string }) => {
      const row = { _id: `new${rows.length}`, ...doc };
      rows.push(row);
      return row;
    },
  };
  return { Customer: model as never, rows };
}

describe('resolveSaleCustomer — sotuvda mijoz majburiy', () => {
  it('ism yoki telefon bo\'lmasa — xato', async () => {
    const { Customer } = fakeCustomers([]);
    expect(await resolveSaleCustomer({ Customer }, { name: '', phone: '+998 90 123 45 67' })).toEqual({ ok: false, error: 'nameRequired' });
    expect(await resolveSaleCustomer({ Customer }, { name: 'Ali', phone: ' ' })).toEqual({ ok: false, error: 'phoneRequired' });
    expect(await resolveSaleCustomer({ Customer }, { name: 'Ali', phone: '12345' })).toEqual({ ok: false, error: 'badPhone' });
  });

  it('ro\'yxatdan tanlangan mijoz — o\'sha yozuv (yangisi ochilmaydi)', async () => {
    const { Customer, rows } = fakeCustomers([{ _id: '64b7f0c2a1b2c3d4e5f60718', fullName: 'Aliyev Vali', phone: '+998 90 123 45 67' }]);
    const r = await resolveSaleCustomer({ Customer }, { customerId: '64b7f0c2a1b2c3d4e5f60718', name: 'Aliyev Vali', phone: '' });
    expect(r.ok && r.customer.fullName).toBe('Aliyev Vali');
    expect(rows).toHaveLength(1);
  });

  it('shu telefonli mijoz bor — ismi ustidan yozilmaydi; yo\'q — yangisi ochiladi', async () => {
    const { Customer, rows } = fakeCustomers([{ _id: 'a', fullName: 'Aliyev Vali', phone: '+998 90 123 45 67' }]);
    const same = await resolveSaleCustomer({ Customer }, { name: 'Boshqa ism', phone: '901234567' });
    expect(same.ok && same.customer.fullName).toBe('Aliyev Vali');
    const fresh = await resolveSaleCustomer({ Customer }, { name: 'Karimova Nilufar', phone: '+998 93 555 44 33' });
    expect(fresh.ok && fresh.customer.phone).toBe('+998 93 555 44 33');
    expect(rows).toHaveLength(2);
  });
});
