/**
 * Pure helpers behind the chart's live motion. Interpolation only ever moves
 * between two real prices and always ends exactly on the real one.
 */
export type LiveBar = { time: number; open: number; high: number; low: number; close: number; volume: number | null };

export function easeOutCubic(progress: number): number {
    const clamped = Math.min(1, Math.max(0, progress));

    return 1 - (1 - clamped) ** 3;
}

export function interpolate(from: number, to: number, progress: number): number {
    return progress >= 1 ? to : from + (to - from) * easeOutCubic(progress);
}

export function bucketTime(unixSeconds: number, intervalSeconds: number): number {
    return Math.floor(unixSeconds / intervalSeconds) * intervalSeconds;
}

export function parseSourceAt(sourceAt: string): number {
    const normalized = sourceAt.includes('T') ? sourceAt : `${sourceAt.replace(' ', 'T')}Z`;

    return new Date(normalized).getTime();
}

/**
 * Estimates exchange time minus local time. Delivery delay only ever makes a
 * tick look older, so the highest offset seen is the best one; it decays slowly
 * to follow real clock drift.
 */
export function nextClockOffset(previous: number | null, sample: number): number {
    if (previous === null || sample > previous) {
        return sample;
    }

    return previous + (sample - previous) * 0.02;
}

/**
 * Applies a real tick to the series. A late tick updates the newest bar instead
 * of rewriting history the chart has already moved past.
 */
export function applyTick(bars: LiveBar[], price: number, tickSeconds: number, intervalSeconds: number, traded = 0): { isNewBar: boolean } {
    const last = bars[bars.length - 1];
    const bucket = bucketTime(tickSeconds, intervalSeconds);

    if (bucket > last.time) {
        bars.push({ time: bucket, open: last.close, high: Math.max(last.close, price), low: Math.min(last.close, price), close: price, volume: traded > 0 ? traded : null });

        return { isNewBar: true };
    }

    last.high = Math.max(last.high, price);
    last.low = Math.min(last.low, price);
    last.close = price;

    if (traded > 0) {
        last.volume = (last.volume ?? 0) + traded;
    }

    return { isNewBar: false };
}

/**
 * Starts a flat bar when its time arrives with no trades yet, carrying the last
 * price. Binance publishes idle seconds the same way.
 */
export function advanceToTime(bars: LiveBar[], nowSeconds: number, intervalSeconds: number): boolean {
    const last = bars[bars.length - 1];
    const bucket = bucketTime(nowSeconds, intervalSeconds);

    if (bucket <= last.time) {
        return false;
    }

    bars.push({ time: bucket, open: last.close, high: last.close, low: last.close, close: last.close, volume: null });

    return true;
}

/**
 * The bar shown during interpolation: wicks only reach prices already displayed.
 */
export function displayedBar(real: LiveBar, shownClose: number, baseHigh: number, baseLow: number): LiveBar {
    return { ...real, high: Math.max(baseHigh, shownClose), low: Math.min(baseLow, shownClose), close: shownClose };
}

/**
 * Scroll position that slides the newest bar left as its period elapses. It
 * reaches one full bar exactly when the next bar starts, so the motion has no jump.
 */
export function followPosition(baseOffset: number, nowSeconds: number, barTime: number, intervalSeconds: number): number {
    const elapsed = (nowSeconds - barTime) / intervalSeconds;

    return baseOffset + Math.min(1, Math.max(0, elapsed));
}

/**
 * Whether a quote is at least as recent as the one on screen. Batches can arrive
 * out of order, and an older quote must never move the price backwards.
 */
export function isCurrentTick(incomingSourceAt: string, currentSourceAt: string | undefined): boolean {
    return currentSourceAt === undefined || parseSourceAt(incomingSourceAt) >= parseSourceAt(currentSourceAt);
}

/**
 * Position of the bar with exactly this time in a time-sorted list, or -1.
 */
export function findBarIndex(bars: { time: number }[], time: number): number {
    let low = 0;
    let high = bars.length - 1;

    while (low <= high) {
        const middle = (low + high) >> 1;

        if (bars[middle].time === time) return middle;

        if (bars[middle].time < time) {
            low = middle + 1;
        } else {
            high = middle - 1;
        }
    }

    return -1;
}

/**
 * Folds the exchange's official recent bars into the ones built from ticks, which
 * can miss extremes between updates and know no volume. The newest bar keeps its
 * live close, because the exchange's copy is already seconds old.
 *
 * @returns Whether anything changed.
 */
export function mergeExchangeBars(bars: LiveBar[], official: LiveBar[]): boolean {
    let changed = false;

    for (const incoming of official) {
        const index = findBarIndex(bars, incoming.time);

        if (index === -1) continue;

        const bar = bars[index];
        const isNewest = index === bars.length - 1;
        const merged: LiveBar = {
            time: bar.time,
            open: incoming.open,
            high: isNewest ? Math.max(bar.high, incoming.high) : incoming.high,
            low: isNewest ? Math.min(bar.low, incoming.low) : incoming.low,
            close: isNewest ? bar.close : incoming.close,
            volume: isNewest && bar.volume !== null && incoming.volume !== null ? Math.max(bar.volume, incoming.volume) : incoming.volume,
        };

        if (merged.open !== bar.open || merged.high !== bar.high || merged.low !== bar.low || merged.close !== bar.close || merged.volume !== bar.volume) {
            bars[index] = merged;
            changed = true;
        }
    }

    return changed;
}

/**
 * Keeps the price axis from magnifying one-cent ticks into huge swings: the
 * visible range never gets narrower than this fraction of the price.
 */
export function widenPriceRange(minValue: number, maxValue: number, minimumFraction: number): { minValue: number; maxValue: number } {
    const middle = (minValue + maxValue) / 2;
    const minimumSpan = Math.abs(middle) * minimumFraction;

    if (maxValue - minValue >= minimumSpan) {
        return { minValue, maxValue };
    }

    return { minValue: middle - minimumSpan / 2, maxValue: middle + minimumSpan / 2 };
}

/**
 * Horizontal logical position of any time, including future ones such as an expiry.
 */
export function logicalForTime(unixSeconds: number, lastIndex: number, lastBarTime: number, intervalSeconds: number): number {
    return lastIndex + (unixSeconds - lastBarTime) / intervalSeconds;
}

/**
 * Indexes of the highest high and the lowest low among the bars on screen,
 * for the max/min price tags. Null when no bar is visible.
 */
export function visibleExtremes(bars: { high: number; low: number }[], from: number, to: number): { high: number; low: number } | null {
    const first = Math.max(0, Math.ceil(from));
    const last = Math.min(bars.length - 1, Math.floor(to));

    if (last < first) return null;

    let high = first;
    let low = first;

    for (let index = first + 1; index <= last; index++) {
        if (bars[index].high > bars[high].high) high = index;
        if (bars[index].low < bars[low].low) low = index;
    }

    return { high, low };
}
