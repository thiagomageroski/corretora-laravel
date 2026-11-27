import { createInertiaApp } from '@inertiajs/react';
import type { ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import type { SharedProps } from '@/lib/types';
import { usePreferences } from '@/stores/preferences';

const pages = import.meta.glob<{ default: ComponentType }>('./pages/**/*.tsx');

createInertiaApp({
    title: (title) => (title ? `${title} · Nivora` : 'Nivora'),
    resolve: async (name) => {
        const page = pages[`./pages/${name}.tsx`];

        if (!page) {
            throw new Error(`Page not found: ${name}`);
        }

        return (await page()).default;
    },
    setup({ el, App, props }) {
        createRoot(el).render(
            <App {...props}>
                {({ Component, props: pageProps, key }) => {
                    /* Applied before the page renders, because pages format dates while rendering. */
                    const shared = pageProps as unknown as SharedProps;
                    usePreferences.getState().seed(shared.preferences, shared.auth?.user?.id);

                    return <Component key={key} {...pageProps} />;
                }}
            </App>,
        );
    },
    progress: { color: '#c6f24e', showSpinner: false },
});
