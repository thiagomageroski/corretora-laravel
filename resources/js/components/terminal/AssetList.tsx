import { Search, Star } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { AssetIcon, Change, DataStatus, EmptyState, LivePrice } from '@/components/ui';
import { changePercent } from '@/lib/format';
import type { Asset, Category } from '@/lib/types';
import { useMarket } from '@/stores/market';

const AssetRow = memo(function AssetRow({ asset, selected, onSelect, onToggleFavorite }: { asset: Asset; selected: boolean; onSelect: (asset: Asset) => void; onToggleFavorite: (asset: Asset) => void }) {
    const tick = useMarket((state) => state.ticks[asset.id]);
    const price = tick?.price ?? asset.quote?.price ?? null;
    const change = tick ? changePercent(tick.price, tick.open_24h) : (asset.quote?.change_percent ?? null);

    return (
        <li className={`relative flex items-center transition-colors ${selected ? 'bg-ink-800' : 'hover:bg-ink-850'}`}>
            {selected && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-accent" aria-hidden="true" />}
            <button
                type="button"
                className={`grid size-9 shrink-0 place-items-center pl-1 transition-colors ${asset.is_favorite ? 'text-accent' : 'text-ink-600 hover:text-text-2'}`}
                aria-label={asset.is_favorite ? `Remover ${asset.symbol} dos favoritos` : `Adicionar ${asset.symbol} aos favoritos`}
                aria-pressed={Boolean(asset.is_favorite)}
                onClick={() => onToggleFavorite(asset)}
            >
                <Star size={14} fill={asset.is_favorite ? 'currentColor' : 'none'} aria-hidden="true" />
            </button>
            <button type="button" className="flex min-w-0 flex-1 items-center justify-between gap-2 py-2.5 pr-3 text-left" onClick={() => onSelect(asset)} aria-current={selected ? 'true' : undefined}>
                <span className="flex min-w-0 items-center gap-2.5">
                    <AssetIcon symbol={asset.symbol} category={asset.category} size={26} />
                    <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold">{asset.symbol}</span>
                        <span className="block truncate text-[11px] text-text-3">{asset.name}</span>
                    </span>
                </span>
                <span className="shrink-0 text-right">
                    {price === null ? (
                        <DataStatus status="unavailable" />
                    ) : (
                        <>
                            <LivePrice price={price} className="px-0.5 text-xs" />
                            <span className="block text-[11px]">
                                <Change value={change} size={11} />
                            </span>
                        </>
                    )}
                </span>
            </button>
        </li>
    );
});

export default function AssetList({
    assets,
    categories,
    recentIds,
    selectedId,
    onSelect,
    onToggleFavorite,
}: {
    assets: Asset[];
    categories: Category[];
    recentIds: number[];
    selectedId: number | null;
    onSelect: (asset: Asset) => void;
    onToggleFavorite: (asset: Asset) => void;
}) {
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<string>('crypto');

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();

        if (term) {
            return assets.filter((asset) => asset.symbol.toLowerCase().includes(term) || asset.name.toLowerCase().includes(term));
        }

        if (filter === 'favorites') return assets.filter((asset) => asset.is_favorite);
        if (filter === 'recent') return recentIds.flatMap((id) => assets.find((asset) => asset.id === id) ?? []);
        if (filter === 'all') return assets;

        return assets.filter((asset) => asset.category === filter);
    }, [assets, filter, recentIds, search]);

    const filters = [{ code: 'favorites', name: 'Favoritos' }, { code: 'recent', name: 'Recentes' }, ...categories, { code: 'all', name: 'Todos' }];

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="shrink-0 p-3 pb-2">
                <div className="relative">
                    <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-3" aria-hidden="true" />
                    <input type="search" className="field !h-10 !pl-9 text-[13px]" placeholder="Buscar ativo" aria-label="Buscar ativo" value={search} onChange={(event) => setSearch(event.target.value)} />
                </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-0.5 border-b border-ink-800 px-3 pb-2.5" role="group" aria-label="Filtrar ativos">
                {filters.map((item) => (
                    <button key={item.code} type="button" className="chip h-7 px-2 text-[11px]" aria-pressed={!search && filter === item.code} onClick={() => setFilter(item.code)}>
                        {item.name}
                    </button>
                ))}
            </div>
            {filtered.length === 0 ? (
                <EmptyState icon={filter === 'favorites' ? <Star size={18} aria-hidden="true" /> : <Search size={18} aria-hidden="true" />} title="Nenhum ativo aqui">
                    {filter === 'favorites' && !search ? 'Marque a estrela de um ativo para vê-lo aqui.' : filter === 'recent' && !search ? 'Os ativos que você abrir aparecerão aqui.' : 'Tente outra busca.'}
                </EmptyState>
            ) : (
                <ul className="thin-scroll min-h-0 flex-1 overflow-y-auto">
                    {filtered.map((asset) => (
                        <AssetRow key={asset.id} asset={asset} selected={asset.id === selectedId} onSelect={onSelect} onToggleFavorite={onToggleFavorite} />
                    ))}
                </ul>
            )}
        </div>
    );
}
