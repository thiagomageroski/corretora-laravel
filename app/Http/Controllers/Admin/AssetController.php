<?php

namespace App\Http\Controllers\Admin;

use App\Domain\Audit\AuditLogger;
use App\Http\Controllers\Controller;
use App\Models\Asset;
use App\Models\AssetCategory;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The asset catalog: availability and payout of each asset. A new payout
 * applies to positions opened afterwards; open ones keep their contract.
 */
class AssetController extends Controller
{
    private const PAYOUT_RULES = ['required', 'integer', 'min:1000', 'max:9500'];

    public function index(Request $request): Response
    {
        $filters = $request->validate([
            'q' => ['nullable', 'string', 'max:60'],
            'categoria' => ['nullable', 'string', 'exists:asset_categories,code'],
            'situacao' => ['nullable', Rule::in(['active', 'inactive'])],
        ]);
        $search = trim((string) ($filters['q'] ?? ''));

        $assets = Asset::query()
            ->with(['category:id,code,name', 'quote'])
            ->when($search !== '', fn ($query) => $query->where(fn ($inner) => $inner->where('symbol', 'like', "%{$search}%")->orWhere('name', 'like', "%{$search}%")))
            ->when($filters['categoria'] ?? null, fn ($query, string $code) => $query->whereHas('category', fn ($category) => $category->where('code', $code)))
            ->when($filters['situacao'] ?? null, fn ($query, string $state) => $query->where('is_active', $state === 'active'))
            ->orderBy('asset_category_id')
            ->orderBy('symbol')
            ->paginate(50)
            ->withQueryString()
            ->through(fn (Asset $asset): array => [
                'id' => $asset->id,
                'symbol' => $asset->symbol,
                'name' => $asset->name,
                'category' => $asset->category?->code,
                'provider' => $asset->provider_code,
                'session' => $asset->session,
                'payout_rate_bps' => $asset->payout_rate_bps,
                'is_active' => $asset->is_active,
                'has_quote' => $asset->quote !== null,
                'quote_at' => $asset->quote?->updated_at?->toIso8601ZuluString(),
            ]);

        return Inertia::render('Admin/Assets', [
            'assets' => $assets,
            'categories' => AssetCategory::query()->orderBy('sort')->get(['code', 'name']),
            'filters' => ['q' => $search, 'categoria' => $filters['categoria'] ?? null, 'situacao' => $filters['situacao'] ?? null],
            'counts' => ['active' => Asset::query()->where('is_active', true)->count(), 'total' => Asset::query()->count()],
        ]);
    }

    public function update(Request $request, Asset $asset, AuditLogger $audit): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'payout_rate_bps' => self::PAYOUT_RULES,
            'is_active' => ['required', 'boolean'],
        ]);

        $asset->fill($validated);

        if ($asset->isDirty('is_active')) {
            $asset->delisted_at = null;
        }

        $asset->save();
        $audit->record('admin.asset_updated', $asset, $request->user()->id, ['changes' => $asset->getChanges()]);

        return back()->with('status', "{$asset->symbol} atualizado.");
    }

    /**
     * Same payout for every asset, or every asset of one category.
     */
    public function bulkPayout(Request $request, AuditLogger $audit): RedirectResponse
    {
        $validated = $request->validate([
            'payout_rate_bps' => self::PAYOUT_RULES,
            'categoria' => ['nullable', 'string', 'exists:asset_categories,code'],
        ]);

        $count = Asset::query()
            ->when($validated['categoria'] ?? null, fn ($query, string $code) => $query->whereHas('category', fn ($category) => $category->where('code', $code)))
            ->update(['payout_rate_bps' => $validated['payout_rate_bps']]);

        $audit->record('admin.asset_payout_bulk', null, $request->user()->id, [
            'payout_rate_bps' => $validated['payout_rate_bps'],
            'category' => $validated['categoria'] ?? 'todas',
            'count' => $count,
        ]);

        return back()->with('status', "Retorno de {$this->percent($validated['payout_rate_bps'])} aplicado a {$count} ativo(s).");
    }

    private function percent(int $bps): string
    {
        return rtrim(rtrim(number_format($bps / 100, 2, ',', ''), '0'), ',').'%';
    }
}
