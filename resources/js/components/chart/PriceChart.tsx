import {
    AreaSeries,
    BarSeries,
    CandlestickSeries,
    ColorType,
    createChart,
    CrosshairMode,
    HistogramSeries,
    LineSeries,
    LineStyle,
    PriceScaleMode,
    type AutoscaleInfo,
    type IChartApi,
    type IPriceLine,
    type ISeriesApi,
    type Logical,
    type LogicalRange,
    type MouseEventParams,
    type SeriesType,
    type Time,
    type UTCTimestamp,
} from 'lightweight-charts';
import { ChartArea, ChartCandlestick, ChartLine, ChartNoAxesColumn, Check, ChevronDown, Crosshair, Info, LocateFixed, Maximize2, Minus, PencilLine, Plus, Rows3, Slash, Sigma, Star, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_RIGHT_OFFSET_BARS, LiveMotion, type FrameInfo } from '@/components/chart/LiveMotion';
import { AssetIcon, EmptyState, Logo, Popover } from '@/components/ui';
import { api } from '@/lib/api';
import { CATEGORY_LABELS, formatCents, formatChartTime, formatCountdown, formatDateTime, formatDuration, formatTickMark, priceDecimals, providerLabel, providerName } from '@/lib/format';
import { bollinger, ema, fibonacciLevels, macd, rsi, sma, stochastic, type Series } from '@/lib/indicators';
import { logicalForTime, mergeExchangeBars, widenPriceRange, type LiveBar } from '@/lib/liveChart';
import type { Asset, Candle, CandleResponse, Position, Preferences } from '@/lib/types';
import { useMarket } from '@/stores/market';
import { motionAllowed, usePreferences } from '@/stores/preferences';
import { useTicket } from '@/stores/ticket';

const TIMEFRAMES = [
    { value: '1s', label: '1s', seconds: 1 },
    { value: '1m', label: '1m', seconds: 60 },
    { value: '5m', label: '5m', seconds: 300 },
    { value: '15m', label: '15m', seconds: 900 },
    { value: '30m', label: '30m', seconds: 1800 },
    { value: '1h', label: '1h', seconds: 3600 },
    { value: '4h', label: '4h', seconds: 14400 },
    { value: '1d', label: '1D', seconds: 86400 },
];

const CHART_TYPES: {
    value: Preferences['chart_type'];
    title: string;
    icon: typeof ChartLine;
}[] = [
    { value: 'candles', title: 'Velas', icon: ChartCandlestick },
    { value: 'bars', title: 'Barras', icon: ChartNoAxesColumn },
    { value: 'line', title: 'Linha', icon: ChartLine },
    { value: 'area', title: 'Área', icon: ChartArea },
];

/* Validated categorical slots, in fixed order, against the chart surface. */
const SERIES_1 = '#3987e5';
const SERIES_2 = '#d95926';
const SERIES_3 = '#9085e9';

/* A broker-style surface: near-black, faint grid, borderless axes. */
const SURFACE = '#0b0e13';
const AXIS_BORDER = '#1b212b';
const AXIS_TEXT = '#8b94a3';
const GRID = 'rgba(255,255,255,0.045)';
const UP = '#26b98a';
const DOWN = '#ef5a6f';
const VOLUME_UP = 'rgba(38,185,138,0.35)';
const VOLUME_DOWN = 'rgba(239,90,111,0.35)';
const PRICE_LINE = '#c6f24e';
const LIVE_TAG = '#2f80ed';
const DRAWING = '#5aa9ff';
const GUIDE = '#5d6675';
const CHART_FONT = "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

const INDICATORS: {
    value: string;
    label: string;
    swatch?: string;
    needsVolume?: boolean;
}[] = [
    { value: 'volume', label: 'Volume', needsVolume: true },
    { value: 'sma', label: 'Média móvel 20', swatch: SERIES_1 },
    { value: 'ema', label: 'Média exponencial 50', swatch: SERIES_2 },
    { value: 'bb', label: 'Bandas de Bollinger', swatch: SERIES_3 },
    { value: 'rsi', label: 'RSI 14', swatch: SERIES_1 },
    { value: 'macd', label: 'MACD', swatch: SERIES_1 },
    { value: 'stoch', label: 'Estocástico', swatch: SERIES_1 },
];

const DRAWING_TOOLS = [
    { value: 'hline', label: 'Suporte ou resistência', clicks: 1, icon: Minus },
    { value: 'trend', label: 'Linha de tendência', clicks: 2, icon: Slash },
    { value: 'fib', label: 'Retração de Fibonacci', clicks: 2, icon: Rows3 },
] as const;

type ToolKey = (typeof DRAWING_TOOLS)[number]['value'];
type Anchor = { time: number; price: number };
type Drawing = { tool: ToolKey; anchors: Anchor[] };
type Bar = LiveBar & { time: UTCTimestamp };
type ScaleMode = 'normal' | 'log' | 'percent';

const MINIMUM_PRICE_RANGE_FRACTION = 0.0002;
const LIVE_RIGHT_OFFSET_BARS = 30;
const REFRESH_AFTER_HIDDEN_MS = 30_000;
const INDICATOR_REFRESH_MS = 1000;
const RECONCILE_INTERVAL_MS = 15_000;
const RECONCILE_BAR_COUNT = 3;
/** How many candles each step back in history fetches, and how close to the oldest one the view gets before it does. */
const OLDER_HISTORY_BAR_COUNT = 500;
const OLDER_HISTORY_MARGIN_BARS = 150;
const OLDER_HISTORY_RETRY_MS = 10_000;
const VOLUME_SCALE_ID = 'volume';

const toLine = (bars: Bar[], values: Series) =>
    bars.flatMap((bar, index) => {
        const value = values[index];

        return value === null ? [] : [{ time: bar.time, value }];
    });

const toBar = (candle: Candle): Bar => ({
    time: candle.time as UTCTimestamp,
    open: Number(candle.open),
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close),
    volume: candle.volume === null ? null : Number(candle.volume),
});

function storedDrawings(assetId: number): Drawing[] {
    try {
        return JSON.parse(localStorage.getItem(`drawings:${assetId}`) ?? '[]') as Drawing[];
    } catch {
        return [];
    }
}

function saveDrawings(assetId: number, drawings: Drawing[]): void {
    try {
        localStorage.setItem(`drawings:${assetId}`, JSON.stringify(drawings));
    } catch {
        /* Drawings are a per-viewer convenience; losing them is harmless. */
    }
}

function priceFormatFor(price: number) {
    const precision = priceDecimals(price);

    return { type: 'price' as const, precision, minMove: 1 / 10 ** precision };
}

/** The price on the live tag, with the same decimals as the axis. */
function tagPrice(price: number): string {
    return price.toFixed(priceDecimals(price));
}

