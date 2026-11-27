<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Asset;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class FavoriteController extends Controller
{
    public function store(Request $request, Asset $asset): Response
    {
        $request->user()->favoriteAssets()->syncWithoutDetaching([$asset->id => ['created_at' => now()]]);

        return response()->noContent();
    }

    public function destroy(Request $request, Asset $asset): Response
    {
        $request->user()->favoriteAssets()->detach($asset->id);

        return response()->noContent();
    }
}
