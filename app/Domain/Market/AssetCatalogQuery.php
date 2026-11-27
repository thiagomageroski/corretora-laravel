<?php

namespace App\Domain\Market;

use App\Models\Asset;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

class AssetCatalogQuery
{
    /**
     * @param  array{q?: ?string, category?: ?string, favorites?: mixed}  $filters
     * @return Builder<Asset>
     */
    public function for(User $user, array $filters = []): Builder
    {
        $search = $filters['q'] ?? null;
        $category = $filters['category'] ?? null;

        return Asset::query()
            ->active()
            ->with(['quote', 'category'])
            ->withExists(['quote as has_quote', 'favoritedBy as favorited_by_user' => fn (Builder $query) => $query->whereKey($user->id)])
            ->when($search, function (Builder $query, string $term): void {
                $like = '%'.addcslashes($term, '%_\\').'%';
                $query->where(fn (Builder $inner) => $inner->where('symbol', 'like', $like)->orWhere('name', 'like', $like));
            })
            ->when($category, fn (Builder $query, string $code) => $query->whereRelation('category', 'code', $code))
            ->when(! empty($filters['favorites']), fn (Builder $query) => $query->whereHas('favoritedBy', fn (Builder $inner) => $inner->whereKey($user->id)))
            ->orderByDesc('has_quote')
            ->orderBy('asset_category_id')
            ->orderBy('id');
    }
}
