import { describe, expect, it } from 'vitest';
import {
    advanceToTime,
    applyTick,
    bucketTime,
    displayedBar,
    easeOutCubic,
    findBarIndex,
    followPosition,
    interpolate,
    isCurrentTick,
    logicalForTime,
    mergeExchangeBars,
    nextClockOffset,
    parseSourceAt,
    visibleExtremes,
    widenPriceRange,
    type LiveBar,
} from './liveChart';

const bar = (overrides: Partial<LiveBar> = {}): LiveBar => ({ time: 60, open: 100, high: 105, low: 95, close: 102, volume: 3, ...overrides });

describe('interpolate', () => {
    it('starts on the old price and ends exactly on the real one', () => {
        expect(interpolate(100, 110, 0)).toBe(100);
        expect(interpolate(100.1, 100.3, 1)).toBe(100.3);
        expect(interpolate(100, 110, 5)).toBe(110);
    });

    it('never leaves the range between the two real prices', () => {
        for (const progress of [0.1, 0.3, 0.5, 0.7, 0.9]) {
            const value = interpolate(100, 90, progress);

            expect(value).toBeLessThanOrEqual(100);
            expect(value).toBeGreaterThanOrEqual(90);
        }
    });

    it('eases out and clamps out-of-range progress', () => {
        expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
        expect(easeOutCubic(-1)).toBe(0);
        expect(easeOutCubic(2)).toBe(1);
    });
});

describe('bucketTime', () => {
    it('aligns to the interval', () => {
        expect(bucketTime(119, 60)).toBe(60);
        expect(bucketTime(120, 60)).toBe(120);
        expect(bucketTime(123, 1)).toBe(123);
    });
});

describe('parseSourceAt', () => {
    it('reads stored UTC timestamps and ISO strings the same way', () => {
        expect(parseSourceAt('2026-11-07 00:24:57.016')).toBe(Date.UTC(2026, 10, 7, 0, 24, 57, 16));
        expect(parseSourceAt('2026-11-07T00:24:57.016Z')).toBe(Date.UTC(2026, 10, 7, 0, 24, 57, 16));
    });
});

describe('nextClockOffset', () => {
    it('adopts the first sample and any fresher one immediately', () => {
        expect(nextClockOffset(null, 500)).toBe(500);
        expect(nextClockOffset(500, 800)).toBe(800);
    });

    it('barely reacts to a tick that was simply delivered late', () => {
        const next = nextClockOffset(500, -500);

        expect(next).toBeLessThan(500);
        expect(next).toBeGreaterThan(470);
    });
});

describe('applyTick', () => {
    it('updates the current bar', () => {
        const bars = [bar()];

        expect(applyTick(bars, 108, 90, 60)).toEqual({ isNewBar: false });
        expect(bars).toHaveLength(1);
        expect(bars[0]).toMatchObject({ close: 108, high: 108, low: 95 });
    });

    it('opens a new bar at the previous close, without inventing volume', () => {
        const bars = [bar()];

        expect(applyTick(bars, 99, 121, 60)).toEqual({ isNewBar: true });
        expect(bars[1]).toEqual({ time: 120, open: 102, high: 102, low: 99, close: 99, volume: null });
    });

    it('adds the traded quantity to the current bar', () => {
        const bars = [bar({ volume: 3 })];

        applyTick(bars, 108, 90, 60, 0.5);

        expect(bars[0].volume).toBe(3.5);
    });

    it('starts a new bar with the quantity traded in it', () => {
        const bars = [bar()];

        applyTick(bars, 99, 121, 60, 0.25);

        expect(bars[1].volume).toBe(0.25);
    });

    it('applies a late tick to the newest bar instead of rewriting history', () => {
        const bars = [bar({ time: 60 }), bar({ time: 120, close: 102, high: 102, low: 102 })];

        expect(applyTick(bars, 103, 70, 60)).toEqual({ isNewBar: false });
        expect(bars[0].close).toBe(102);
        expect(bars[1].close).toBe(103);
    });
});

describe('advanceToTime', () => {
    it('starts a flat bar at the last real price when the period turns', () => {
        const bars = [bar()];

        expect(advanceToTime(bars, 120, 60)).toBe(true);
        expect(bars[1]).toEqual({ time: 120, open: 102, high: 102, low: 102, close: 102, volume: null });
    });

    it('does nothing while the period is still running', () => {
        const bars = [bar()];

        expect(advanceToTime(bars, 119.9, 60)).toBe(false);
        expect(bars).toHaveLength(1);
    });
});

