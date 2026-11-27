let context: AudioContext | null = null;

const TONES: Record<'won' | 'lost' | 'neutral', number[]> = {
    won: [660, 880],
    lost: [330, 247],
    neutral: [440],
};

/**
 * Short synthesized tone for a settled operation. Browsers block audio until the
 * user interacts with the page, in which case it simply stays silent.
 */
export function playResultTone(result: keyof typeof TONES): void {
    try {
        context ??= new AudioContext();
        void context.resume();

        TONES[result].forEach((frequency, index) => {
            const startsAt = (context as AudioContext).currentTime + index * 0.11;
            const oscillator = (context as AudioContext).createOscillator();
            const gain = (context as AudioContext).createGain();

            oscillator.type = 'sine';
            oscillator.frequency.value = frequency;
            gain.gain.setValueAtTime(0.0001, startsAt);
            gain.gain.exponentialRampToValueAtTime(0.09, startsAt + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + 0.16);
            oscillator.connect(gain).connect((context as AudioContext).destination);
            oscillator.start(startsAt);
            oscillator.stop(startsAt + 0.18);
        });
    } catch {
        /* Audio is a nicety; the on-screen notice carries the same information. */
    }
}
