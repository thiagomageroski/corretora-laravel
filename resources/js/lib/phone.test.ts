import { describe, expect, it } from 'vitest';
import { formatPhone, phoneDigits } from './phone';

describe('phone mask', () => {
    it('masks as the digits are typed', () => {
        expect(formatPhone('4')).toBe('(4');
        expect(formatPhone('47')).toBe('(47');
        expect(formatPhone('479')).toBe('(47) 9');
        expect(formatPhone('479920')).toBe('(47) 9920');
        expect(formatPhone('4799201')).toBe('(47) 9920-1');
    });

    it('formats landlines with 10 digits and mobiles with 11', () => {
        expect(formatPhone('4732012732')).toBe('(47) 3201-2732');
        expect(formatPhone('47992012732')).toBe('(47) 99201-2732');
    });

    it('never goes past 11 digits', () => {
        expect(formatPhone('479920127329999')).toBe('(47) 99201-2732');
        expect(phoneDigits('479920127329999')).toBe('47992012732');
    });

    it('ignores letters and symbols and drops a leading country code', () => {
        expect(formatPhone('(47) 9.9201-2732a')).toBe('(47) 99201-2732');
        expect(formatPhone('+55 11 98888-7777')).toBe('(11) 98888-7777');
    });

    it('lets the field be emptied', () => {
        expect(formatPhone('')).toBe('');
        expect(formatPhone('(')).toBe('');
    });
});
