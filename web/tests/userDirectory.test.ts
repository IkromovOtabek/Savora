import { describe, it, expect } from 'vitest';
import { UsernameTakenError } from '@/lib/userDirectory';

describe('UsernameTakenError', () => {
  // Org yaratish va filial yaratish oqimlari `instanceof UsernameTakenError` ga tayanadi —
  // shu shartnoma buzilmasligini qo'riqlaymiz.
  it('Error merosxo\'ri va aniq nomga ega', () => {
    const err = new UsernameTakenError('admin');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('UsernameTakenError');
    expect(err.message).toContain('admin');
  });
});
