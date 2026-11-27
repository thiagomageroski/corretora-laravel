<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Profile photos live on the private disk and are only served to their owner.
 */
class AvatarController extends Controller
{
    public function show(Request $request): StreamedResponse
    {
        $path = $request->user()->avatar_path;

        abort_if($path === null || ! Storage::disk('local')->exists($path), 404);

        return Storage::disk('local')->response($path, null, ['Cache-Control' => 'private, max-age=86400']);
    }

    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'photo' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048', 'dimensions:min_width=64,min_height=64,max_width=4096,max_height=4096'],
        ], [
            'photo.image' => 'Envie uma imagem.',
            'photo.mimes' => 'Use uma foto JPG, PNG ou WebP.',
            'photo.max' => 'A foto pode ter no máximo 2 MB.',
            'photo.dimensions' => 'A foto precisa ter entre 64 e 4096 pixels de lado.',
        ]);

        $user = $request->user();
        $previous = $user->avatar_path;
        $path = $request->file('photo')->storeAs('avatars', $user->id.'-'.Str::lower(Str::random(12)).'.'.$request->file('photo')->extension(), 'local');

        $user->forceFill(['avatar_path' => $path])->save();

        if ($previous !== null) {
            Storage::disk('local')->delete($previous);
        }

        return response()->json(['avatar_url' => $user->avatarUrl()]);
    }

    public function destroy(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user->avatar_path !== null) {
            Storage::disk('local')->delete($user->avatar_path);
            $user->forceFill(['avatar_path' => null])->save();
        }

        return response()->json(['avatar_url' => null]);
    }
}
