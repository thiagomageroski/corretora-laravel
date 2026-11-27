import { describe, expect, it } from 'vitest';
import { isValidCpf, maskCpf } from './cpf';

describe('cpf', () => {
    it('masks while typing and stops at 11 digits', () => {
        expect(maskCpf('529')).toBe('529');
        expect(maskCpf('5299822')).toBe('529.982.2');
        expect(maskCpf('52998224725999')).toBe('529.982.247-25');
    });

    it('accepts valid check digits and rejects typos and repeated digits', () => {
        expect(isValidCpf('529.982.247-25')).toBe(true);
        expect(isValidCpf('529.982.247-24')).toBe(false);
        expect(isValidCpf('111.111.111-11')).toBe(false);
        expect(isValidCpf('5299822')).toBe(false);
    });
});
