import { usePage } from '@inertiajs/react';
import { Bullets, Callout, CompanyCard, DocLink, LegalDocument, type LegalSection } from '@/components/legal/LegalDocument';
import { breakEvenRate, formatCents, formatDuration } from '@/lib/format';
import type { LegalEntity } from '@/lib/legal';
import type { SharedProps, TradingRules } from '@/lib/types';

export default function Risks({ trading, company }: { trading: TradingRules; company: LegalEntity }) {
    const { appName } = usePage<SharedProps>().props;
    const payout = (trading.default_payout_bps / 100).toLocaleString('pt-BR');
    const breakEven = breakEvenRate(trading.default_payout_bps).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

    const sections: LegalSection[] = [
        {
            id: 'produto',
            title: 'O que você está contratando',
            body: (
                <>
                    <p>
                        Em cada operação você prevê se o preço de um ativo vai terminar acima (CALL) ou abaixo (PUT) do preço de entrada ao fim do prazo escolhido. Se acertar, recebe o valor investido mais o retorno mostrado na tela. Se
                        errar, perde todo o valor investido naquela operação.
                    </p>
                    <p>Você não compra o ativo, não tem direito sobre ele e não recebe dividendos, juros ou qualquer rendimento. O resultado depende apenas do preço no vencimento.</p>
                </>
            ),
        },
        {
            id: 'matematica',
            title: 'O que a matemática diz',
            body: (
                <>
                    <p>
                        Com retorno de {payout}% quando a operação é positiva e perda total do valor quando é negativa, é preciso acertar mais de {breakEven}% das operações só para empatar. Movimentos de curto prazo são, em grande parte,
                        imprevisíveis, e a maioria das pessoas que opera esse tipo de produto perde dinheiro.
                    </p>
                    <p>Resultados passados, inclusive os obtidos na conta demo, não garantem resultados futuros.</p>
                </>
            ),
        },
        {
            id: 'regras',
            title: `Como cada operação é calculada (regras versão ${trading.rules_version})`,
            body: (
                <Bullets
                    items={[
                        'Você escolhe ativo, direção, valor e prazo. Preço de entrada, vencimento e resultado são definidos pelo servidor.',
                        `O preço de entrada é a última cotação recebida do provedor, recusada se tiver chegado há mais de ${trading.max_entry_quote_age_seconds} segundos.`,
                        `O vencimento é o próximo segundo cheio após o horário da cotação de entrada, somado ao prazo escolhido (${trading.durations_seconds.map(formatDuration).join(', ')}), sempre no relógio da fonte de preços.`,
                        'O preço de encerramento é o fechamento da vela de 1 segundo imediatamente anterior ao vencimento, consultado no provedor.',
                        'CALL é positiva se o encerramento ficar acima da entrada. PUT é positiva se ficar abaixo. Preço igual devolve o valor investido.',
                        `Se não houver preço de referência até ${trading.settlement_grace_seconds} segundos depois do vencimento, a operação é anulada e o valor volta ao saldo.`,
                        `Valores por operação: de ${formatCents(trading.min_stake_cents)} a ${formatCents(trading.max_stake_cents)}.`,
                    ]}
                />
            ),
        },
        {
            id: 'grafico',
            title: 'Sobre o movimento do gráfico',
            body: (
                <p>
                    O preço na tela desliza suavemente entre uma cotação e a seguinte, para facilitar a leitura. Esse deslize é só visual e pode ser desligado nas preferências. Os resultados usam apenas os preços do provedor, nunca o valor
                    intermediário exibido.
                </p>
            ),
        },
        {
            id: 'dados-de-mercado',
            title: 'Sobre os dados de mercado',
            body: (
                <p>
                    Cotações vêm de provedores externos e podem atrasar, oscilar ou faltar. Cada ativo mostra a fonte e a situação dos dados, e ativos sem dados recentes ficam indisponíveis para operar. Criptoativos são cotados em USDT.
                    Feriados das bolsas ainda não são considerados nos horários de mercado.
                </p>
            ),
        },
        {
            id: 'tecnologia',
            title: 'Riscos técnicos',
            body: (
                <Bullets
                    items={[
                        'Falhas de internet, do seu dispositivo ou do navegador podem impedir que você abra uma operação no momento desejado. Operações já abertas são encerradas pelo servidor, mesmo que você feche a página.',
                        'Manutenções e falhas de provedores podem suspender temporariamente a negociação de alguns ou de todos os ativos.',
                    ]}
                />
            ),
        },
        {
            id: 'operacao-responsavel',
            title: 'Operação responsável',
            body: (
                <>
                    <Bullets
                        items={[
                            'Opere apenas com dinheiro que você pode perder. Nunca use dinheiro de contas, aluguel, empréstimos ou cartão de crédito.',
                            'Defina antes quanto está disposto a perder no dia e pare ao atingir esse valor. Não tente recuperar perdas aumentando o valor das operações.',
                            'Treine na conta demo antes de operar com dinheiro e faça pausas frequentes.',
                            'Se operar está afetando suas finanças, seu sono, seu trabalho ou suas relações, pare e procure ajuda profissional.',
                        ]}
                    />
                    <p>Você pode fechar sua conta a qualquer momento em Minha conta. A conta fechada só volta a funcionar por pedido ao atendimento.</p>
                </>
            ),
        },
        {
            id: 'jurisdicao',
            title: 'Jurisdição',
            body: (
                <p>
                    Opções binárias são proibidas ou restritas em diversos países. É responsabilidade de cada usuário verificar se a legislação do lugar onde está permite operar este tipo de produto antes de abrir a conta real. Os demais
                    compromissos estão nos <DocLink href="/termos">termos de uso</DocLink>.
                </p>
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
            title="Divulgação de riscos"
            summary={
                <>
                    <p>O que você precisa saber antes de operar na {appName}: como cada operação funciona, por que ela é arriscada e como operar com responsabilidade.</p>
                    <div className="mt-4">
                        <Callout tone="risk">Opções binárias são produtos de alto risco. Você pode perder todo o valor investido em cada operação. Opere apenas com dinheiro que pode perder.</Callout>
                    </div>
                </>
            }
            sections={sections}
        />
    );
}
