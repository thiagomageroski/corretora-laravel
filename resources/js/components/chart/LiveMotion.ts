import type { IChartApi, ISeriesApi, SeriesType, UTCTimestamp } from 'lightweight-charts';
import { advanceToTime, applyTick, displayedBar, followPosition, interpolate, nextClockOffset, parseSourceAt, type LiveBar } from '@/lib/liveChart';
import type { Tick } from '@/lib/types';

const DEFAULT_ANIMATION_MS = 250;
const MIN_ANIMATION_MS = 90;
const MAX_ANIMATION_MS = 400;
const FEED_STALE_MS = 15_000;
const MIN_SCROLL_STEP_PX = 0.2;
const LOW_RATE_MS = 1000;
const GO_LIVE_ANIMATION_MS = 500;
/** Quiet time after the last movement before a gesture counts as finished. */
const SETTLE_AFTER_MS = 160;

export const DEFAULT_RIGHT_OFFSET_BARS = 10;

export type FrameInfo = { shownPrice: number; x: number | null; y: number | null; exchangeNowMs: number };

type Options = {
    chart: IChartApi;
    series: () => ISeriesApi<SeriesType> | null;
    bars: () => LiveBar[];
    intervalSeconds: () => number;
    usesClose: () => boolean;
    onNewBar: () => void;
    onFrame: (frame: FrameInfo) => void;
    onFollowChange?: (following: boolean) => void;
};

/**
 * Drives the chart between real ticks: the last price glides to each new real
 * value, flat bars start when their period does, and the time axis slides
 * continuously. It only ever displays prices between two real ones.
 */
export class LiveMotion {
    private animate = true;
    private frameHandle = 0;
    private lowRateTimer = 0;
    private clockOffsetMs: number | null = null;
    private lastSourceAt: string | null = null;
    private lastTickAt = 0;
    private animating = false;
    private animationStart = 0;
    private animationMs = DEFAULT_ANIMATION_MS;
    private from = 0;
    private to = 0;
    private shown = 0;
    private shownHigh = 0;
    private shownLow = 0;
    private following = true;
    private pointerDown = false;
    private settling = false;
    private settleTimer = 0;
    private defaultOffset = DEFAULT_RIGHT_OFFSET_BARS;
    private baseOffset = DEFAULT_RIGHT_OFFSET_BARS;
    private lastScroll = Number.NaN;
    private scrollHoldUntil = 0;
    private paused = false;

    constructor(private options: Options) {}

    /**
     * Freezes live updates while replacement history loads, so ticks cannot be
     * applied to bars from the previous period.
     */
    setPaused(paused: boolean): void {
        this.paused = paused;
    }

    setDefaultOffset(bars: number): void {
        this.defaultOffset = bars;
        this.baseOffset = bars;
        this.lastScroll = Number.NaN;
    }

    start(animate: boolean): void {
        this.animate = animate;
        this.stop();

        if (animate) {
            this.frameHandle = requestAnimationFrame(this.frame);
        } else {
            this.lowRateTimer = window.setInterval(() => this.step(performance.now()), LOW_RATE_MS);
        }
    }

    stop(): void {
        cancelAnimationFrame(this.frameHandle);
        window.clearInterval(this.lowRateTimer);
    }

    /**
     * Call after replacing the series data.
     */
    sync(): void {
        const last = this.options.bars().at(-1);

        this.animating = false;
        this.lastScroll = Number.NaN;

        if (last) {
            this.shown = last.close;
            this.shownHigh = last.high;
            this.shownLow = last.low;
        }

        // Mid-gesture the user owns the axis; older history arriving must not move it.
        if (this.following && !this.pointerDown && !this.settling) {
            this.options.chart.timeScale().scrollToPosition(this.baseOffset + this.currentFraction(), false);
        }
    }

    pushTick(tick: Tick): void {
        const bars = this.options.bars();

        if (this.paused || tick.source_at === this.lastSourceAt || bars.length === 0) return;

        const sourceMs = parseSourceAt(tick.source_at);
        const nowMs = Date.now();
        const sinceLastTick = nowMs - this.lastTickAt;

        this.lastSourceAt = tick.source_at;
        this.lastTickAt = nowMs;
        this.clockOffsetMs = nextClockOffset(this.clockOffsetMs, sourceMs - nowMs);

        const previousLast = bars[bars.length - 1];
        const price = Number(tick.price);
        const { isNewBar } = applyTick(bars, price, Math.floor(sourceMs / 1000), this.options.intervalSeconds(), Number(tick.traded ?? 0));
        const current = bars[bars.length - 1];

        if (isNewBar) {
            this.draw(previousLast);
            this.shown = current.open;
            this.shownHigh = current.open;
            this.shownLow = current.open;
        }

        if (!this.animate) {
            this.draw(current);
            this.shown = price;
            this.shownHigh = current.high;
            this.shownLow = current.low;
        } else {
            this.from = this.shown;
            this.to = price;
            this.animating = true;
            this.animationStart = performance.now();
            this.animationMs = sinceLastTick > 0 && sinceLastTick < MAX_ANIMATION_MS ? Math.max(MIN_ANIMATION_MS, sinceLastTick * 0.8) : DEFAULT_ANIMATION_MS;
        }

        if (isNewBar) {
            this.options.onNewBar();
        }
    }

