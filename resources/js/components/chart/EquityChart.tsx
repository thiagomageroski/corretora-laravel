import { BaselineSeries, ColorType, createChart, type Time, type UTCTimestamp } from 'lightweight-charts';
import { useEffect, useRef } from 'react';
import { formatCents, formatChartTime, formatTickMark } from '@/lib/format';

/**
 * Cumulative result over time, split at zero. One series, so the panel
 * title names it and no legend is needed; the crosshair gives each exact value.
 */
export default function EquityChart({ points }: { points: { time: number; value: number }[] }) {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        const chart = createChart(containerRef.current, {
            autoSize: true,
            layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#8b95a5', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 },
            grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(120,135,160,0.07)' } },
            rightPriceScale: { borderVisible: false },
            timeScale: { borderVisible: false, timeVisible: true, tickMarkFormatter: formatTickMark },
            handleScroll: false,
            handleScale: false,
            localization: { locale: 'pt-BR', priceFormatter: (cents: number) => formatCents(cents), timeFormatter: (time: Time) => formatChartTime(time as number) },
        });

        const series = chart.addSeries(BaselineSeries, {
            baseValue: { type: 'price', price: 0 },
            topLineColor: '#26b98a',
            topFillColor1: 'rgba(38,185,138,0.24)',
            topFillColor2: 'rgba(38,185,138,0)',
            bottomLineColor: '#ef5a6f',
            bottomFillColor1: 'rgba(239,90,111,0)',
            bottomFillColor2: 'rgba(239,90,111,0.24)',
            lineWidth: 2,
            priceLineVisible: false,
        });

        const byTime = new Map<number, number>();
        points.forEach((point) => byTime.set(point.time, point.value));
        series.setData([...byTime.entries()].sort(([a], [b]) => a - b).map(([time, value]) => ({ time: time as UTCTimestamp, value })));
        chart.timeScale().fitContent();

        return () => chart.remove();
    }, [points]);

    return <div ref={containerRef} className="h-full w-full" role="img" aria-label="Resultado acumulado das operações ao longo do tempo" />;
}
