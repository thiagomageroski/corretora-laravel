import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

function prefersReducedMotion(): boolean {
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * True once the element has scrolled into view. Stays true, so content never
 * disappears again while reading.
 */
function useInView<T extends Element>(margin = '0px 0px -12% 0px') {
    const ref = useRef<T>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const element = ref.current;

        if (!element || visible) return;

        if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
            setVisible(true);

            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry?.isIntersecting) {
                    setVisible(true);
                    observer.disconnect();
                }
            },
            { rootMargin: margin },
        );
        observer.observe(element);

        return () => observer.disconnect();
    }, [margin, visible]);

    return { ref, visible };
}

/**
 * Fades and lifts its content in when it reaches the screen.
 */
export function Reveal({ children, delay = 0, className = '', as: Tag = 'div' }: { children: ReactNode; delay?: number; className?: string; as?: 'div' | 'li' | 'section' }) {
    const { ref, visible } = useInView<HTMLDivElement>();
    const style = { '--reveal-delay': `${delay}ms` } as CSSProperties;

    return (
        <Tag ref={ref as never} data-visible={visible} style={style} className={`reveal ${className}`}>
            {children}
        </Tag>
    );
}

/**
 * Counts up to a number the first time it is seen.
 */
export function CountUp({ value, duration = 1400, className = '' }: { value: number; duration?: number; className?: string }) {
    const { ref, visible } = useInView<HTMLSpanElement>();
    const [shown, setShown] = useState(0);

    useEffect(() => {
        if (!visible) return;

        if (prefersReducedMotion()) {
            setShown(value);

            return;
        }

        let frame = 0;
        const start = performance.now();
        const step = (now: number) => {
            const progress = Math.min(1, (now - start) / duration);
            setShown(Math.round(value * (1 - Math.pow(1 - progress, 3))));

            if (progress < 1) frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);

        return () => cancelAnimationFrame(frame);
    }, [visible, value, duration]);

    return (
        <span ref={ref} className={className}>
            {shown.toLocaleString('pt-BR')}
        </span>
    );
}