describe('displayedBar', () => {
    it('extends wicks only to prices already shown', () => {
        const real = bar({ high: 110, close: 110 });

        expect(displayedBar(real, 106, 105, 95)).toMatchObject({ close: 106, high: 106, low: 95 });
    });

    it('keeps the real extremes once the animation ends', () => {
        const real = bar({ high: 110, low: 95, close: 110 });

        expect(displayedBar(real, 110, 105, 95)).toMatchObject({ close: 110, high: 110, low: 95 });
    });
});

describe('followPosition', () => {
    it('gains exactly one bar over a period, so the next bar continues without a jump', () => {
        expect(followPosition(8, 60, 60, 60)).toBe(8);
        expect(followPosition(8, 90, 60, 60)).toBe(8.5);
        expect(followPosition(8, 120, 60, 60)).toBe(9);
    });

    it('stays in range when clocks disagree', () => {
        expect(followPosition(8, 50, 60, 60)).toBe(8);
        expect(followPosition(8, 500, 60, 60)).toBe(9);
    });
});

describe('isCurrentTick', () => {
    it('accepts the first quote and newer or equal ones', () => {
        expect(isCurrentTick('2026-11-07 00:00:01.000', undefined)).toBe(true);
        expect(isCurrentTick('2026-11-07 00:00:01.500', '2026-11-07 00:00:01.250')).toBe(true);
        expect(isCurrentTick('2026-11-07 00:00:01.250', '2026-11-07 00:00:01.250')).toBe(true);
    });

    it('rejects a quote older than the one on screen', () => {
        expect(isCurrentTick('2026-11-07 00:00:01.100', '2026-11-07 00:00:01.250')).toBe(false);
    });
});

describe('findBarIndex', () => {
    const bars = [{ time: 60 }, { time: 120 }, { time: 300 }];

    it('finds exact times and rejects anything else', () => {
        expect(findBarIndex(bars, 60)).toBe(0);
        expect(findBarIndex(bars, 300)).toBe(2);
        expect(findBarIndex(bars, 121)).toBe(-1);
        expect(findBarIndex([], 60)).toBe(-1);
    });
});

describe('mergeExchangeBars', () => {
    it('replaces a finished bar with the official one, volume included', () => {
        const bars = [bar({ time: 60, volume: null }), bar({ time: 120 })];
        const official = bar({ time: 60, open: 99, high: 111, low: 90, close: 101, volume: 42 });

        expect(mergeExchangeBars(bars, [official])).toBe(true);
        expect(bars[0]).toEqual(official);
    });

    it('keeps the live close on the newest bar and never narrows its range', () => {
        const bars = [bar({ time: 60, high: 120, low: 95, close: 118 })];

        mergeExchangeBars(bars, [bar({ time: 60, high: 110, low: 90, close: 104, volume: 7 })]);

        expect(bars[0]).toMatchObject({ close: 118, high: 120, low: 90, volume: 7 });
    });

    it('ignores bars the chart does not have and reports no change when equal', () => {
        const bars = [bar({ time: 60 })];

        expect(mergeExchangeBars(bars, [bar({ time: 999 })])).toBe(false);
        expect(mergeExchangeBars(bars, [bar({ time: 60 })])).toBe(false);
        expect(bars).toHaveLength(1);
    });
});

describe('widenPriceRange', () => {
    it('widens a tiny range around its middle', () => {
        const range = widenPriceRange(76038.09, 76038.1, 0.0002);

        expect(range.maxValue - range.minValue).toBeCloseTo(76038.095 * 0.0002, 6);
        expect((range.maxValue + range.minValue) / 2).toBeCloseTo(76038.095, 6);
    });

    it('leaves a range that is already wide enough untouched', () => {
        expect(widenPriceRange(100, 110, 0.0002)).toEqual({ minValue: 100, maxValue: 110 });
    });

    it('keeps a flat range visible', () => {
        const range = widenPriceRange(50, 50, 0.0002);

        expect(range.maxValue).toBeGreaterThan(range.minValue);
    });
});

describe('logicalForTime', () => {
    it('places past and future times around the last bar', () => {
        expect(logicalForTime(120, 10, 60, 60)).toBe(11);
        expect(logicalForTime(30, 10, 60, 60)).toBe(9.5);
    });
});

describe('visibleExtremes', () => {
    const bars = [
        { high: 10, low: 8 },
        { high: 14, low: 9 },
        { high: 12, low: 5 },
        { high: 20, low: 7 },
    ];

    it('finds the highest high and the lowest low in the visible range', () => {
        expect(visibleExtremes(bars, 0, 2)).toEqual({ high: 1, low: 2 });
        expect(visibleExtremes(bars, 0.4, 10)).toEqual({ high: 3, low: 2 });
    });

    it('returns null when nothing is on screen', () => {
        expect(visibleExtremes(bars, 5, 9)).toBeNull();
        expect(visibleExtremes([], 0, 3)).toBeNull();
    });
});
