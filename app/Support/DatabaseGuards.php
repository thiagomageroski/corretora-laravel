<?php

namespace App\Support;

use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Integrity rules enforced by the database itself, so they hold even for code
 * or people that bypass the Eloquent models.
 */
final class DatabaseGuards
{
    /**
     * Reject every UPDATE and DELETE on the given table.
     */
    public static function appendOnly(string $table): void
    {
        foreach (['UPDATE', 'DELETE'] as $operation) {
            self::rejectTrigger($table, strtolower($operation).'_forbidden', $operation, 'TRUE', "{$table} is append-only");
        }
    }

    /**
     * Reject inserts matching a condition written in terms of NEW.
     */
    public static function rejectInsertWhen(string $table, string $name, string $condition, string $message): void
    {
        self::rejectTrigger($table, $name, 'INSERT', $condition, $message);
    }

    /**
     * Freeze contract terms from creation, freeze the whole row once settled, and forbid deletes.
     */
    public static function writeOnceAfterSettlement(string $table): void
    {
        self::rejectTrigger(
            $table,
            'terms_frozen',
            'UPDATE',
            'NEW.entry_price <> OLD.entry_price OR NEW.stake_cents <> OLD.stake_cents OR NEW.direction <> OLD.direction'
            .' OR NEW.payout_rate_bps <> OLD.payout_rate_bps OR NEW.expires_at <> OLD.expires_at OR NEW.opened_at <> OLD.opened_at',
            'Contract terms are immutable',
        );
        self::rejectTrigger($table, 'settled_frozen', 'UPDATE', 'OLD.result IS NOT NULL', 'Settled positions are immutable');
        self::rejectTrigger($table, 'delete_forbidden', 'DELETE', 'TRUE', "{$table} rows cannot be deleted");
    }

    private static function rejectTrigger(string $table, string $name, string $operation, string $condition, string $message): void
    {
        $trigger = "{$table}_{$name}";
        $driver = DB::getDriverName();

        match ($driver) {
            'sqlite' => DB::unprepared(
                "CREATE TRIGGER {$trigger} BEFORE {$operation} ON {$table} WHEN {$condition}
                 BEGIN SELECT RAISE(ABORT, '{$message}'); END;"
            ),
            'mysql', 'mariadb' => self::mysqlTrigger($trigger, $table, $operation, $condition, $message),
            'pgsql' => DB::unprepared(
                "CREATE FUNCTION {$trigger}_fn() RETURNS trigger AS \$guard\$
                 BEGIN RAISE EXCEPTION '{$message}'; END;
                 \$guard\$ LANGUAGE plpgsql;
                 CREATE TRIGGER {$trigger} BEFORE {$operation} ON {$table}
                 FOR EACH ROW WHEN ({$condition}) EXECUTE FUNCTION {$trigger}_fn();"
            ),
            default => throw new RuntimeException("Database guards are not implemented for driver [{$driver}]."),
        };
    }

    /**
     * MySQL/MariaDB version: SIGNAL aborts the statement, like RAISE(ABORT).
     *
     * With binary logging on, creating a trigger needs SUPER unless the server
     * sets log_bin_trust_function_creators (error 1419). Hosting panels rarely
     * grant that, so the guard is reported and skipped: the application code
     * keeps the same rules, the trigger is only a second line of defence.
     */
    private static function mysqlTrigger(string $trigger, string $table, string $operation, string $condition, string $message): void
    {
        try {
            DB::unprepared(
                "CREATE TRIGGER `{$trigger}` BEFORE {$operation} ON `{$table}` FOR EACH ROW
                 BEGIN
                     IF {$condition} THEN
                         SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '{$message}';
                     END IF;
                 END"
            );
        } catch (QueryException $exception) {
            if ((int) ($exception->errorInfo[1] ?? 0) !== 1419) {
                throw $exception;
            }

            $warning = "Database guard {$trigger} skipped: the MySQL user cannot create triggers while binary logging is on (enable log_bin_trust_function_creators to add it).";
            Log::warning($warning);
            fwrite(STDERR, "  ! {$warning}\n");
        }
    }
}
