import { Head, usePage } from '@inertiajs/react';
import { useEffect } from 'react';
import AccountSettings, { ACCOUNT_TABS } from '@/components/account/AccountSettings';
import { Page } from '@/components/ui';
import AppLayout from '@/layouts/AppLayout';
import { formatDateTime } from '@/lib/format';
import type { SharedProps } from '@/lib/types';
import { useAccountPanel, type AccountTab } from '@/stores/accountPanel';

export default function Account() {
    const { props, url } = usePage<SharedProps>();
    const user = props.auth.user;
    const setTab = useAccountPanel((state) => state.setTab);

    useEffect(() => {
        const requested = new URLSearchParams(url.split('?')[1] ?? '').get('secao');

        if (requested && ACCOUNT_TABS.some((item) => item.value === requested)) {
            setTab(requested as AccountTab);
        }
    }, [url, setTab]);

    return (
        <AppLayout>
            <Head title="Minha conta" />
            <Page width="max-w-6xl">
                <div className="flex flex-wrap items-end justify-between gap-3 border-b border-ink-800 pb-5">
                    <div>
                        <h1 className="text-[26px] leading-tight font-bold tracking-[-0.02em]">Minha conta</h1>
                        <p className="mt-1.5 text-[13px] text-text-2">Dados pessoais, notificações, pagamentos, segurança e preferências de negociação.</p>
                    </div>
                    <dl className="text-right text-xs text-text-3">
                        <div>
                            Data de cadastro: <span className="text-text-2">{user?.member_since ? formatDateTime(user.member_since).split(',')[0] : '—'}</span>
                        </div>
                        <div className="mt-0.5">
                            ID de perfil: <span className="numeric text-text-2">{user?.profile_id}</span>
                        </div>
                    </dl>
                </div>
                <AccountSettings layout="page" />
            </Page>
        </AppLayout>
    );
}
