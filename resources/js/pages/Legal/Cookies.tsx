import { usePage } from '@inertiajs/react';
import { Bullets, Callout, CompanyCard, DocLink, LegalDocument, LegalTable, type LegalSection } from '@/components/legal/LegalDocument';
import type { LegalEntity } from '@/lib/legal';
import type { SharedProps } from '@/lib/types';

type CookieFacts = { session_name: string; session_minutes: number; remember_name: string; remember_days: number };

function minutesLabel(minutes: number): string {
    if (minutes % 60 === 0) {
        const hours = minutes / 60;

        return hours === 1 ? '1 hora' : `${hours} horas`;
    }

    return `${minutes} minutos`;
}

function Code({ children }: { children: string }) {
    return <code className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-[12px] break-all text-text-1">{children}</code>;
}

export default function Cookies({ cookies, company }: { cookies: CookieFacts; company: LegalEntity }) {
    const { appName } = usePage<SharedProps>().props;
    const idle = minutesLabel(cookies.session_minutes);

    const sections: LegalSection[] = [
        {
            id: 'o-que-sao',
            title: 'O que são cookies',
            body: (
                <p>
                    Cookies são pequenos arquivos que um site guarda no seu navegador para lembrar informações entre uma página e outra, como o fato de você estar conectado. Tecnologias parecidas, como o armazenamento local do navegador
                    (local storage), guardam dados no seu próprio dispositivo.
                </p>
            ),
        },
        {
            id: 'quais-usamos',
            title: 'Cookies que usamos',
            body: (
                <>
                    <p>
                        A {appName} usa apenas cookies essenciais, sem os quais não é possível entrar na conta nem operar com segurança. Por isso eles não dependem de consentimento, como permite a LGPD para o funcionamento do serviço pedido
                        por você.
                    </p>
                    <LegalTable
                        head={['Cookie', 'Para que serve', 'Duração', 'Tipo']}
                        rows={[
                            [<Code key="session">{cookies.session_name}</Code>, 'Mantém a sua sessão: identifica que é você navegando depois de entrar na conta.', `Expira após ${idle} sem uso.`, 'Essencial, próprio'],
                            [<Code key="xsrf">XSRF-TOKEN</Code>, 'Protege formulários e ações contra falsificação de requisições entre sites (CSRF).', `Expira após ${idle} sem uso.`, 'Essencial, próprio'],
                            [
                                <Code key="remember">{cookies.remember_name}</Code>,
                                'Mantém você conectado entre visitas. Só é criado se você marcar "Manter conectado neste dispositivo" ao entrar, e é apagado ao sair da conta.',
                                `Até ${cookies.remember_days} dias.`,
                                'Essencial, próprio',
                            ],
                        ]}
                    />
                    <p>Todos trafegam apenas pela conexão segura do site (HTTPS) e não são enviados a outros sites. Os cookies de sessão e de manter conectado também não podem ser lidos por scripts da página.</p>
                </>
            ),
        },
        {
            id: 'armazenamento-local',
            title: 'Armazenamento local do navegador',
            body: (
                <>
                    <p>Para deixar a plataforma do seu jeito, algumas escolhas ficam guardadas apenas no seu navegador e nunca são enviadas a terceiros:</p>
                    <Bullets items={['painéis abertos ou recolhidos na tela de negociação;', 'desenhos feitos no gráfico de cada ativo;', 'avisos que você já dispensou, como o cartão de primeiros passos e o aviso de cookies.']} />
                    <p>Limpar os dados do site no navegador apaga essas escolhas, sem afetar sua conta, seu saldo ou suas operações.</p>
                </>
            ),
        },
        {
            id: 'terceiros',
            title: 'O que não usamos',
            body: (
                <>
                    <Bullets items={['cookies de publicidade ou de redes sociais;', 'ferramentas de análise ou rastreamento de terceiros;', 'pixels, fingerprinting ou qualquer forma de acompanhar você em outros sites.']} />
                    <p>As fontes e os recursos visuais são servidos pelo próprio site, sem chamadas a serviços externos no seu navegador.</p>
                    <Callout>Se algum dia passarmos a usar cookies que não sejam essenciais, eles só serão ativados com o seu consentimento, e esta política será atualizada antes.</Callout>
                </>
            ),
        },
        {
            id: 'gerenciar',
            title: 'Como gerenciar',
            body: (
                <>
                    <p>Você pode ver, bloquear e apagar cookies nas configurações do seu navegador. Os caminhos mais comuns são:</p>
                    <Bullets
                        items={[
                            'Chrome: Configurações › Privacidade e segurança › Cookies e outros dados do site;',
                            'Safari: Ajustes › Safari › Avançado › Dados dos Sites (iPhone) ou Ajustes › Privacidade (Mac);',
                            'Firefox: Configurações › Privacidade e Segurança › Cookies e dados de sites;',
                            'Edge: Configurações › Cookies e permissões de site.',
                        ]}
                    />
                    <p>Como todos os cookies da {appName} são essenciais, bloqueá-los impede entrar na conta e operar.</p>
                </>
            ),
        },
        {
            id: 'mais-informacoes',
            title: 'Mais informações',
            body: (
                <>
                    <p>
                        O uso dos seus dados pessoais em geral está descrito na <DocLink href="/privacidade">política de privacidade</DocLink>. Dúvidas sobre cookies podem ser enviadas pelos canais abaixo.
                    </p>
                    <CompanyCard company={company} />
                </>
            ),
        },
    ];

    return <LegalDocument title="Política de cookies" summary={<p>Quais cookies a {appName} usa, para quê, por quanto tempo e como você pode controlá-los.</p>} sections={sections} />;
}
