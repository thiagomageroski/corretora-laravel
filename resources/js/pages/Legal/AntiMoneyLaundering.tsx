import { usePage } from '@inertiajs/react';
import { Bullets, Callout, CompanyCard, DocLink, LegalDocument, type LegalSection } from '@/components/legal/LegalDocument';
import { formatCents } from '@/lib/format';
import type { LegalEntity } from '@/lib/legal';
import type { SharedProps } from '@/lib/types';

type RealLimits = { minimum_age: number; min_deposit_cents: number; min_withdrawal_cents: number; daily_withdrawal_limit_cents: number; require_payer_match: boolean };

export default function AntiMoneyLaundering({ real, company }: { real: RealLimits; company: LegalEntity }) {
    const { appName } = usePage<SharedProps>().props;

    const sections: LegalSection[] = [
        {
            id: 'compromisso',
            title: 'Nosso compromisso',
            body: (
                <p>
                    A {appName} não tolera o uso da plataforma para lavagem de dinheiro, financiamento do terrorismo, fraude ou qualquer atividade ilícita. Esta política descreve os controles adotados, inspirados na Lei nº 9.613/1998, e o
                    que esperamos de cada usuário.
                </p>
            ),
        },
        {
            id: 'identificacao',
            title: 'Conheça seu cliente (KYC)',
            body: (
                <Bullets
                    items={[
                        `Para abrir a conta real é preciso ter mais de ${real.minimum_age} anos e informar nome completo, CPF válido e data de nascimento.`,
                        'Cada CPF pode estar vinculado a uma única conta. Tentativas de abrir contas com dados de outra pessoa ou de manter várias contas levam ao bloqueio.',
                        'Podemos pedir, a qualquer momento, documentos que comprovem identidade, endereço ou a origem dos recursos, e suspender a conta real até o envio.',
                    ]}
                />
            ),
        },
        {
            id: 'titularidade',
            title: 'Titularidade dos pagamentos',
            body: (
                <Bullets
                    items={[
                        real.require_payer_match
                            ? 'Depósitos devem ser pagos a partir de uma conta no CPF do titular. Pagamentos de outra pessoa não são creditados: ficam retidos para análise e devolução à origem.'
                            : 'Depósitos devem ser pagos a partir de uma conta no CPF do titular. Pagamentos de outra pessoa podem ser retidos para análise.',
                        'Saques só são enviados a chaves PIX registradas no CPF do titular. Não fazemos pagamentos a terceiros.',
                        'Pagamentos fora do prazo da cobrança ou com valor diferente do cobrado também ficam retidos para análise antes de qualquer crédito.',
                    ]}
                />
            ),
        },
        {
            id: 'limites',
            title: 'Limites e verificação de saques',
            body: (
                <Bullets
                    items={[
                        `Depósito mínimo de ${formatCents(real.min_deposit_cents)}, saque mínimo de ${formatCents(real.min_withdrawal_cents)} e limite de ${formatCents(real.daily_withdrawal_limit_cents)} em saques por dia, por titular.`,
                        'Pedidos de saque passam por verificação antes do envio e podem ser aprovados manualmente pela equipe.',
                        'O valor do saque fica reservado durante a análise e volta ao saldo se o pedido for recusado.',
                    ]}
                />
            ),
        },
        {
            id: 'monitoramento',
            title: 'Monitoramento de operações atípicas',
            body: (
                <>
                    <p>Movimentações são acompanhadas para identificar sinais de risco, como:</p>
                    <Bullets
                        items={[
                            'depósitos e saques incompatíveis com o perfil ou a atividade da conta;',
                            'entrada e saída de recursos com pouca ou nenhuma negociação no intervalo;',
                            'fracionamento de valores para evitar limites;',
                            'uso de vários meios de pagamento, contas ou dispositivos ligados a pessoas diferentes;',
                            'tentativas repetidas de pagamento por terceiros.',
                        ]}
                    />
                    <p>
                        Nesses casos, podemos pedir esclarecimentos, reter valores durante a análise, recusar operações, encerrar a conta e comunicar as autoridades competentes quando a lei exigir, sem aviso prévio ao usuário quando a
                        comunicação for sigilosa por lei.
                    </p>
                </>
            ),
        },
        {
            id: 'registros',
            title: 'Guarda de registros',
            body: (
                <p>
                    Os dados de identificação e os registros de depósitos, saques e operações da conta real são guardados por pelo menos 5 anos após o encerramento da conta, como exige o art. 10 da Lei nº 9.613/1998, mesmo que você peça a
                    exclusão dos seus dados. Detalhes na <DocLink href="/privacidade">política de privacidade</DocLink>.
                </p>
            ),
        },
        {
            id: 'responsabilidades',
            title: 'O que esperamos de você',
            body: (
                <>
                    <Bullets
                        items={[
                            'usar apenas recursos próprios e de origem lícita;',
                            'manter seus dados atualizados e responder aos pedidos de informação;',
                            'não emprestar, vender ou compartilhar a conta, e não operar em nome de outra pessoa;',
                            'avisar o atendimento se perceber qualquer movimentação que não reconhece.',
                        ]}
                    />
                    <Callout>
                        O descumprimento desta política pode levar à suspensão ou ao encerramento da conta, conforme os <DocLink href="/termos">termos de uso</DocLink>.
                    </Callout>
                </>
            ),
        },
        {
            id: 'contato',
            title: 'Contato',
            body: <CompanyCard company={company} />,
        },
    ];

    return (
        <LegalDocument
            title="Prevenção à lavagem de dinheiro"
            summary={<p>Os controles que a {appName} adota para identificar clientes, conferir a titularidade dos pagamentos e evitar o uso da plataforma para fins ilícitos.</p>}
            sections={sections}
        />
    );
}
