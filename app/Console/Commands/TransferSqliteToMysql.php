<?php

namespace App\Console\Commands;

use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Database\Connection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Throwable;

/**
 * Copies every row of the old SQLite database into the MySQL database the
 * platform now runs on, keeping ids, then compares the row count of each
 * table. The target is emptied first, so a rehearsal can be run as often as
 * needed before the real switch.
 */
#[Signature('db:transfer-from-sqlite {--source=legacy_sqlite : Connection of the SQLite file to read} {--force : Run without asking for confirmation}')]
#[Description('Copy all data from the old SQLite file into the MySQL database, keeping ids, and verify the counts')]
class TransferSqliteToMysql extends Command
{
    /**
     * Rebuilt by the application on demand; copying them only carries stale entries.
     */
    private const SKIPPED = ['migrations', 'cache', 'cache_locks'];

    private const CHUNK = 500;

    public function handle(): int
    {
        $source = DB::connection((string) $this->option('source'));
        $target = DB::connection();

        if ($source->getDriverName() !== 'sqlite' || ! in_array($target->getDriverName(), ['mysql', 'mariadb'], true)) {
            $this->error('The source must be SQLite and the default connection MySQL or MariaDB (set DB_CONNECTION=mysql).');

            return self::FAILURE;
        }

        if (! is_file((string) $source->getConfig('database'))) {
            $this->error("SQLite file not found: {$source->getConfig('database')}");

            return self::FAILURE;
        }

        if (! $this->option('force') && ! $this->confirm("Replace every table of [{$target->getDatabaseName()}] with the data from the SQLite file?")) {
            return self::FAILURE;
        }

        $tables = $this->sourceTables($source);
        $missing = array_diff($tables, Schema::connection($target->getName())->getTableListing(schemaQualified: false));

        if ($missing !== []) {
            $this->error('Run the migrations first; missing tables in MySQL: '.implode(', ', $missing));

            return self::FAILURE;
        }

        $target->statement('SET FOREIGN_KEY_CHECKS=0');
        $report = [];
        $failed = false;

        try {
            foreach ($tables as $table) {
                $copied = $this->copyTable($source, $target, $table);
                $expected = $source->table($table)->count();
                $actual = $target->table($table)->count();
                $failed = $failed || $actual !== $expected;
                $report[] = [$table, $expected, $actual, $copied === $expected && $actual === $expected ? 'ok' : 'DIFERENTE'];
            }
        } catch (Throwable $exception) {
            $this->error($exception->getMessage());
            $failed = true;
        } finally {
            $target->statement('SET FOREIGN_KEY_CHECKS=1');
        }

        $this->table(['Tabela', 'SQLite', 'MySQL', 'Situação'], $report);

        if ($failed) {
            $this->error('The transfer is incomplete; keep the platform on SQLite and check the table above.');

            return self::FAILURE;
        }

        $this->info('All tables copied and verified.');

        return self::SUCCESS;
    }

    /**
     * @return list<string>
     */
    private function sourceTables(Connection $source): array
    {
        return collect($source->select("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"))
            ->pluck('name')
            ->reject(fn (string $name): bool => in_array($name, self::SKIPPED, true))
            ->values()
            ->all();
    }

    /**
     * Empties the table, then copies it in insertion order. TRUNCATE does not
     * fire the append-only triggers, so the ledger can be reloaded.
     */
    private function copyTable(Connection $source, Connection $target, string $table): int
    {
        $columns = Schema::connection($target->getName())->getColumnListing($table);
        $target->table($table)->truncate();

        $copied = 0;
        $batch = [];

        foreach ($source->table($table)->orderByRaw('rowid')->cursor() as $row) {
            $batch[] = array_intersect_key((array) $row, array_flip($columns));

            if (count($batch) === self::CHUNK) {
                $target->table($table)->insert($batch);
                $copied += count($batch);
                $batch = [];
            }
        }

        if ($batch !== []) {
            $target->table($table)->insert($batch);
            $copied += count($batch);
        }

        $this->line("  {$table}: {$copied}");

        return $copied;
    }
}
