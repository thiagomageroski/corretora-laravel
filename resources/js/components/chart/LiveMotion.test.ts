import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IChartApi } from 'lightweight-charts';
import { LiveMotion } from './LiveMotion';

/** A time axis that only remembers where it was scrolled to. */
function fakeChart(initialPosition: number) {
    const state = { position: initialPosition, scrolls: [] as number[] };
    const timeScale = {
        scrollPosition: () => state.position,
        scrollToPosition: (position: number) => {
            state.position = position;
            state.scrolls.push(position);
        },
        options: () => ({ barSpacing: 7 }),
        timeToCoordinate: () => 0,
    };

    return { state, chart: { timeScale: () => timeScale } as unknown as IChartApi };
}

function motionFor(chart: IChartApi, onFollowChange: (following: boolean) => void = () => undefined) {
    // The live bar opened exactly now, so the candle's progress adds nothing to the position.
    const now = Date.now() / 1000;

    return new LiveMotion({
        chart,
        series: () => null,
        bars: () => [{ time: now, open: 1, high: 1, low: 1, close: 1, volume: null }],
        intervalSeconds: () => 60,
        usesClose: () => false,
        onNewBar: () => undefined,
        onFrame: () => undefined,
        onFollowChange,
    });
}

describe('LiveMotion gestures', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('window', globalThis);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it('keeps the chart wherever a drag left it, however far into the future', () => {
        const { state, chart } = fakeChart(10);
        const motion = motionFor(chart);

        motion.beginInteraction();
        state.position = 140;
        motion.endInteraction();
        vi.advanceTimersByTime(500);
        motion.sync();

        expect(state.position).toBeCloseTo(140, 1);
    });

    it('waits for inertia to stop before settling', () => {
        const { state, chart } = fakeChart(10);
        const followChanges: boolean[] = [];
        const motion = motionFor(chart, (following) => followChanges.push(following));

        motion.beginInteraction();
        motion.endInteraction();

        // The flick keeps carrying the chart into the past after the pointer is up.
        for (let step = 0; step < 10; step++) {
            vi.advanceTimersByTime(100);
            state.position -= 2;
            motion.rangeChanged();
        }

        expect(followChanges).toEqual([]);

        vi.advanceTimersByTime(200);

        expect(followChanges).toEqual([false]);
    });

    it('does not move the axis while a gesture is still in progress', () => {
        const { state, chart } = fakeChart(10);
        const motion = motionFor(chart);

        motion.beginInteraction();
        state.position = 35;
        motion.sync();

        expect(state.scrolls).toEqual([]);
        expect(state.position).toBe(35);
    });

    it('stops following once the live candle is dragged past the right edge', () => {
        const { state, chart } = fakeChart(10);
        const followChanges: boolean[] = [];
        const motion = motionFor(chart, (following) => followChanges.push(following));

        motion.beginInteraction();
        state.position = -20;
        motion.endInteraction();
        vi.advanceTimersByTime(500);

        expect(followChanges).toEqual([false]);
    });
});
