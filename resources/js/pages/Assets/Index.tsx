import { Head, Link, router } from '@inertiajs/react';
import { ChevronLeft, ChevronRight, Search, Star } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { AssetIcon, Change, DataStatus, EmptyState, LivePrice, Page, PageHeader, RangeBar } from '@/components/ui';
import AppLayout from '@/layouts/AppLayout';
import { api } from '@/lib/api';
import { CATEGORY_LABELS, changePercent, providerLabel } from '@/lib/format';
import type { Asset, Category, Paginated } from '@/lib/types';
import { useMarket } from '@/stores/market';

type Filters = { q?: string; category?: string; favorites?: boolean | string };

function AssetRow({ asset }: { asset: Asset }) {
    const tick = useMarket((state) => state.ticks[asset.id]);
    const [favorite, setFavorite] = useState(Boolean(asset.is_favorite));
    const price = tick?.price ?? asset.quote?.price ?? null;
    const change = tick ? changePercent(tick.price, tick.open_24h) : (asset.quote?.change_percent ?? null);

    const toggleFavorite = () => {
        const next = !favorite;
        setFavorite(next);
        void api(`/assets/${asset.id}/favorite`, { method: next ? 'PUT' : 'DELETE' }).catch(() => setFavorite(!next));
    };

    return (
        <tr>
            <td className="w-10 !pr-0">
                <button
                    type="button"
                    aria-pressed={favorite}
                    aria-label={favorite ? `Remover ${asset.symbol} dos favoritos` : `Adicionar ${asset.symbol} aos favoritos`}
                    className={`grid size-7 place-items-center rounded-md transition-colors hover:bg-ink-700 ${favorite ? 'text-accent' : 'text-ink-600 hover:text-text-2'}`}
                    onClick={toggleFavorite}
                >
                    <Star size={14} fill={favorite ? 'currentColor' : 'none'} aria-hidden="true" />
                </button>
            </td>
            <td>
                <Link href={`/ativos/${asset.id}`} className="flex items-center gap-3 hover:text-accent">
                    <AssetIcon symbol={asset.symbol} category={asset.category} size={30} />
                    <span>
                        <span className="block font-semibold">{asset.symbol}</span>
                        <span className="block text-xs text-text-3">{asset.name}</span>
                    </span>
                </Link>
            </td>
            <td data-align="right">{price === null ? <span className="numeric text-text-3">—</span> : <LivePrice price={price} className="px-1" />}</td>
            <td data-align="right" className="text-xs">
                <Change value={change} size={12} />
            </td>
            <td className="w-32">
                <RangeBar price={price} low={asset.quote?.low_24h} high={asset.quote?.high_24h} />
            </td>
            <td>
                <DataStatus status={asset.data_status} />
            </td>
            <td className="text-xs text-text-2">{providerLabel(asset)}</td>
            <td className={`text-xs font-medium ${asset.market_open ? 'text-up' : 'text-text-3'}`}>{asset.market_open ? 'Aberto' : 'Fechado'}</td>
            <td data-align="right">
                <Link href={`/negociar?asset=${asset.id}`} className="btn btn-ghost btn-sm !h-8">
                    Abrir
                </Link>
            </td>
        </tr>
    );
}

