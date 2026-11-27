/**
 * Keyboard shortcuts of the trading screen. Kept in one place so the settings
 * page lists exactly what the screen does.
 */
export type ShortcutAction = 'call' | 'put' | 'stake-up' | 'stake-down' | 'duration';

export const SHORTCUTS: { label: string; keys: string[] }[] = [
    { label: 'Operar CALL (alta)', keys: ['Shift', '↑'] },
    { label: 'Operar PUT (baixa)', keys: ['Shift', '↓'] },
    { label: 'Aumentar valor', keys: ['+'] },
    { label: 'Diminuir valor', keys: ['-'] },
    { label: 'Escolher prazo', keys: ['1', '…', '5'] },
];

/**
 * Translate a key press into a trading action, or null when it is not a
 * shortcut. Typing in a field never triggers one.
 */
export function shortcutFor(event: KeyboardEvent): { action: ShortcutAction; index?: number } | null {
    const target = event.target as HTMLElement | null;

    if (event.ctrlKey || event.metaKey || event.altKey || target?.closest('input, textarea, select, [contenteditable="true"]')) {
        return null;
    }

    if (event.shiftKey && event.key === 'ArrowUp') return { action: 'call' };
    if (event.shiftKey && event.key === 'ArrowDown') return { action: 'put' };
    if (event.key === '+' || event.key === '=') return { action: 'stake-up' };
    if (event.key === '-') return { action: 'stake-down' };
    if (/^[1-5]$/.test(event.key)) return { action: 'duration', index: Number(event.key) - 1 };

    return null;
}
