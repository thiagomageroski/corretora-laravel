import { describe, expect, it } from 'vitest';
import { shortcutFor } from './shortcuts';

function press(key: string, options: { shift?: boolean; ctrl?: boolean; inField?: boolean } = {}): KeyboardEvent {
    return {
        key,
        shiftKey: options.shift ?? false,
        ctrlKey: options.ctrl ?? false,
        metaKey: false,
        altKey: false,
        target: { closest: () => (options.inField ? {} : null) },
    } as unknown as KeyboardEvent;
}

describe('shortcutFor', () => {
    it('maps shift and arrows to trades', () => {
        expect(shortcutFor(press('ArrowUp', { shift: true }))).toEqual({ action: 'call' });
        expect(shortcutFor(press('ArrowDown', { shift: true }))).toEqual({ action: 'put' });
    });

    it('needs shift for trades, so a plain arrow only scrolls', () => {
        expect(shortcutFor(press('ArrowUp'))).toBeNull();
    });

    it('changes stake and duration', () => {
        expect(shortcutFor(press('+'))).toEqual({ action: 'stake-up' });
        expect(shortcutFor(press('-'))).toEqual({ action: 'stake-down' });
        expect(shortcutFor(press('3'))).toEqual({ action: 'duration', index: 2 });
        expect(shortcutFor(press('6'))).toBeNull();
    });

    it('never fires while typing in a field or with a modifier', () => {
        expect(shortcutFor(press('ArrowUp', { shift: true, inField: true }))).toBeNull();
        expect(shortcutFor(press('2', { inField: true }))).toBeNull();
        expect(shortcutFor(press('+', { ctrl: true }))).toBeNull();
    });
});