export default function AssetsIndex({ assets, categories, filters }: { assets: Paginated<Asset>; categories: Category[]; filters: Filters }) {
    const [search, setSearch] = useState(filters.q ?? '');
    const showFavorites = Boolean(filters.favorites);

    const visit = (next: Filters) => {
        const query = Object.fromEntries(Object.entries({ ...filters, ...next }).filter(([, value]) => value !== undefined && value !== '' && value !== false));
        router.get('/ativos', query, { preserveState: true, preserveScroll: true });
    };

    const submit = (event: FormEvent) => {
        event.preventDefault();
        visit({ q: search });
    };

    return (
        <AppLayout>
            <Head title="Ativos" />
            <Page>
                <PageHeader
                    title="Catálogo de ativos"
                    description="Horários de mercado regulares. Feriados das bolsas ainda não são considerados. Ativos sem provedor aparecem sem dados e não podem ser operados."
                    actions={
                        <form onSubmit={submit} className="relative w-full sm:w-72">
                            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-3" aria-hidden="true" />
                            <input type="search" className="field !h-10 !pl-9" placeholder="Buscar por nome ou símbolo" aria-label="Buscar ativo" value={search} onChange={(event) => setSearch(event.target.value)} />
                        </form>
                    }
                />

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" role="group" aria-label="Categorias">
                    {categories.map((category) => {
                        const active = filters.category === category.code;

                        return (
                            <button
                                key={category.code}
                                type="button"
                                aria-pressed={active}
                                onClick={() => visit({ category: active ? undefined : category.code })}
                                className={`rounded-xl border p-3.5 text-left transition-colors ${active ? 'border-accent/60 bg-accent-soft' : 'border-ink-800 bg-ink-900 hover:border-ink-600'}`}
                            >
                                <span className="flex items-baseline justify-between gap-2">
                                    <span className="font-semibold">{category.name}</span>
                                    <span className="numeric text-xs text-text-2">{category.assets_count}</span>
                                </span>
                                <span className="mt-0.5 block truncate text-[11px] text-text-3">{CATEGORY_LABELS[category.code]}</span>
                            </button>
                        );
                    })}
                </div>

                <div className="flex flex-wrap gap-1.5">
                    <button
                        type="button"
                        className="chip border border-ink-800"
                        aria-pressed={!filters.category && !showFavorites && !filters.q}
                        onClick={() => {
                            setSearch('');
                            router.get('/ativos', {}, { preserveState: true, preserveScroll: true });
                        }}
                    >
                        Todos
                    </button>
                    <button type="button" className="chip border border-ink-800" aria-pressed={showFavorites} onClick={() => visit({ favorites: showFavorites ? undefined : '1' })}>
                        <Star size={13} aria-hidden="true" />
                        Favoritos
                    </button>
                </div>

                <div className="panel thin-scroll overflow-x-auto">
                    {assets.data.length === 0 ? (
                        <EmptyState icon={<Search size={18} aria-hidden="true" />} title="Nenhum ativo encontrado">
                            Ajuste a busca ou os filtros.
                        </EmptyState>
                    ) : (
                        <table className="data-table min-w-[920px]">
                            <thead>
                                <tr>
                                    <th aria-label="Favorito" />
                                    <th>Ativo</th>
                                    <th data-align="right">Cotação</th>
                                    <th data-align="right">24 h</th>
                                    <th>Amplitude 24 h</th>
                                    <th>Dados</th>
                                    <th>Fonte</th>
                                    <th>Mercado</th>
                                    <th aria-label="Ações" />
                                </tr>
                            </thead>
                            <tbody>
                                {assets.data.map((asset) => (
                                    <AssetRow key={asset.id} asset={asset} />
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {assets.meta && assets.meta.last_page > 1 && (
                    <nav className="flex items-center justify-between gap-3 text-xs text-text-2" aria-label="Paginação">
                        {assets.links?.prev ? (
                            <Link href={assets.links.prev} className="btn btn-ghost btn-sm" preserveScroll>
                                <ChevronLeft size={15} aria-hidden="true" />
                                Anterior
                            </Link>
                        ) : (
                            <span />
                        )}
                        <span>
                            Página {assets.meta.current_page} de {assets.meta.last_page} · {assets.meta.total} ativos
                        </span>
                        {assets.links?.next ? (
                            <Link href={assets.links.next} className="btn btn-ghost btn-sm" preserveScroll>
                                Próxima
                                <ChevronRight size={15} aria-hidden="true" />
                            </Link>
                        ) : (
                            <span />
                        )}
                    </nav>
                )}
            </Page>
        </AppLayout>
    );
}
