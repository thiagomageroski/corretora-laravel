<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['user_id', 'event', 'ip_address', 'user_agent', 'created_at'])]
class LoginEvent extends Model
{
    public const UPDATED_AT = null;
}
