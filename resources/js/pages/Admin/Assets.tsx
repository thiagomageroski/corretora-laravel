import { router } from '@inertiajs/react';
import { Check, Pencil, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ActionDialog, AdminCard, EmptyRow, FilterChips, Pagination, SearchBox, useFilters, type PendingAction } from '@/components/admin/ui';
import { AssetIcon, Switch } from '@/components/ui';
import AdminLayout from '@/layouts/AdminLayout';
import { bpsPercent, type AdminPage } from '@/lib/admin';
import { CATEGORY_LABELS, formatDateTime, providerName } from '@/lib/format';

type Asset = { id: number; symbol: string; name: string; category: string | null; provider: string | null; session: string; payout_rate_bps: number; is_active: boolean; has_quote: boolean; quote_at: string | null };
type Filters = { q: string; categoria: string | null; situacao: 'active' | 'inactive' | null };

/** Percent typed by a person ("85" or "85,5") to basis points. */
function toBps(value: string): number {
    return Math.round(Number(value.replace(',', '.')) * 100);
}

function AssetRow({ asset }: { asset: Asset }) {
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState(asset.name);
    const [payout, setPayout] = useState(String(asset.payout_rate_bps / 100).replace('.', ','));

    const save = (changes: Partial<{ name: string; payout_rate_bps: number; is_active: boolean }>) =>
        router.put(`/admin/ativos/${asset.id}`, { name: asset.name, payout_rate_bps: asset.payout_rate_bps, is_active: asset.is_active, ...changes }, { preserveScroll: true, onSuccess: () => setEditing(false) });

    const submit = (event: FormEvent) => {
        event.preventDefault();
        save({ name, payout_rate_bps: toBps(payout) });
    };

    return (
        <tr className={asset.is_active ? '' : 'opacity-60'}>
            <td>
                <div className="flex items-center gap-2 font-semibold">
                    <AssetIcon symbol={asset.symbol} category={asset.category} size={22} />
                    {asset.symbol}
                </div>
                {editing ? (
                    <form id={`asset-${asset.id}`} onSubmit={submit}>
                        <input className="field mt-1 !h-8 text-xs" aria-label="Nome do ativo" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
                    </form>
                ) : (
                    <div className="text-[11px] text-text-3">{asset.name}</div>
                )}
            </td>
            <td className="text-xs text-text-2">{asset.category ? (CATEGORY_LABELS[asset.category] ?? asset.category) : '—'}</td>
            <td className="text-xs text-text-2">
                {asset.provider ? providerName(asset.provider) : 'Sem provedor'}
                <div className="text-[11px] text-text-3">{asset.has_quote ? `cotação ${formatDateTime(asset.quote_at)}` : 'sem cotação'}</div>
            </td>
            <td data-align="right">
                {editing ? (
                    <div className="flex items-center justify-end gap-1">
                        <input form={`asset-${asset.id}`} className="field numeric !h-8 w-20 text-right text-xs" aria-label="Retorno em %" inputMode="decimal" value={payout} onChange={(event) => setPayout(event.target.value)} />
                        <span className="text-xs text-text-3">%</span>
                    </div>
                ) : (
                    <span className="numeric font-medium text-up">{bpsPercent(asset.payout_rate_bps)}</span>
                )}
            </td>
            <td>
                <Switch checked={asset.is_active} onChange={(is_active) => save({ is_active })} label={asset.is_active ? 'Ativo' : 'Desativado'} />
            </td>
            <td data-align="right">
                {editing ? (
                    <div className="flex justify-end gap-1">
                        <button type="submit" form={`asset-${asset.id}`} className="btn btn-primary btn-sm" aria-label="Salvar">
                            <Check size={14} aria-hidden="true" />
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" aria-label="Cancelar" onClick={() => setEditing(false)}>
                            <X size={14} aria-hidden="true" />
                        </button>
                    </div>
                ) : (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
                        <Pencil size={13} aria-hidden="true" />
                        Editar
                    </button>
                )}
            </td>
        </tr>
    );
}

export default function Assets({ assets, categories, filters, counts }: { assets: AdminPage<Asset>; categories: { code: string; name: string }[]; filters: Filters; counts: { active: number; total: number } }) {
    const update = useFilters('/admin/ativos', filters);
    const [pending, setPending] = useState<PendingAction | null>(null);
    const [bulkPayout, setBulkPayout] = useState('85');

    return (
        <AdminLayout
            title="Ativos"
            description={`${counts.active} de ${counts.total} ativos disponíveis para negociar. Desativar tira o ativo da plataforma; um novo retorno vale só para operações abertas depois.`}
            actions={
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <input className="field numeric !h-9 w-24 !pr-7 text-right" aria-label="Retorno para todos, em %" inputMode="decimal" value={bulkPayout} onChange={(event) => setBulkPayout(event.target.value)} />
                        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-text-3">%</span>
                    </div>
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() =>
                            setPending({
                                url: '/admin/ativos/retorno',
                                title: `Aplicar ${bulkPayout}% ${filters.categoria ? `em ${CATEGORY_LABELS[filters.categoria] ?? filters.categoria}` : 'em todos os ativos'}`,
                                description: 'O novo retorno vale para as próximas operações. As operações abertas mantêm o retorno contratado.',
                                confirmLabel: 'Aplicar retorno',
                                data: { payout_rate_bps: toBps(bulkPayout), categoria: filters.categoria },
                            })
                        }
                    >
                        Aplicar a {filters.categoria ? 'esta categoria' : 'todos'}
                    </button>
                </div>
            }
        >
            <AdminCard title={<span className="numeric">{assets.total} ativo(s)</span>} action={<SearchBox value={filters.q} placeholder="Símbolo ou nome" onSearch={(q) => update({ q })} />}>
                <div className="flex flex-col gap-2 border-b border-ink-800 px-5 py-3">
                    <FilterChips
                        label="Categoria"
                        value={filters.categoria}
                        options={[{ value: null, label: 'Todas' }, ...categories.map((category) => ({ value: category.code, label: CATEGORY_LABELS[category.code] ?? category.name }))]}
                        onChange={(categoria) => update({ categoria })}
                    />
                    <FilterChips
                        label="Disponibilidade"
                        value={filters.situacao}
                        options={[
                            { value: null, label: 'Todos' },
                            { value: 'active', label: 'Ativos' },
                            { value: 'inactive', label: 'Desativados' },
                        ]}
                        onChange={(situacao) => update({ situacao })}
                    />
                </div>
                <div className="overflow-x-auto">
                    <table className="data-table min-w-[860px]">
                        <thead>
                            <tr>
                                <th>Ativo</th>
                                <th>Categoria</th>
                                <th>Dados</th>
                                <th data-align="right">Retorno</th>
                                <th>Disponível</th>
                                <th data-align="right" />
                            </tr>
                        </thead>
                        <tbody>
                            {assets.data.length === 0 && <EmptyRow colSpan={6}>Nenhum ativo com esses filtros.</EmptyRow>}
                            {assets.data.map((asset) => (
                                <AssetRow key={`${asset.id}-${asset.payout_rate_bps}-${asset.is_active}-${asset.name}`} asset={asset} />
                            ))}
                        </tbody>
                    </table>
                </div>
                <Pagination page={assets} />
            </AdminCard>
            <ActionDialog action={pending} onClose={() => setPending(null)} />
        </AdminLayout>
    );
}
