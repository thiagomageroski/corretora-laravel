import { describe, expect, it } from 'vitest';
import { bollinger, ema, fibonacciLevels, macd, rsi, sma, stochastic } from './indicators';

describe('sma', () => {
    it('averages a sliding window and marks missing history as null', () => {
        expect(sma([1, 2, 3, 4], 2)).toEqual([null, 1.5, 2.5, 3.5]);
    });
});

describe('ema', () => {
    it('seeds with the SMA and then applies the multiplier', () => {
        expect(ema([2, 4, 6, 8], 3)).toEqual([null, null, 4, 6]);
    });

    it('returns only nulls without enough history', () => {
        expect(ema([1], 3)).toEqual([null]);
    });
});

describe('rsi', () => {
    // Published worked example for a 14-period RSI (StockCharts ChartSchool).
    const prices = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28];

    it('matches the published worked example', () => {
        const result = rsi(prices, 14);

        expect(result[13]).toBeNull();
        expect(result[14]).toBeCloseTo(70.46, 0);
    });

    it('is 100 on uninterrupted gains, 0 on uninterrupted losses and 50 when flat', () => {
        expect(rsi([1, 2, 3, 4], 3)[3]).toBe(100);
        expect(rsi([4, 3, 2, 1], 3)[3]).toBe(0);
        expect(rsi([2, 2, 2, 2], 3)[3]).toBe(50);
    });
});

describe('macd', () => {
    it('is the EMA difference, with the signal starting after both are ready', () => {
        const values = Array.from({ length: 40 }, (_, index) => 100 + index);
        const result = macd(values);
        const fast = ema(values, 12)[39] as number;
        const slow = ema(values, 26)[39] as number;

        expect(result.macd[24]).toBeNull();
        expect(result.macd[25]).not.toBeNull();
        expect(result.signal[32]).toBeNull();
        expect(result.signal[33]).not.toBeNull();
        expect(result.macd[39]).toBeCloseTo(fast - slow, 10);
        expect(result.histogram[39]).toBeCloseTo((result.macd[39] as number) - (result.signal[39] as number), 10);
    });

    it('returns only nulls when the history is too short', () => {
        expect(macd([1, 2, 3]).signal).toEqual([null, null, null]);
    });
});

describe('bollinger', () => {
    it('uses the population standard deviation', () => {
        const result = bollinger([2, 4, 4, 4, 5, 5, 7, 9], 8, 2);

        expect(result.middle[7]).toBe(5);
        expect(result.upper[7]).toBe(9);
        expect(result.lower[7]).toBe(1);
        expect(result.upper[6]).toBeNull();
    });
});

describe('stochastic', () => {
    it('places the close inside the recent range', () => {
        const bars = [
            { high: 10, low: 5, close: 7 },
            { high: 12, low: 6, close: 9 },
            { high: 14, low: 8, close: 11 },
        ];

        const { k } = stochastic(bars, 3, 1, 1);

        expect(k[1]).toBeNull();
        expect(k[2]).toBeCloseTo(((11 - 5) / (14 - 5)) * 100, 10);
    });

    it('handles a flat range without dividing by zero', () => {
        const flat = Array.from({ length: 5 }, () => ({ high: 1, low: 1, close: 1 }));

        expect(stochastic(flat, 3, 1, 1).k[4]).toBe(50);
    });
});

describe('fibonacciLevels', () => {
    it('retraces from the end of the move toward its start', () => {
        const levels = fibonacciLevels(100, 200);

        expect(levels[0]).toEqual({ ratio: 0, price: 200 });
        expect(levels.find((level) => level.ratio === 0.5)?.price).toBe(150);
        expect(levels.at(-1)).toEqual({ ratio: 1, price: 100 });
    });
});