/** A square button of the chart's tool rail, opening its own menu. */
function RailButton({ label, active = false, children, menu }: { label: string; active?: boolean; children: ReactNode; menu: (close: () => void) => ReactNode }) {
    return (
        <Popover
            label={label}
            side="right"
            trigger={({ open, toggle }) => (
                <button type="button" title={label} aria-label={label} aria-expanded={open} onClick={toggle} className={`chart-rail-button ${open || active ? 'is-active' : ''}`}>
                    {children}
                </button>
            )}
        >
            {menu}
        </Popover>
    );
}

/**
 * Share of CALL and PUT among the positions the platform's traders opened on
 * this asset in the last day. Shown only with enough positions to mean
 * something; it is never estimated or invented.
 */
function SentimentBar({ assetId }: { assetId: number }) {
    const [callPercent, setCallPercent] = useState<number | null>(null);

    useEffect(() => {
        let alive = true;
        const load = () =>
            api<{ call_percent: number | null }>(`/assets/${assetId}/sentiment`)
                .then((response) => alive && setCallPercent(response.call_percent))
                .catch(() => alive && setCallPercent(null));

        setCallPercent(null);
        void load();
        const timer = window.setInterval(() => !document.hidden && void load(), 30_000);

        return () => {
            alive = false;
            window.clearInterval(timer);
        };
    }, [assetId]);

    if (callPercent === null) return null;

    return (
        <div
            className="pointer-events-auto absolute top-24 bottom-24 left-1.5 z-10 hidden w-9 flex-col items-center text-[9px] font-bold tracking-wide sm:flex"
            title="Operações de CALL e PUT abertas por todos os clientes neste ativo nas últimas 24 horas"
        >
            <span className="text-text-3">COMPRA</span>
            <span className="numeric text-[11px] text-up">{callPercent}%</span>
            <div className="my-1.5 flex w-1.5 flex-1 flex-col overflow-hidden rounded-full bg-ink-800">
                <span className="w-full rounded-t-full bg-up transition-[height] duration-700" style={{ height: `${callPercent}%` }} />
                <span className="w-full flex-1 rounded-b-full bg-down" />
            </div>
            <span className="numeric text-[11px] text-down">{100 - callPercent}%</span>
            <span className="text-text-3">VENDA</span>
        </div>
    );
}

