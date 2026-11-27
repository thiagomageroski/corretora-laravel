import { useState } from 'react';

export type BarSeries = { key: string; label: string; color: string };

/**
 * Grouped daily bars on one shared axis (same unit for every series), with a
 * legend, a hover readout per day and a table view of the same numbers.
 * Colors were validated for the dark surface and colour-vision deficiency.
 */
export function DailyBars({ days, series, format, height = 168 }: { days: ({ date: string } & Record<string, number | string>)[]; series: BarSeries[]; format: (value: number) => string; height?: number }) {
    const [hovered, setHovered] = useState<number | null>(null);
    const [asTable, setAsTable] = useState(false);
    const max = Math.max(1, ...days.flatMap((day) => series.map((item) => Number(day[item.key]) || 0)));
    const label = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const focus = hovered === null ? null : days[hovered];

    return (
        <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                {series.length > 1 ? (
                    <ul className="flex flex-wrap gap-4 text-xs text-text-2" aria-label="Legenda">
                        {series.map((item) => (
                            <li key={item.key} className="flex items-center gap-1.5">
                                <span className="size-2.5 rounded-[3px]" style={{ background: item.color }} aria-hidden="true" />
                                {item.label}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <span />
                )}
                <button type="button" className="text-xs font-semibold text-text-3 underline-offset-2 hover:text-text-1 hover:underline" onClick={() => setAsTable((current) => !current)}>
                    {asTable ? 'Ver gráfico' : 'Ver tabela'}
                </button>
            </div>

            {asTable ? (
                <div className="thin-scroll max-h-64 overflow-auto rounded-lg border border-ink-800">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Dia</th>
                                {series.map((item) => (
                                    <th key={item.key} data-align="right">
                                        {item.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {days.map((day) => (
                                <tr key={day.date}>
                                    <td className="numeric">{label(day.date)}</td>
                                    {series.map((item) => (
                                        <td key={item.key} data-align="right" className="numeric">
                                            {format(Number(day[item.key]) || 0)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="relative">
                    <div className="numeric pointer-events-none absolute -top-0.5 right-0 text-[10px] text-text-3">{format(max)}</div>
                    <div className="flex items-end gap-[3px] border-b border-ink-700 pt-4" style={{ height }} onMouseLeave={() => setHovered(null)}>
                        {days.map((day, index) => (
                            <div
                                key={day.date}
                                className={`flex h-full flex-1 cursor-default items-end justify-center gap-[2px] rounded-t-md px-[1px] transition-colors ${hovered === index ? 'bg-ink-800/70' : ''}`}
                                onMouseEnter={() => setHovered(index)}
                                aria-label={`${label(day.date)}: ${series.map((item) => `${item.label} ${format(Number(day[item.key]) || 0)}`).join(', ')}`}
                                role="img"
                            >
                                {series.map((item) => {
                                    const value = Number(day[item.key]) || 0;

                                    return <span key={item.key} className="block min-w-[3px] flex-1 rounded-t-[4px]" style={{ background: item.color, height: value > 0 ? `${Math.max(3, (value / max) * 100)}%` : '0%' }} />;
                                })}
                            </div>
                        ))}
                    </div>
                    <div className="numeric mt-1.5 flex justify-between text-[10px] text-text-3">
                        <span>{label(days[0]?.date ?? '')}</span>
                        <span>{label(days[days.length - 1]?.date ?? '')}</span>
                    </div>
                    {focus && (
                        <div className="pointer-events-none absolute top-0 left-1/2 z-10 -translate-x-1/2 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-xs shadow-[var(--shadow-float)]">
                            <div className="mb-1 font-semibold text-text-1">{label(focus.date)}</div>
                            {series.map((item) => (
                                <div key={item.key} className="flex items-center justify-between gap-4 text-text-2">
                                    <span className="flex items-center gap-1.5">
                                        <span className="size-2 rounded-[2px]" style={{ background: item.color }} aria-hidden="true" />
                                        {item.label}
                                    </span>
                                    <span className="numeric text-text-1">{format(Number(focus[item.key]) || 0)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