    /**
     * A finger or button is down on the chart: the user owns the time axis
     * until the gesture, and any inertia after it, has come to rest.
     */
    beginInteraction(): void {
        window.clearTimeout(this.settleTimer);
        this.pointerDown = true;
        this.settling = false;
    }

    /**
     * The pointer was released. Kinetic scrolling may still be moving the
     * chart; following resumes only once it stops.
     */
    endInteraction(): void {
        if (!this.pointerDown) return;

        this.pointerDown = false;
        this.scheduleSettle();
    }

    /**
     * A wheel or trackpad gesture moved or zoomed the chart.
     */
    nudge(): void {
        if (!this.pointerDown) {
            this.scheduleSettle();
        }
    }

    /**
     * The visible range changed. While a gesture is winding down this keeps
     * pushing the settle back, so it lands where the movement really stopped.
     */
    rangeChanged(): void {
        if (this.settling) {
            this.scheduleSettle();
        }
    }

    /**
     * Takes the chart's position, wherever the user left it, as the new resting
     * place: it is never pulled back to a preset offset. Following continues when
     * the live candle is still in view, and stops when it was dragged past the edge.
     */
    settleInteraction(): void {
        window.clearTimeout(this.settleTimer);
        this.settling = false;

        const offset = this.options.chart.timeScale().scrollPosition() - this.currentFraction();
        const following = offset >= 0;

        if (following) {
            this.baseOffset = offset;
        }

        this.lastScroll = Number.NaN;
        this.setFollowing(following);
    }

    dispose(): void {
        this.stop();
        window.clearTimeout(this.settleTimer);
    }

    goLive(): void {
        window.clearTimeout(this.settleTimer);
        this.pointerDown = false;
        this.settling = false;
        this.baseOffset = this.defaultOffset;
        this.scrollHoldUntil = performance.now() + GO_LIVE_ANIMATION_MS;
        this.options.chart.timeScale().scrollToPosition(this.baseOffset + this.currentFraction(), true);
        this.setFollowing(true);
    }

    private scheduleSettle(): void {
        window.clearTimeout(this.settleTimer);
        this.settling = true;
        this.settleTimer = window.setTimeout(() => this.settleInteraction(), SETTLE_AFTER_MS);
    }

    private setFollowing(following: boolean): void {
        if (this.following !== following) {
            this.following = following;
            this.options.onFollowChange?.(following);
        }
    }

    private exchangeNowMs(): number {
        return Date.now() + (this.clockOffsetMs ?? 0);
    }

    private currentFraction(): number {
        const last = this.options.bars().at(-1);

        if (!last) return 0;

        return followPosition(0, this.exchangeNowMs() / 1000, last.time, this.options.intervalSeconds());
    }

    private frame = (now: number): void => {
        this.step(now);
        this.frameHandle = requestAnimationFrame(this.frame);
    };

    private step(now: number): void {
        const bars = this.options.bars();
        const series = this.options.series();

        if (this.paused || bars.length === 0 || !series) return;

        this.startBarIfDue(bars);

        const last = bars[bars.length - 1];

        if (this.animating) {
            const progress = (now - this.animationStart) / this.animationMs;

            this.shown = interpolate(this.from, this.to, progress);

            if (progress >= 1) {
                this.animating = false;
                this.shownHigh = last.high;
                this.shownLow = last.low;
                this.draw(last);
            } else {
                const display = displayedBar(last, this.shown, this.shownHigh, this.shownLow);
                this.shownHigh = display.high;
                this.shownLow = display.low;
                this.draw(display);
            }
        }

        if (this.animate) {
            this.followLatest(now, last);
        }

        const timeScale = this.options.chart.timeScale();

        this.options.onFrame({
            shownPrice: this.shown,
            x: timeScale.timeToCoordinate(last.time as UTCTimestamp),
            y: series.priceToCoordinate(this.shown),
            exchangeNowMs: this.exchangeNowMs(),
        });
    }

    private startBarIfDue(bars: LiveBar[]): void {
        if (this.clockOffsetMs === null || Date.now() - this.lastTickAt > FEED_STALE_MS) return;

        const previousLast = bars[bars.length - 1];

        if (advanceToTime(bars, this.exchangeNowMs() / 1000, this.options.intervalSeconds())) {
            const current = bars[bars.length - 1];

            this.draw(previousLast);
            this.animating = false;
            this.shown = current.close;
            this.shownHigh = current.close;
            this.shownLow = current.close;
            this.draw(current);
            this.options.onNewBar();
        }
    }

    private followLatest(now: number, last: LiveBar): void {
        if (!this.following || this.pointerDown || this.settling || now < this.scrollHoldUntil) return;

        const timeScale = this.options.chart.timeScale();
        const position = followPosition(this.baseOffset, this.exchangeNowMs() / 1000, last.time, this.options.intervalSeconds());
        const barSpacing = timeScale.options().barSpacing;

        if (Number.isNaN(this.lastScroll) || Math.abs(position - this.lastScroll) * barSpacing >= MIN_SCROLL_STEP_PX) {
            timeScale.scrollToPosition(position, false);
            this.lastScroll = position;
        }
    }

    private draw(bar: LiveBar): void {
        const series = this.options.series();
        const time = bar.time as UTCTimestamp;

        series?.update(this.options.usesClose() ? { time, value: bar.close } : { time, open: bar.open, high: bar.high, low: bar.low, close: bar.close });
    }
}
