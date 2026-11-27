/**
 * Animated scrolling to sections of the same page. Browsers jump straight to
 * an anchor; this glides there with an ease-in-out curve, stops as soon as the
 * person scrolls by hand, and jumps instantly for people who turn motion off.
 */

/** Slow start, quick middle, gentle landing. */
export function easeInOutCubic(progress: number): number {
    const t = Math.min(1, Math.max(0, progress));

    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Longer trips take a little longer, within comfortable bounds. */
export function scrollDuration(distance: number): number {
    return Math.round(Math.min(1200, Math.max(650, Math.abs(distance) * 0.6)));
}

let cancelCurrent: (() => void) | null = null;

/**
 * The target is read again on every frame, so content that finishes loading
 * above it mid-way (images, fonts) moves the landing point instead of
 * leaving a jump at the end.
 */
export function smoothScrollTo(target: () => number): void {
    cancelCurrent?.();

    const startY = window.scrollY;
    const distance = target() - startY;

    if (Math.abs(distance) < 2 || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        window.scrollTo(0, target());

        return;
    }

    const duration = scrollDuration(distance);
    const startedAt = performance.now();
    let frame = 0;

    const stop = () => {
        cancelAnimationFrame(frame);
        window.removeEventListener('wheel', stop);
        window.removeEventListener('touchstart', stop);
        window.removeEventListener('keydown', stop);
        cancelCurrent = null;
    };

    const step = (now: number) => {
        const progress = (now - startedAt) / duration;
        window.scrollTo(0, startY + (target() - startY) * easeInOutCubic(progress));

        if (progress < 1) {
            frame = requestAnimationFrame(step);
        } else {
            stop();
        }
    };

    // Taking over by hand always wins over the animation.
    window.addEventListener('wheel', stop, { passive: true });
    window.addEventListener('touchstart', stop, { passive: true });
    window.addEventListener('keydown', stop);
    cancelCurrent = stop;
    frame = requestAnimationFrame(step);
}

/**
 * Glides to the element with this id, leaving room for the sticky header
 * through its scroll-margin-top. Returns false when there is no such section.
 */
export function scrollToSection(id: string): boolean {
    const element = document.getElementById(id);

    if (!element) return false;

    const margin = parseFloat(getComputedStyle(element).scrollMarginTop) || 0;
    smoothScrollTo(() => Math.max(0, element.getBoundingClientRect().top + window.scrollY - margin));
    history.replaceState(history.state, '', `#${id}`);

    return true;
}

/**
 * The section id an anchor points to on the page being shown, such as
 * "ativos" for "#ativos" or "/#ativos" while on "/". Null for anything else.
 */
export function samePageSection(href: string, currentPath: string): string | null {
    const match = /^([^#?]*)#([\w-]+)$/.exec(href);

    if (!match) return null;

    const path = match[1];

    return path === '' || path === currentPath ? match[2] : null;
}