export default function PriceChart({
    asset,
    positions = [],
    onAssetClick,
    assetsOpen = false,
    onToggleFavorite,
}: {
    asset: Asset;
    positions?: Position[];
    /** Opens the asset list (beside the chart on large screens, a tab on phones). */
    onAssetClick?: () => void;
    assetsOpen?: boolean;
    onToggleFavorite?: (asset: Asset) => void;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const priceSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
    const motionRef = useRef<LiveMotion | null>(null);
    const indicatorSeriesRef = useRef<ISeriesApi<SeriesType>[]>([]);
    const indicatorRenderersRef = useRef<(() => void)[]>([]);
    const lastIndicatorRefreshRef = useRef(0);
    const drawingCleanupRef = useRef<(() => void)[]>([]);
    const positionLinesRef = useRef<IPriceLine[]>([]);
    const barsRef = useRef<Bar[]>([]);
    const draftRef = useRef<Anchor[]>([]);
    const dotRef = useRef<HTMLDivElement>(null);
    const barCountdownRef = useRef<HTMLDivElement>(null);
    const priceTagRef = useRef<HTMLDivElement>(null);
    const tradeOpenRef = useRef<HTMLDivElement>(null);
    const tradeCloseRef = useRef<HTMLDivElement>(null);
    const expiryRefs = useRef(
        new Map<
            number,
            {
                line: HTMLDivElement;
                label: HTMLSpanElement;
                entry: HTMLDivElement;
            }
        >(),
    );

    const chartSettings = usePreferences((state) => state.chart);
    const setChartSettings = usePreferences((state) => state.setChart);
    const animationsOn = usePreferences((state) => state.preferences.chart_animations);
    const showPositionLines = usePreferences((state) => state.preferences.chart_position_lines);
    const showStakeLabels = usePreferences((state) => state.preferences.chart_stake_labels);

    const supportsSecondBars = asset.tradable;
    const interval = chartSettings.interval === '1s' && !supportsSecondBars ? '1m' : chartSettings.interval;
    const chartType = chartSettings.type;
    const indicators = useMemo(() => new Set(chartSettings.indicators), [chartSettings.indicators]);
    const seconds = TIMEFRAMES.find((item) => item.value === interval)?.seconds ?? 60;

    const [tool, setTool] = useState<ToolKey | null>(null);
    const [draftPoints, setDraftPoints] = useState(0);
    const [drawings, setDrawings] = useState<Drawing[]>(() => storedDrawings(asset.id));
    const [dataRevision, setDataRevision] = useState(0);
    const [reloadKey, setReloadKey] = useState(0);
    const [scaleMode, setScaleMode] = useState<ScaleMode>('normal');
    const [state, setState] = useState<{
        status: CandleResponse['status'] | 'loading';
        source: string | null;
        message: string | null;
    }>({ status: 'loading', source: null, message: null });

    // Where a trade opened now would close: the expiry chosen in the ticket.
    const ticketDuration = useTicket((state) => state.durationSeconds);
    const defaultDuration = usePreferences((state) => state.preferences.default_duration_seconds);
    const tradeDuration = ticketDuration ?? defaultDuration;
    const tradeDurationRef = useRef(tradeDuration);
    tradeDurationRef.current = tradeDuration;

    const secondsRef = useRef(seconds);
    secondsRef.current = seconds;
    const chartTypeRef = useRef(chartType);
    chartTypeRef.current = chartType;
    const openPositions = useMemo(() => positions.filter((position) => position.asset_id === asset.id && position.result === null), [positions, asset.id]);
    const openPositionsRef = useRef(openPositions);
    openPositionsRef.current = openPositions;

    const usesClose = () => chartTypeRef.current === 'line' || chartTypeRef.current === 'area';

    const refreshIndicators = useCallback(() => {
        lastIndicatorRefreshRef.current = Date.now();
        indicatorRenderersRef.current.forEach((render) => render());
    }, []);

    const onFrame = useCallback((frame: FrameInfo) => {
        const chart = chartRef.current;
        const dot = dotRef.current;

        if (!chart) return;

        const timeScale = chart.timeScale();
        const paneWidth = timeScale.width();
        const paneHeight = chart.panes()[0]?.getHeight() ?? 0;
        const visible = frame.x !== null && frame.y !== null && frame.x >= 0 && frame.x <= paneWidth && frame.y >= 0 && frame.y <= paneHeight;

        if (dot) {
            dot.style.opacity = visible ? '1' : '0';

            if (visible) {
                dot.style.transform = `translate(${frame.x}px, ${frame.y}px)`;
            }
        }

        const lineVisible = frame.y !== null && frame.y >= 0 && frame.y <= paneHeight;
        const priceTag = priceTagRef.current;

        /* The live price tag on the axis follows the animated price, not the last stored one. */
        if (priceTag) {
            priceTag.style.opacity = lineVisible ? '1' : '0';

            if (lineVisible) {
                const text = tagPrice(frame.shownPrice);
                priceTag.style.width = `${chart.priceScale('right').width()}px`;
                priceTag.style.transform = `translate(${paneWidth}px, ${(frame.y as number) - 10}px)`;

                if (priceTag.textContent !== text) {
                    priceTag.textContent = text;
                }
            }
        }

        const barCountdown = barCountdownRef.current;

        if (barCountdown) {
            const last = barsRef.current.at(-1);
            const showsCountdown = last !== undefined && secondsRef.current > 1 && lineVisible;
            barCountdown.style.opacity = showsCountdown ? '1' : '0';

            if (showsCountdown) {
                const text = formatCountdown((last.time + secondsRef.current) * 1000 - frame.exchangeNowMs);
                const x = Math.min((frame.x ?? paneWidth) + 16, paneWidth - 54);
                barCountdown.style.transform = `translate(${x}px, ${(frame.y as number) - 11}px)`;

                if (barCountdown.textContent !== text) {
                    barCountdown.textContent = text;
                }
            }
        }

        const bars = barsRef.current;
        const lastBar = bars.at(-1);

        if (!lastBar) return;

        const barSpacing = timeScale.options().barSpacing;

        /* logicalToCoordinate only accepts whole bars, so the fraction is added by hand. */
        const toX = (unixSeconds: number): number | null => {
            const logical = logicalForTime(unixSeconds, bars.length - 1, lastBar.time, secondsRef.current);
            const wholeBar = Math.floor(logical);
            const x = timeScale.logicalToCoordinate(wholeBar as Logical);

            return x === null ? null : x + (logical - wholeBar) * barSpacing;
        };

        /* Trade window: a trade opened now starts at the first line and is decided at the second. */
        const placeVertical = (node: HTMLDivElement | null, x: number | null) => {
            if (!node) return;

            const visible = x !== null && x >= 0 && x <= paneWidth;
            node.style.opacity = visible ? '1' : '0';

            if (visible) {
                node.style.transform = `translateX(${x}px)`;
                node.style.height = `${paneHeight}px`;
            }
        };
        const nowSeconds = frame.exchangeNowMs / 1000;
        placeVertical(tradeOpenRef.current, toX(nowSeconds));
        const closeX = toX(nowSeconds + tradeDurationRef.current);
        placeVertical(tradeCloseRef.current, closeX);

        /* Near the axis the closing label flips to the other side of its line, below the opening one. */
        const closeLabel = tradeCloseRef.current?.firstElementChild as HTMLElement | null | undefined;

        if (closeLabel && closeX !== null) {
            const flip = closeX > paneWidth - 190;
            closeLabel.style.left = flip ? 'auto' : '8px';
            closeLabel.style.right = flip ? '8px' : 'auto';
            closeLabel.style.top = flip ? '68px' : '48px';
        }

        for (const position of openPositionsRef.current) {
            const nodes = expiryRefs.current.get(position.id);

            if (!nodes) continue;

            const expiresAt = new Date(position.expires_at).getTime();
            const expiryX = toX(expiresAt / 1000);
            const expiryVisible = expiryX !== null && expiryX >= 0;

            nodes.line.style.opacity = expiryVisible ? '1' : '0';

            if (expiryVisible) {
                /* An expiry beyond the visible area stays pinned to the edge, still counting down. */
                const pinned = expiryX > paneWidth - 2;

                nodes.line.style.transform = `translateX(${pinned ? paneWidth - 2 : expiryX}px)`;
                nodes.line.style.height = `${paneHeight}px`;
                nodes.line.style.borderStyle = pinned ? 'dashed' : 'solid';
                nodes.label.style.left = pinned ? 'auto' : '4px';
                nodes.label.style.right = pinned ? '4px' : 'auto';

                const text = formatCountdown(expiresAt - frame.exchangeNowMs);

                if (nodes.label.textContent !== text) {
                    nodes.label.textContent = text;
                }
            }

            const entryX = toX(new Date(position.opened_at).getTime() / 1000);
            const entryY = priceSeriesRef.current?.priceToCoordinate(Number(position.entry_price)) ?? null;
            const entryVisible = entryX !== null && entryY !== null && entryX >= 0 && entryX <= paneWidth && entryY >= 0 && entryY <= paneHeight;

            nodes.entry.style.opacity = entryVisible ? '1' : '0';

            if (entryVisible) {
                nodes.entry.style.transform = `translate(${entryX}px, ${entryY}px)`;
            }
        }
    }, []);

    useEffect(() => {
        const container = containerRef.current;

        if (!container) return;

        const chart = createChart(container, {
            autoSize: true,
            layout: {
                // Transparent, so the watermark behind the canvas shows through.
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor: AXIS_TEXT,
                fontFamily: CHART_FONT,
                fontSize: 11,
                // The TradingView attribution is given as a link in the site footer, as its licence allows.
                attributionLogo: false,
                panes: {
                    separatorColor: AXIS_BORDER,
                    separatorHoverColor: 'rgba(120,123,134,0.3)',
                },
            },
            grid: { vertLines: { color: GRID }, horzLines: { color: GRID } },
            crosshair: {
                mode: CrosshairMode.Normal,
                vertLine: {
                    color: GUIDE,
                    width: 1,
                    style: LineStyle.Dashed,
                    labelBackgroundColor: '#1f2633',
                },
                horzLine: {
                    color: GUIDE,
                    width: 1,
                    style: LineStyle.Dashed,
                    labelBackgroundColor: '#1f2633',
                },
            },
            rightPriceScale: {
                borderVisible: false,
                scaleMargins: { top: 0.14, bottom: 0.1 },
            },
            timeScale: {
                borderVisible: false,
                timeVisible: true,
                rightOffset: DEFAULT_RIGHT_OFFSET_BARS,
                tickMarkFormatter: formatTickMark,
            },
            // A flick keeps the chart gliding and easing out, with mouse and finger alike.
            kineticScroll: { mouse: true, touch: true },
            handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
            handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: { time: true, price: true }, axisDoubleClickReset: { time: true, price: true } },
            localization: {
                locale: 'pt-BR',
                timeFormatter: (time: Time) => formatChartTime(time as number),
            },
        });
        chartRef.current = chart;

        const motion = new LiveMotion({
            chart,
            series: () => priceSeriesRef.current,
            bars: () => barsRef.current,
            intervalSeconds: () => secondsRef.current,
            usesClose,
            onNewBar: refreshIndicators,
            onFrame,
        });
        motionRef.current = motion;

        /*
         * While the user drags, flicks or scrolls, the chart is theirs: following
         * pauses for the whole gesture, inertia included, and picks up from wherever
         * it came to rest. Nothing snaps back.
         */
        const onPointerDown = (event: PointerEvent) => {
            if (event.button === 0) motion.beginInteraction();
        };
        const onPointerUp = () => {
            motion.endInteraction();
        };
        const onWheel = () => motion.nudge();
        const onRangeChange = () => motion.rangeChanged();

        container.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);
        container.addEventListener('wheel', onWheel, { passive: true });
        chart.timeScale().subscribeVisibleLogicalRangeChange(onRangeChange);

        return () => {
            container.removeEventListener('pointerdown', onPointerDown);
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('pointercancel', onPointerUp);
            container.removeEventListener('wheel', onWheel);
            chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRangeChange);
            motion.dispose();
            motionRef.current = null;
            chart.remove();
            chartRef.current = null;
            priceSeriesRef.current = null;
            indicatorSeriesRef.current = [];
            indicatorRenderersRef.current = [];
            positionLinesRef.current = [];
            drawingCleanupRef.current = [];
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const motion = motionRef.current;

        motion?.start(motionAllowed());

        return () => motion?.stop();
    }, [animationsOn]);

    useEffect(() => {
        chartRef.current?.priceScale('right').applyOptions({
            mode: scaleMode === 'log' ? PriceScaleMode.Logarithmic : scaleMode === 'percent' ? PriceScaleMode.Percentage : PriceScaleMode.Normal,
        });
    }, [scaleMode]);

    const applyBarsToPriceSeries = useCallback(() => {
        const series = priceSeriesRef.current;

        if (!series) return;

        const bars = barsRef.current;
        series.setData(usesClose() ? bars.map((bar) => ({ time: bar.time, value: bar.close })) : bars);
        motionRef.current?.sync();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const chart = chartRef.current;

        if (!chart) return;

        if (priceSeriesRef.current) {
            const previous = priceSeriesRef.current;
            drawingCleanupRef.current.forEach((cleanup) => cleanup());
            drawingCleanupRef.current = [];
            positionLinesRef.current.forEach((line) => previous.removePriceLine(line));
            positionLinesRef.current = [];
            chart.removeSeries(previous);
        }

        const priceFormat = priceFormatFor(barsRef.current.at(-1)?.close ?? Number(asset.quote?.price ?? 1));
        const common = {
            priceFormat,
            // The axis label is our own live tag; the line stays as a quiet dotted guide.
            lastValueVisible: false,
            priceLineColor: 'rgba(214,222,235,0.55)',
            priceLineStyle: LineStyle.Dotted,
            autoscaleInfoProvider: (original: () => AutoscaleInfo | null) => {
                const info = original();

                return info?.priceRange
                    ? {
                          ...info,
                          priceRange: widenPriceRange(info.priceRange.minValue, info.priceRange.maxValue, MINIMUM_PRICE_RANGE_FRACTION),
                      }
                    : info;
            },
        };

        priceSeriesRef.current =
            chartType === 'candles'
                ? chart.addSeries(CandlestickSeries, {
                      ...common,
                      upColor: UP,
                      downColor: DOWN,
                      wickUpColor: UP,
                      wickDownColor: DOWN,
                      borderVisible: false,
                  })
                : chartType === 'bars'
                  ? chart.addSeries(BarSeries, {
                        ...common,
                        upColor: UP,
                        downColor: DOWN,
                    })
                  : chartType === 'line'
                    ? chart.addSeries(LineSeries, {
                          ...common,
                          color: PRICE_LINE,
                          lineWidth: 2,
                          crosshairMarkerRadius: 4,
                      })
                    : chart.addSeries(AreaSeries, {
                          ...common,
                          lineColor: PRICE_LINE,
                          lineWidth: 2,
                          topColor: 'rgba(198,242,78,0.22)',
                          bottomColor: 'rgba(198,242,78,0.01)',
                          crosshairMarkerRadius: 4,
                      });

        applyBarsToPriceSeries();
        setDataRevision((revision) => revision + 1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chartType]);

    useEffect(() => {
        chartRef.current?.applyOptions({
            timeScale: {
                secondsVisible: seconds === 1,
                barSpacing: seconds === 1 ? 5 : 7,
                minBarSpacing: seconds === 1 ? 1 : 0.5,
            },
        });
        motionRef.current?.setDefaultOffset(seconds === 1 ? LIVE_RIGHT_OFFSET_BARS : DEFAULT_RIGHT_OFFSET_BARS);
    }, [seconds]);

    useEffect(() => {
        const controller = new AbortController();
        setState({ status: 'loading', source: null, message: null });
        motionRef.current?.setPaused(true);

        const load = async () => {
            try {
                const limit = seconds === 1 ? 900 : 500;
                const response = await api<CandleResponse>(`/assets/${asset.id}/candles?interval=${interval}&limit=${limit}`, { signal: controller.signal });

                if (controller.signal.aborted) return;

                barsRef.current = response.candles.map(toBar);

                const last = barsRef.current.at(-1)?.close;

                if (last !== undefined) {
                    priceSeriesRef.current?.applyOptions({
                        priceFormat: priceFormatFor(last),
                    });
                }

                applyBarsToPriceSeries();
                motionRef.current?.setPaused(false);
                setState({
                    status: response.status,
                    source: response.source,
                    message: response.message,
                });
                setDataRevision((revision) => revision + 1);
            } catch (error) {
                if (!controller.signal.aborted) {
                    barsRef.current = [];
                    applyBarsToPriceSeries();
                    motionRef.current?.setPaused(false);
                    setState({
                        status: 'unavailable',
                        source: null,
                        message: error instanceof Error ? error.message : 'Falha ao carregar o histórico.',
                    });
                }
            }
        };

        void load();

        return () => controller.abort();
    }, [asset.id, interval, seconds, applyBarsToPriceSeries, reloadKey]);

    /* Dragging back toward the oldest candle quietly loads the history before it, so the chart never runs out of past. */
    useEffect(() => {
        const chart = chartRef.current;

        if (!chart || seconds === 1 || state.status === 'loading' || state.status === 'unavailable') return;

        const timeScale = chart.timeScale();
        const controller = new AbortController();
        let loading = false;
        let exhausted = false;
        let retryAfter = 0;

        const loadOlder = async () => {
            const oldest = barsRef.current[0];

            if (!oldest || loading || exhausted || Date.now() < retryAfter) return;

            loading = true;

            try {
                const response = await api<CandleResponse>(`/assets/${asset.id}/candles?interval=${interval}&limit=${OLDER_HISTORY_BAR_COUNT}&before=${oldest.time}`, { signal: controller.signal });

                // A reload replaced the bars meanwhile; this page belongs to the old set.
                if (controller.signal.aborted || barsRef.current[0] !== oldest) return;

                const older = response.candles.map(toBar).filter((bar) => bar.time < oldest.time);

                if (older.length === 0) {
                    exhausted = response.status !== 'unavailable';
                    retryAfter = Date.now() + OLDER_HISTORY_RETRY_MS;

                    return;
                }

                // Lightweight Charts keeps the view anchored to the latest bar, so prepending leaves it in place.
                barsRef.current = [...older, ...barsRef.current];
                applyBarsToPriceSeries();
                refreshIndicators();
            } catch {
                retryAfter = Date.now() + OLDER_HISTORY_RETRY_MS;
            } finally {
                loading = false;
            }

            // A fast flick can outrun one page: keep going while the view still sits near the oldest candle.
            if (!controller.signal.aborted) {
                onRange(timeScale.getVisibleLogicalRange());
            }
        };

        const onRange = (range: LogicalRange | null) => {
            if (range && range.from < OLDER_HISTORY_MARGIN_BARS) {
                void loadOlder();
            }
        };

        timeScale.subscribeVisibleLogicalRangeChange(onRange);
        onRange(timeScale.getVisibleLogicalRange());

        return () => {
            timeScale.unsubscribeVisibleLogicalRangeChange(onRange);
            controller.abort();
        };
    }, [asset.id, interval, seconds, state.status, applyBarsToPriceSeries, refreshIndicators]);

    /* Ticks carry no traded volume and can miss extremes, so recent bars are periodically matched to the exchange's. */
    useEffect(() => {
        if (seconds === 1 || state.status !== 'ok') return;

        const timer = window.setInterval(() => {
            if (document.hidden) return;

            api<CandleResponse>(`/assets/${asset.id}/candles?interval=${interval}&limit=${RECONCILE_BAR_COUNT}`)
                .then((response) => {
                    if (response.status === 'ok' && mergeExchangeBars(barsRef.current, response.candles.map(toBar))) {
                        applyBarsToPriceSeries();
                        refreshIndicators();
                    }
                })
                .catch(() => undefined);
        }, RECONCILE_INTERVAL_MS);

        return () => window.clearInterval(timer);
    }, [asset.id, interval, seconds, state.status, applyBarsToPriceSeries, refreshIndicators]);

    useEffect(() => {
        let hiddenAt = 0;

        const onVisibility = () => {
            if (document.hidden) {
                hiddenAt = Date.now();
            } else if (hiddenAt && Date.now() - hiddenAt > REFRESH_AFTER_HIDDEN_MS) {
                setReloadKey((key) => key + 1);
            }
        };

        document.addEventListener('visibilitychange', onVisibility);

        return () => document.removeEventListener('visibilitychange', onVisibility);
    }, []);

    useEffect(() => {
        return useMarket.subscribe((next, previous) => {
            const tick = next.ticks[asset.id];

            if (tick && tick !== previous.ticks[asset.id]) {
                motionRef.current?.pushTick(tick);

                if (indicatorRenderersRef.current.length > 0 && Date.now() - lastIndicatorRefreshRef.current > INDICATOR_REFRESH_MS) {
                    refreshIndicators();
                }
            }
        });
    }, [asset.id, refreshIndicators]);

    useEffect(() => {
        const chart = chartRef.current;

        if (!chart) return;

        indicatorSeriesRef.current.forEach((series) => chart.removeSeries(series));
        indicatorSeriesRef.current = [];
        indicatorRenderersRef.current = [];

        for (let index = chart.panes().length - 1; index > 0; index--) {
            if (chart.panes()[index].getSeries().length === 0) {
                chart.removePane(index);
            }
        }

        const hasVolume = indicators.has('volume') && barsRef.current.some((bar) => bar.volume !== null);

        chart.priceScale('right').applyOptions({
            scaleMargins: { top: 0.14, bottom: hasVolume ? 0.22 : 0.1 },
        });

        if (barsRef.current.length === 0) return;

        const closes = () => barsRef.current.map((bar) => bar.close);
        const overlay = {
            lastValueVisible: false,
            priceLineVisible: false,
            crosshairMarkerVisible: false,
            lineWidth: 2 as const,
        };
        const paneLine = {
            priceLineVisible: false,
            lastValueVisible: false,
            lineWidth: 2 as const,
        };

        const line = (options: Parameters<typeof chart.addSeries<'Line'>>[1], pane: number, values: () => Series) => {
            const series = chart.addSeries(LineSeries, options, pane);
            indicatorSeriesRef.current.push(series);
            indicatorRenderersRef.current.push(() => series.setData(toLine(barsRef.current, values())));

            return series;
        };

        const histogram = (pane: number, options: Parameters<typeof chart.addSeries<'Histogram'>>[1], data: () => { time: UTCTimestamp; value: number; color: string }[]) => {
            const series = chart.addSeries(
                HistogramSeries,
                {
                    priceLineVisible: false,
                    lastValueVisible: false,
                    ...options,
                },
                pane,
            );
            indicatorSeriesRef.current.push(series);
            indicatorRenderersRef.current.push(() => series.setData(data()));
        };

        if (hasVolume) {
            histogram(
                0,
                {
                    priceFormat: { type: 'volume' },
                    priceScaleId: VOLUME_SCALE_ID,
                },
                () =>
                    barsRef.current.flatMap((bar) =>
                        bar.volume === null
                            ? []
                            : [
                                  {
                                      time: bar.time,
                                      value: bar.volume,
                                      color: bar.close >= bar.open ? VOLUME_UP : VOLUME_DOWN,
                                  },
                              ],
                    ),
            );
            chart.priceScale(VOLUME_SCALE_ID).applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
        }

        if (indicators.has('sma')) {
            line({ ...overlay, color: SERIES_1 }, 0, () => sma(closes(), 20));
        }

        if (indicators.has('ema')) {
            line({ ...overlay, color: SERIES_2 }, 0, () => ema(closes(), 50));
        }

        if (indicators.has('bb')) {
            line({ ...overlay, color: SERIES_3, lineWidth: 1 }, 0, () => bollinger(closes()).upper);
            line(
                {
                    ...overlay,
                    color: SERIES_3,
                    lineWidth: 1,
                    lineStyle: LineStyle.Dashed,
                },
                0,
                () => bollinger(closes()).middle,
            );
            line({ ...overlay, color: SERIES_3, lineWidth: 1 }, 0, () => bollinger(closes()).lower);
        }

        let pane = 1;

        if (indicators.has('rsi')) {
            const series = line({ ...paneLine, color: SERIES_1, lastValueVisible: true }, pane++, () => rsi(closes()));
            series.createPriceLine({
                price: 70,
                color: GUIDE,
                lineWidth: 1,
                lineStyle: LineStyle.Dashed,
                axisLabelVisible: false,
                title: '70',
            });
            series.createPriceLine({
                price: 30,
                color: GUIDE,
                lineWidth: 1,
                lineStyle: LineStyle.Dashed,
                axisLabelVisible: false,
                title: '30',
            });
        }

        if (indicators.has('macd')) {
            const macdPane = pane++;
            histogram(macdPane, {}, () => {
                const values = macd(closes()).histogram;

                return barsRef.current.flatMap((bar, index) => {
                    const value = values[index];

                    return value === null
                        ? []
                        : [
                              {
                                  time: bar.time,
                                  value,
                                  color: value >= 0 ? VOLUME_UP : VOLUME_DOWN,
                              },
                          ];
                });
            });
            line({ ...paneLine, color: SERIES_1 }, macdPane, () => macd(closes()).macd);
            line({ ...paneLine, color: SERIES_2 }, macdPane, () => macd(closes()).signal);
        }

        if (indicators.has('stoch')) {
            const stochPane = pane++;
            line({ ...paneLine, color: SERIES_1 }, stochPane, () => stochastic(barsRef.current).k);
            line({ ...paneLine, color: SERIES_2 }, stochPane, () => stochastic(barsRef.current).d);
        }

        refreshIndicators();
    }, [indicators, dataRevision, refreshIndicators]);

    useEffect(() => {
        setDrawings(storedDrawings(asset.id));
        setTool(null);
        setDraftPoints(0);
        draftRef.current = [];
    }, [asset.id]);

    useEffect(() => {
        const chart = chartRef.current;
        const series = priceSeriesRef.current;

        drawingCleanupRef.current.forEach((cleanup) => cleanup());
        drawingCleanupRef.current = [];

        if (!chart || !series) return;

        const addPriceLine = (price: number, title: string) => {
            const line = series.createPriceLine({
                price,
                color: DRAWING,
                lineWidth: 1,
                lineStyle: LineStyle.Solid,
                axisLabelVisible: true,
                title,
            });
            drawingCleanupRef.current.push(() => series.removePriceLine(line));
        };

        for (const drawing of drawings) {
            const [first, second] = drawing.anchors;

            if (drawing.tool === 'hline') {
                addPriceLine(first.price, 'S/R');
            } else if (drawing.tool === 'fib') {
                fibonacciLevels(first.price, second.price).forEach(({ ratio, price }) => addPriceLine(price, `Fib ${(ratio * 100).toFixed(1)}%`));
            } else {
                const line = chart.addSeries(LineSeries, {
                    color: DRAWING,
                    lineWidth: 2,
                    lastValueVisible: false,
                    priceLineVisible: false,
                    crosshairMarkerVisible: false,
                });
                line.setData(
                    [...drawing.anchors]
                        .sort((a, b) => a.time - b.time)
                        .map((anchor) => ({
                            time: anchor.time as UTCTimestamp,
                            value: anchor.price,
                        })),
                );
                drawingCleanupRef.current.push(() => chart.removeSeries(line));
            }
        }
    }, [drawings, chartType]);

    useEffect(() => {
        const chart = chartRef.current;

        if (!chart || !tool) return;

        const definition = DRAWING_TOOLS.find((item) => item.value === tool);

        const onClick = (param: MouseEventParams) => {
            const series = priceSeriesRef.current;

            if (!series || !param.point || param.time === undefined || !definition) return;

            const price = series.coordinateToPrice(param.point.y);

            if (price === null) return;

            const anchor = { time: param.time as number, price };

            if (draftRef.current.some((item) => item.time === anchor.time)) return;

            const anchors = [...draftRef.current, anchor];

            if (anchors.length < definition.clicks) {
                draftRef.current = anchors;
                setDraftPoints(anchors.length);

                return;
            }

            draftRef.current = [];
            setDraftPoints(0);
            setTool(null);
            setDrawings((current) => {
                const next = [...current, { tool, anchors }];
                saveDrawings(asset.id, next);

                return next;
            });
        };

        chart.subscribeClick(onClick);

        return () => chart.unsubscribeClick(onClick);
    }, [tool, asset.id]);

    useEffect(() => {
        const series = priceSeriesRef.current;

        if (!series) return;

        positionLinesRef.current.forEach((line) => series.removePriceLine(line));
        positionLinesRef.current = showPositionLines
            ? openPositions.map((position) =>
                  series.createPriceLine({
                      price: Number(position.entry_price),
                      color: position.direction === 'call' ? UP : DOWN,
                      lineWidth: 1,
                      lineStyle: LineStyle.Dashed,
                      axisLabelVisible: true,
                      title: `${position.direction === 'call' ? 'CALL' : 'PUT'}${showStakeLabels ? ` ${formatCents(position.stake_cents)}` : ''}`,
                  }),
              )
            : [];
    }, [openPositions, chartType, dataRevision, showPositionLines, showStakeLabels]);

    const toggleIndicator = (key: string) => {
        setChartSettings({
            indicators: indicators.has(key) ? chartSettings.indicators.filter((item) => item !== key) : [...chartSettings.indicators, key],
        });
    };

    const selectInterval = (value: string) => {
        setChartSettings({ interval: value });
        motionRef.current?.goLive();
    };

    const selectTool = (value: ToolKey | null) => {
        draftRef.current = [];
        setDraftPoints(0);
        setTool(value);
    };

    const clearDrawings = () => {
        setDrawings([]);
        saveDrawings(asset.id, []);
    };

    const restoreAutoScale = () => {
        chartRef.current?.priceScale('right').applyOptions({ autoScale: true });
    };

    const fitAllBars = () => {
        chartRef.current?.timeScale().fitContent();
        motionRef.current?.settleInteraction();
    };

    /** Zoom in or out on the time axis, keeping the live edge in place. */
    const zoom = (factor: number) => {
        const timeScale = chartRef.current?.timeScale();

        if (!timeScale) return;

        const next = Math.min(40, Math.max(seconds === 1 ? 1 : 0.5, timeScale.options().barSpacing * factor));
        timeScale.applyOptions({ barSpacing: next });
        motionRef.current?.settleInteraction();
    };

    /** Back to the live edge with the price scale fitting the bars again. */
    const recenter = () => {
        restoreAutoScale();
        motionRef.current?.goLive();
    };

    const hasNoVolume = state.status !== 'loading' && barsRef.current.length > 0 && barsRef.current.every((bar) => bar.volume === null);
    const motionVisible = animationsOn && state.status !== 'loading' && state.status !== 'unavailable' && (chartType === 'line' || chartType === 'area');
    const intervalLabel = TIMEFRAMES.find((item) => item.value === interval)?.label ?? interval;
    const toolHint = tool && (DRAWING_TOOLS.find((item) => item.value === tool)?.clicks === 1 ? 'Clique no gráfico para marcar o nível' : draftPoints === 0 ? 'Clique no primeiro ponto' : 'Agora clique no segundo ponto');
    const ActiveTypeIcon = CHART_TYPES.find((item) => item.value === chartType)?.icon ?? ChartCandlestick;
    const categoryLabel = asset.category ? (CATEGORY_LABELS[asset.category] ?? asset.category) : 'Ativo';
    const payoutLabel = `${(asset.payout_rate_bps / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
    const menuItem = 'flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-ink-800 disabled:opacity-40';

    return (
        <div className="relative h-full min-h-0 overflow-hidden" style={{ background: SURFACE }}>
            {/* Watermark, behind the transparent chart canvas. */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.045] grayscale select-none" aria-hidden="true">
                <div className="scale-[3.2] sm:scale-[4.2]">
                    <Logo />
                </div>
            </div>

            <div ref={containerRef} className={`absolute inset-0 transition-opacity duration-200 ${state.status === 'loading' ? 'opacity-40' : 'opacity-100'}`} />

            <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden="true">
                {/* Trade window: where a trade opened now starts and where it is decided. */}
                <div ref={tradeOpenRef} className="absolute top-0 left-0 w-0 border-l border-dashed border-white/25 opacity-0">
                    <span className="absolute top-12 right-2 hidden text-[11px] font-medium whitespace-nowrap text-text-3 sm:block">Abertura da negociação</span>
                </div>
                <div ref={tradeCloseRef} className="absolute top-0 left-0 w-0 border-l border-white/40 opacity-0">
                    <span className="absolute top-12 left-2 hidden text-[11px] font-medium whitespace-nowrap text-text-2 sm:block">
                        Fechamento da negociação · <span className="numeric">{formatDuration(tradeDuration)}</span>
                    </span>
                </div>

                <div ref={dotRef} className={`absolute top-0 left-0 opacity-0 ${motionVisible ? '' : 'hidden'}`}>
                    <span className="absolute -top-[4px] -left-[4px] size-2 rounded-full bg-accent" />
                    <span className="absolute -top-[4px] -left-[4px] size-2 animate-live-ring rounded-full bg-accent" />
                </div>
                <div ref={barCountdownRef} className="numeric absolute top-0 left-0 rounded-md border border-white/10 bg-[#1f2633] px-2 py-0.5 text-[11px] font-semibold text-text-1 opacity-0 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.8)]" />
                <div ref={priceTagRef} className="numeric absolute top-0 left-0 h-5 rounded-l-sm px-1 text-center text-[11px] leading-5 font-semibold text-white opacity-0" style={{ background: LIVE_TAG }} />

                {openPositions.map((position) => (
                    <div key={position.id}>
                        <div
                            ref={(node) => {
                                const current = expiryRefs.current.get(position.id);

                                if (node) {
                                    expiryRefs.current.set(position.id, {
                                        line: node,
                                        label: node.querySelector('span') as HTMLSpanElement,
                                        entry: current?.entry ?? (node.nextElementSibling as HTMLDivElement),
                                    });
                                } else {
                                    expiryRefs.current.delete(position.id);
                                }
                            }}
                            className={`absolute top-0 left-0 w-0 border-l opacity-0 ${position.direction === 'call' ? 'border-up/80' : 'border-down/80'}`}
                        >
                            <span className={`numeric absolute top-20 left-1 rounded px-1 text-[11px] leading-4 font-semibold text-white ${position.direction === 'call' ? 'bg-up' : 'bg-down'}`} />
                        </div>
                        <div className="absolute top-0 left-0 opacity-0">
                            <span className={`absolute -top-1 -left-1 size-2 rounded-full ring-2 ring-[#0b0e13] ${position.direction === 'call' ? 'bg-up' : 'bg-down'}`} />
                        </div>
                    </div>
                ))}
            </div>

            {/* Asset, top left, as brokers show it. */}
            <div className="absolute top-3 left-3 z-20 flex flex-col gap-2 sm:left-12">
                <button type="button" onClick={onAssetClick} disabled={!onAssetClick} aria-expanded={assetsOpen} title="Trocar de ativo" className="group flex items-center gap-2.5 rounded-xl text-left">
                    <AssetIcon symbol={asset.symbol} category={asset.category} size={36} className="drop-shadow-[0_4px_10px_rgba(0,0,0,0.6)]" />
                    <span className="min-w-0">
                        <span className="flex items-center gap-1 text-[15px] leading-tight font-bold text-text-1 group-hover:text-accent">
                            {asset.symbol}
                            <ChevronDown size={15} className={`text-text-3 transition-transform ${assetsOpen ? 'lg:rotate-180' : ''}`} aria-hidden="true" />
                        </span>
                        <span className="block text-[11px] text-text-3">
                            {categoryLabel} · <span className="text-up">{payoutLabel}</span>
                        </span>
                    </span>
                </button>
                <div className="flex items-center gap-1.5">
                    <Popover
                        label="Informações do ativo"
                        trigger={({ open, toggle }) => (
                            <button type="button" aria-expanded={open} onClick={toggle} className={`chart-pill ${open ? 'is-active' : ''}`}>
                                <Info size={13} aria-hidden="true" />
                                Info
                            </button>
                        )}
                    >
                        {() => (
                            <dl className="flex w-64 flex-col gap-2 p-2 text-xs">
                                <div className="text-[13px] font-semibold text-text-1">{asset.name}</div>
                                {(
                                    [
                                        ['Categoria', categoryLabel],
                                        ['Retorno', payoutLabel],
                                        ['Dados', providerLabel(asset)],
                                        ['Cotado em', asset.price_basis ?? '—'],
                                        ['Mercado', asset.market_open ? 'Aberto' : `Fechado · ${asset.session_label}`],
                                        ['Última cotação', formatDateTime(asset.quote?.source_at ?? null)],
                                    ] as const
                                ).map(([label, value]) => (
                                    <div key={label} className="flex justify-between gap-3">
                                        <dt className="text-text-3">{label}</dt>
                                        <dd className="text-right text-text-1">{value}</dd>
                                    </div>
                                ))}
                                <p className="mt-1 border-t border-ink-700 pt-2 text-[11px] leading-relaxed text-text-3">
                                    Gráfico com tecnologia{' '}
                                    <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer" className="underline hover:text-text-1">
                                        TradingView
                                    </a>
                                    .{state.source ? ` Fonte dos preços: ${providerName(state.source)}.` : ''}
                                </p>
                            </dl>
                        )}
                    </Popover>
                    {onToggleFavorite && (
                        <button
                            type="button"
                            aria-pressed={Boolean(asset.is_favorite)}
                            aria-label={asset.is_favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                            title={asset.is_favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                            onClick={() => onToggleFavorite(asset)}
                            className={`chart-pill !px-2 ${asset.is_favorite ? '!text-accent' : ''}`}
                        >
                            <Star size={13} fill={asset.is_favorite ? 'currentColor' : 'none'} aria-hidden="true" />
                        </button>
                    )}
                </div>
            </div>

            <SentimentBar assetId={asset.id} />

            {/* Tool rail, bottom left: chart type, period, indicators and drawing. */}
            <div className="absolute bottom-10 left-2 z-20 flex flex-col gap-1.5" role="toolbar" aria-label="Ferramentas do gráfico">
                <RailButton
                    label="Tipo de gráfico"
                    menu={() => (
                        <div className="flex flex-col">
                            {CHART_TYPES.map((item) => (
                                <button key={item.value} type="button" role="menuitemradio" aria-checked={chartType === item.value} className={menuItem} onClick={() => setChartSettings({ type: item.value })}>
                                    <span className="flex items-center gap-2">
                                        <item.icon size={15} aria-hidden="true" />
                                        {item.title}
                                    </span>
                                    {chartType === item.value && <Check size={14} className="text-accent" aria-hidden="true" />}
                                </button>
                            ))}
                            <div className="my-1 border-t border-ink-700" />
                            <span className="px-2.5 py-1 text-[10px] font-semibold tracking-wide text-text-3 uppercase">Escala</span>
                            {(
                                [
                                    ['normal', 'Normal'],
                                    ['percent', 'Percentual'],
                                    ['log', 'Logarítmica'],
                                ] as const
                            ).map(([value, label]) => (
                                <button key={value} type="button" role="menuitemradio" aria-checked={scaleMode === value} className={menuItem} onClick={() => setScaleMode(value)}>
                                    {label}
                                    {scaleMode === value && <Check size={14} className="text-accent" aria-hidden="true" />}
                                </button>
                            ))}
                            <button type="button" className={menuItem} onClick={fitAllBars}>
                                <span className="flex items-center gap-2">
                                    <Maximize2 size={14} aria-hidden="true" />
                                    Mostrar todo o histórico
                                </span>
                            </button>
                        </div>
                    )}
                >
                    <ActiveTypeIcon size={17} aria-hidden="true" />
                </RailButton>

                <RailButton
                    label="Período das velas"
                    menu={(close) => (
                        <div className="grid w-48 grid-cols-4 gap-1">
                            {TIMEFRAMES.filter((item) => item.value !== '1s' || supportsSecondBars).map((item) => (
                                <button
                                    key={item.value}
                                    type="button"
                                    role="menuitemradio"
                                    aria-checked={interval === item.value}
                                    className={`numeric h-9 rounded-lg text-[13px] font-semibold ${interval === item.value ? 'bg-accent text-on-accent' : 'text-text-2 hover:bg-ink-800'}`}
                                    onClick={() => {
                                        selectInterval(item.value);
                                        close();
                                    }}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    )}
                >
                    <span className="numeric text-[12px] font-bold">{intervalLabel}</span>
                </RailButton>

                <RailButton
                    label="Indicadores"
                    active={indicators.size > 0}
                    menu={() =>
                        INDICATORS.map((item) => {
                            const disabled = item.needsVolume && hasNoVolume;

                            return (
                                <button
                                    key={item.value}
                                    type="button"
                                    role="menuitemcheckbox"
                                    aria-checked={indicators.has(item.value)}
                                    disabled={disabled}
                                    title={disabled ? 'O provedor não informa volume para este ativo.' : undefined}
                                    className={menuItem}
                                    onClick={() => toggleIndicator(item.value)}
                                >
                                    <span className="flex items-center gap-2">
                                        {item.swatch && <span className="h-0.5 w-3 rounded-full" style={{ background: item.swatch }} aria-hidden="true" />}
                                        {item.label}
                                    </span>
                                    {indicators.has(item.value) && <Check size={14} className="text-accent" aria-hidden="true" />}
                                </button>
                            );
                        })
                    }
                >
                    <Sigma size={17} aria-hidden="true" />
                    {indicators.size > 0 && <span className="numeric absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-accent text-[9px] font-bold text-on-accent">{indicators.size}</span>}
                </RailButton>

                <RailButton
                    label="Desenhar"
                    active={tool !== null}
                    menu={(close) => (
                        <div className="flex flex-col">
                            <button
                                type="button"
                                role="menuitemradio"
                                aria-checked={tool === null}
                                className={menuItem}
                                onClick={() => {
                                    selectTool(null);
                                    close();
                                }}
                            >
                                <span className="flex items-center gap-2">
                                    <Crosshair size={15} aria-hidden="true" />
                                    Cursor
                                </span>
                                {tool === null && <Check size={14} className="text-accent" aria-hidden="true" />}
                            </button>
                            {DRAWING_TOOLS.map((item) => (
                                <button
                                    key={item.value}
                                    type="button"
                                    role="menuitemradio"
                                    aria-checked={tool === item.value}
                                    className={menuItem}
                                    onClick={() => {
                                        selectTool(item.value);
                                        close();
                                    }}
                                >
                                    <span className="flex items-center gap-2">
                                        <item.icon size={15} aria-hidden="true" />
                                        {item.label}
                                    </span>
                                    {tool === item.value && <Check size={14} className="text-accent" aria-hidden="true" />}
                                </button>
                            ))}
                            {drawings.length > 0 && (
                                <button
                                    type="button"
                                    className={`${menuItem} text-down`}
                                    onClick={() => {
                                        clearDrawings();
                                        close();
                                    }}
                                >
                                    <span className="flex items-center gap-2">
                                        <Trash2 size={15} aria-hidden="true" />
                                        Apagar desenhos ({drawings.length})
                                    </span>
                                </button>
                            )}
                        </div>
                    )}
                >
                    <PencilLine size={16} aria-hidden="true" />
                </RailButton>
            </div>

            {/* Zoom, bottom centre. */}
            <div className="absolute bottom-9 left-1/2 z-20 hidden -translate-x-1/2 items-center gap-1 rounded-xl border border-white/5 bg-[#151a22]/90 p-1 backdrop-blur sm:flex" role="group" aria-label="Zoom">
                <button type="button" className="chart-zoom" aria-label="Diminuir zoom" title="Diminuir zoom" onClick={() => zoom(1 / 1.35)}>
                    <Minus size={15} aria-hidden="true" />
                </button>
                <button type="button" className="chart-zoom" aria-label="Voltar ao preço atual" title="Voltar ao preço atual" onClick={recenter}>
                    <LocateFixed size={15} aria-hidden="true" />
                </button>
                <button type="button" className="chart-zoom" aria-label="Aumentar zoom" title="Aumentar zoom" onClick={() => zoom(1.35)}>
                    <Plus size={15} aria-hidden="true" />
                </button>
            </div>

            {toolHint && (
                <div className="pointer-events-none absolute top-24 left-1/2 z-20 -translate-x-1/2 animate-pop rounded-lg border border-ink-700 bg-ink-850 px-3 py-1.5 text-xs font-medium whitespace-nowrap text-text-1">{toolHint}</div>
            )}

            {state.status === 'stale' && <div className="absolute top-24 left-1/2 z-20 -translate-x-1/2 rounded-md bg-demo-soft px-2.5 py-1 text-xs font-semibold text-demo">{state.message}</div>}

            {state.status === 'unavailable' && (
                <div className="absolute inset-0 z-30 flex animate-fade items-center justify-center bg-[#0b0e13]">
                    <EmptyState icon={<ChartLine size={20} aria-hidden="true" />} title="Sem dados de mercado">
                        {state.message} Nenhum gráfico é exibido sem dados reais do provedor.
                    </EmptyState>
                </div>
            )}

            {state.status === 'loading' && (
                <div
                    className="pointer-events-none absolute top-1/2 left-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 animate-fade items-center gap-2.5 rounded-lg border border-ink-700 bg-ink-850/90 px-3 py-2 text-xs text-text-1"
                    role="status"
                >
                    <span className="skeleton h-1.5 w-16" />
                    Carregando histórico
                </div>
            )}
        </div>
    );
}
