import { Head, Link } from '@inertiajs/react';
import { ArrowLeft, ChartCandlestick } from 'lucide-react';
import type { ReactNode } from 'react';
import PriceChart from '@/components/chart/PriceChart';
import { AssetIcon, Change, DataStatus, LivePrice, Page, RangeBar } from '@/components/ui';
import AppLayout from '@/layouts/AppLayout';
import { changePercent, formatDateTime, formatPrice, providerLabel } from '@/lib/format';
import type { Asset } from '@/lib/types';
import { useMarket } from '@/stores/market';

export default function AssetShow({ asset: { data: asset } }: { asset: { data: Asset } }) {
    const quote = asset.quote;
    const tick = useMarket((state) => state.ticks[asset.id]);
    const price = tick?.price ?? quote?.price ?? null;
    const change = tick ? changePercent(tick.price, tick.open_24h) : (quote?.change_percent ?? null);
    const range = quote?.high_24h && quote.low_24h && Number(quote.low_24h) > 0 ? ((Number(quote.high_24h) - Number(quote.low_24h)) / Number(quote.low_24h)) * 100 : null;

    const facts: [string, ReactNode][] = [
        ['Categoria', asset.category_name],
        ['Dados', <DataStatus key="status" status={asset.data_status} />],
        ['Fonte', providerLabel(asset)],
        ['Cotado em', asset.price_basis ?? '—'],
        ['Mercado', asset.market_open ? 'Aberto' : 'Fechado'],
        ['Horário', asset.session_label],
        ['Máxima 24 h', formatPrice(quote?.high_24h)],
        ['Mínima 24 h', formatPrice(quote?.low_24h)],
        ['Volatilidade (amplitude 24 h)', range === null ? '—' : `${range.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`],
        ['Volume 24 h', quote?.volume_24h ? Number(quote.volume_24h).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '—'],
        ['Última atualização', formatDateTime(quote?.source_at)],
    ];

    return (
        <AppLayout>
            <Head title={asset.symbol} />
            <Page>
                <Link href="/ativos" className="inline-flex w-fit items-center gap-1.5 text-xs font-semibold text-text-2 hover:text-text-1">
                    <ArrowLeft size={14} aria-hidden="true" />
                    Catálogo
                </Link>
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                        <AssetIcon symbol={asset.symbol} category={asset.category} size={48} />
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">{asset.symbol}</h1>
                            <p className="text-[13px] text-text-2">{asset.name}</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                        {price === null ? <span className="numeric text-2xl text-text-3">—</span> : <LivePrice price={price} className="px-1 text-2xl font-medium" />}
                        <Change value={change} />
                        <Link href={`/negociar?asset=${asset.id}`} className="btn btn-primary btn-sm">
                            <ChartCandlestick size={15} aria-hidden="true" />
                            Negociar este ativo
                        </Link>
                    </div>
                </div>
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="panel h-[560px] overflow-hidden">
                        <PriceChart asset={asset} />
                    </div>
                    <aside className="panel h-fit overflow-hidden">
                        <div className="border-b border-ink-800 p-5">
                            <div className="label">Posição na amplitude de 24 h</div>
                            <div className="mt-3">
                                <RangeBar price={price} low={quote?.low_24h} high={quote?.high_24h} />
                            </div>
                        </div>
                        <dl className="divide-y divide-ink-800 text-xs">
                            {facts.map(([label, value]) => (
                                <div key={label} className="flex justify-between gap-4 px-5 py-2.5">
                                    <dt className="text-text-3">{label}</dt>
                                    <dd className="text-right text-text-1">{value}</dd>
                                </div>
                            ))}
                        </dl>
                    </aside>
                </div>
            </Page>
        </AppLayout>
    );
}
