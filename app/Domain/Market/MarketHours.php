<?php

namespace App\Domain\Market;

use Carbon\CarbonImmutable;

/**
 * Regular trading sessions from config/market.php. Exchange holidays are not modelled.
 */
class MarketHours
{
    public function isOpen(string $session, CarbonImmutable $at): bool
    {
        $definition = config("market.sessions.{$session}");

        if ($definition === null) {
            return false;
        }

        if ($definition['always_open'] ?? false) {
            return true;
        }

        $local = $at->setTimezone($definition['timezone']);

        if (isset($definition['week_open'])) {
            return $this->minuteOfWeek($local) >= $this->weekMinute($definition['week_open'])
                && $this->minuteOfWeek($local) < $this->weekMinute($definition['week_close']);
        }

        $time = $local->format('H:i');

        return in_array($local->dayOfWeek, $definition['days'], true)
            && $time >= $definition['open']
            && $time < $definition['close'];
    }

    public function label(string $session): string
    {
        return (string) config("market.sessions.{$session}.label", 'Horário não configurado');
    }

    private function minuteOfWeek(CarbonImmutable $local): int
    {
        return $local->dayOfWeek * 1440 + $local->hour * 60 + $local->minute;
    }

    /**
     * @param  array{0: int, 1: string}  $point
     */
    private function weekMinute(array $point): int
    {
        [$hour, $minute] = array_map('intval', explode(':', $point[1]));

        return $point[0] * 1440 + $hour * 60 + $minute;
    }
}
