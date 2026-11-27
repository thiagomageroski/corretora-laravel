import { describe, expect, it } from 'vitest';
import { easeInOutCubic, samePageSection, scrollDuration } from './smoothScroll';

describe('smooth scroll', () => {
    it('eases in and out, starting and ending exactly', () => {
        expect(easeInOutCubic(0)).toBe(0);
        expect(easeInOutCubic(1)).toBe(1);
        expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
        expect(easeInOutCubic(0.1)).toBeLessThan(0.1);
        expect(easeInOutCubic(0.9)).toBeGreaterThan(0.9);
        expect(easeInOutCubic(2)).toBe(1);
    });

    it('keeps the duration between a quick glide and about a second', () => {
        expect(scrollDuration(100)).toBe(650);
        expect(scrollDuration(-1600)).toBe(960);
        expect(scrollDuration(9000)).toBe(1200);
    });

    it('recognises links to sections of the page being shown', () => {
        expect(samePageSection('#ativos', '/')).toBe('ativos');
        expect(samePageSection('/#ativos', '/')).toBe('ativos');
        expect(samePageSection('/#ativos', '/termos')).toBeNull();
        expect(samePageSection('/riscos', '/')).toBeNull();
        expect(samePageSection('https://example.com/#x', '/')).toBeNull();
    });
});
