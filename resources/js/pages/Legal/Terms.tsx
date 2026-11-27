import { usePage } from '@inertiajs/react';
import { Bullets, Callout, CompanyCard, DocLink, LegalDocument, type LegalSection } from '@/components/legal/LegalDocument';
import { formatCents } from '@/lib/format';
import type { LegalEntity } from '@/lib/legal';
import type { SharedProps, TradingRules } from '@/lib/types';

type RealLimits = { minimum_age: number; min_deposit_cents: number; min_withdrawal_cents: number; daily_withdrawal_limit_cents: number; require_payer_match: boolean };

export default function Terms({ trading, real, company }: { trading: TradingRules; real: RealLimits; company: LegalEntity }) {
    const { appName } = usePage<SharedProps>().props;
    const operator = company.name ?? appName;

    const sections: LegalSection[] = [
        {
            id: 'aceitacao',
            title: 'Aceitação e definições',
            body: (
                <>
                    <p>
                        Estes termos regem o uso da plataforma {appName}, mantida por {operator}. Ao criar uma conta, você declara que leu, entendeu e concorda com eles, com a <DocLink href="/privacidade">política de privacidade</DocLink>,
                        com a <DocLink href="/cookies">política de cookies</DocLink>, com a <DocLink href="/riscos">divulgação de riscos</DocLink> e com a <DocLink href="/pld">política de prevenção à lavagem de dinheiro</DocLink>, que fazem
                        parte destes termos.
                    </p>
                    <Bullets
                        items={[
                            <>
                                <strong className="text-text-1">Plataforma:</strong> o site, o painel de negociação e os serviços oferecidos pela {appName}.
                            </>,
                            <>
                                <strong className="text-text-1">Usuário ou você:</strong> a pessoa física titular da conta.
                            </>,
                            <>
                                <strong className="text-text-1">Operação:</strong> a previsão, feita por você, de que o preço de um ativo terminará acima (CALL) ou abaixo (PUT) do preço de entrada ao fim do prazo escolhido.
                            </>,
                            <>
                                <strong className="text-text-1">Conta demo e conta real:</strong> a conta de treino, com saldo virtual, e a conta com dinheiro, formada pelos seus depósitos e resultados.
                            </>,
                        ]}
                    />
                    <p>Se você não concordar com algum ponto, não crie a conta ou encerre-a a qualquer momento.</p>
                </>
            ),
        },
        {
            id: 'elegibilidade',
            title: 'Elegibilidade e cadastro',
            body: (
                <Bullets
                    items={[
                        'O cadastro é gratuito e pessoal. Cada pessoa pode manter uma única conta, e a conta não pode ser cedida, vendida ou usada por terceiros.',
                        `A conta real é exclusiva para maiores de ${real.minimum_age} anos, plenamente capazes, e exige CPF válido. Um CPF só pode estar vinculado a uma conta.`,
                        'Os dados informados devem ser verdadeiros, completos e mantidos atualizados. Dados falsos ou de outra pessoa levam ao bloqueio da conta.',
                        'É sua responsabilidade verificar se a legislação do lugar onde você está permite operar este tipo de produto. A plataforma pode recusar ou encerrar cadastros de regiões onde o serviço não é permitido.',
                    ]}
                />
            ),
        },
        {
            id: 'seguranca',
            title: 'Segurança da conta',
            body: (
                <Bullets
                    items={[
                        'Você é responsável por manter sua senha em sigilo e por tudo o que for feito com o seu acesso. Use uma senha exclusiva para a plataforma.',
                        'Recomendamos ativar a verificação em duas etapas, disponível em Minha conta. Lá você também vê os dispositivos conectados e o histórico de acessos, e pode desconectar sessões.',
                        'Se suspeitar de acesso indevido, troque a senha imediatamente e fale com o atendimento. A plataforma nunca pede sua senha por e-mail, telefone ou mensagem.',
                    ]}
                />
            ),
        },
        {
            id: 'contas',
            title: 'Conta demo e conta real',
            body: (
                <Bullets
                    items={[
                        'Toda conta recebe uma conta demo com saldo virtual, sem valor econômico. Ela pode ser reiniciada a qualquer momento e não pode ser sacada, transferida ou convertida em dinheiro.',
                        'A conta real tem saldo próprio, formado pelos seus depósitos e pelos resultados das suas operações. Os dois saldos nunca se misturam, e resultados obtidos na demo não garantem resultados na conta real.',
                        'O saldo da conta real não rende juros nem correção e não é um investimento. Ele existe para pagar operações e saques.',
                    ]}
                />
            ),
        },
        {
            id: 'depositos',
            title: 'Depósitos',
            body: (
                <Bullets
                    items={[
                        `Depósitos são feitos por PIX, a partir de ${formatCents(real.min_deposit_cents)}. O saldo só é creditado quando o provedor de pagamentos confirma o pagamento.`,
                        'Cada cobrança PIX tem validade. Pagamentos feitos depois do prazo, ou com valor diferente do cobrado ficam retidos para análise antes de qualquer crédito.',
                        real.require_payer_match
                            ? 'O pagamento deve sair de uma conta bancária no CPF do titular. Pagamentos feitos por outra pessoa não são creditados e ficam retidos para análise e devolução.'
                            : 'O pagamento deve sair de uma conta bancária no CPF do titular. Pagamentos feitos por outra pessoa podem ser retidos para análise.',
                        'Em caso de estorno, devolução ou contestação de um depósito, o valor é retirado do saldo. Se o saldo não for suficiente, a conta real pode ser bloqueada até a regularização.',
                    ]}
                />
            ),
        },
        {
            id: 'saques',
            title: 'Saques',
            body: (
                <Bullets
                    items={[
                        `Saques são feitos por PIX para uma chave registrada no CPF do titular, a partir de ${formatCents(real.min_withdrawal_cents)} e com limite de ${formatCents(real.daily_withdrawal_limit_cents)} por dia.`,
                        'O valor fica reservado no momento do pedido. Por segurança, o pedido passa por verificação antes do envio e só é considerado concluído quando a transferência é confirmada pela instituição de pagamento.',
                        'Saques recusados ou que falharem têm o valor devolvido ao saldo. A tarifa da transferência, quando houver, é informada antes da solicitação.',
                        'A plataforma pode pedir informações ou documentos adicionais antes de liberar um saque, conforme a política de prevenção à lavagem de dinheiro.',
                    ]}
                />
            ),
        },
        {
            id: 'operacoes',
            title: 'Operações',
            body: (
                <>
                    <Bullets
                        items={[
                            <>
                                Cada operação vai de {formatCents(trading.min_stake_cents)} a {formatCents(trading.max_stake_cents)}. O preço de entrada, o vencimento e o resultado são definidos pelo servidor a partir dos preços do provedor
                                de dados, conforme as regras publicadas na <DocLink href="/riscos">divulgação de riscos</DocLink>.
                            </>,
                            'O retorno de cada ativo é mostrado antes da confirmação e fica fixado na operação aberta. Mudanças posteriores no retorno não afetam operações já abertas.',
                            'Uma operação aberta não pode ser cancelada. Operações encerradas e movimentações do extrato não podem ser alteradas.',
                            `Se não houver preço de referência até ${trading.settlement_grace_seconds} segundos depois do vencimento, a operação é anulada e o valor volta ao saldo.`,
                            'Erros evidentes de preço, causados por falha do provedor de dados ou da plataforma, podem levar à anulação da operação afetada, com devolução do valor investido.',
                        ]}
                    />
                    <Callout tone="risk">Opções binárias são produtos de alto risco. Você pode perder todo o valor investido em cada operação. A plataforma não presta consultoria nem recomendação de investimento.</Callout>
                </>
            ),
        },
        {
            id: 'disponibilidade',
            title: 'Disponibilidade do serviço',
            body: (
                <Bullets
                    items={[
                        'Trabalhamos para manter a plataforma disponível, mas ela pode passar por manutenções, atualizações e falhas de terceiros, como provedores de dados, de pagamento e de internet.',
                        'Ativos podem ficar indisponíveis para negociação quando não houver cotações recentes, fora do horário do mercado ou por decisão da plataforma.',
                        'Limites, prazos, retornos e ativos oferecidos podem mudar. As mudanças valem para novas operações e são exibidas na plataforma.',
                    ]}
                />
            ),
        },
        {
            id: 'condutas',
            title: 'Condutas proibidas',
            body: (
                <>
                    <p>É proibido, entre outras práticas:</p>
                    <Bullets
                        items={[
                            'tentar burlar controles, explorar falhas, atrasos de cotação ou erros da plataforma;',
                            'usar robôs, scripts ou qualquer automação abusiva, ou sobrecarregar os sistemas;',
                            'manter mais de uma conta, usar a conta ou os meios de pagamento de outra pessoa;',
                            'usar a plataforma para lavagem de dinheiro, financiamento de atividades ilícitas ou qualquer fraude;',
                            'copiar, modificar ou explorar comercialmente a plataforma ou seu conteúdo sem autorização.',
                        ]}
                    />
                    <p>Nesses casos, a conta pode ser suspensa ou encerrada, operações podem ser anuladas e valores podem ser retidos para apuração, sem prejuízo de comunicação às autoridades competentes.</p>
                </>
            ),
        },
        {
            id: 'encerramento',
            title: 'Encerramento da conta',
            body: (
                <Bullets
                    items={[
                        'Você pode fechar sua conta ou pedir a exclusão dos seus dados a qualquer momento, em Minha conta. Antes, é preciso esperar o fim das operações abertas e dos saques em andamento e sacar o saldo da conta real.',
                        'A conta fechada não permite novos acessos até ser reaberta pelo atendimento. Os registros financeiros são guardados pelo prazo exigido em lei, conforme a política de privacidade.',
                        'A plataforma pode suspender ou encerrar contas que descumpram estes termos ou a lei, ou por exigência de autoridade. Nesses casos, o saldo legítimo é devolvido ao titular, ressalvados valores retidos por ordem legal ou em apuração.',
                    ]}
                />
            ),
        },
        {
            id: 'responsabilidade',
            title: 'Responsabilidades',
            body: (
                <Bullets
                    items={[
                        'As decisões de operar, o valor, o ativo, a direção e o prazo são exclusivamente suas, assim como os resultados delas.',
                        'A plataforma não responde por perdas decorrentes de oscilações de mercado, de falhas da sua conexão ou do seu dispositivo, nem de acesso feito com a sua senha.',
                        'Nada nestes termos afasta os direitos garantidos pelo Código de Defesa do Consumidor e pela legislação aplicável.',
                    ]}
                />
            ),
        },
        {
            id: 'propriedade',
            title: 'Propriedade intelectual',
            body: (
                <p>
                    A marca {appName}, o layout, os textos, os gráficos e o software da plataforma são protegidos por lei. O uso da plataforma não transfere a você nenhum direito sobre eles. Os gráficos usam a biblioteca TradingView
                    Lightweight Charts, sob sua própria licença.
                </p>
            ),
        },
        {
            id: 'comunicacoes',
            title: 'Comunicações',
            body: (
                <p>
                    Avisos sobre depósitos, saques, segurança e mudanças nestes termos são exibidos na plataforma e podem ser enviados ao e-mail cadastrado. Mensagens de novidades e ofertas só são enviadas conforme as suas preferências, que
                    podem ser alteradas a qualquer momento em Minha conta.
                </p>
            ),
        },
        {
            id: 'alteracoes',
            title: 'Alterações destes termos',
            body: (
                <p>
                    Estes termos podem ser atualizados. Mudanças relevantes serão avisadas com antecedência pelos canais acima, e a data no topo desta página indica a versão em vigor. Se não concordar com a nova versão, você pode encerrar a
                    conta antes que ela passe a valer.
                </p>
            ),
        },
        {
            id: 'lei-e-foro',
            title: 'Lei aplicável e foro',
            body: <p>Estes termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro do domicílio do usuário para resolver qualquer controvérsia, conforme o Código de Defesa do Consumidor.</p>,
        },
        {
            id: 'contato',
            title: 'Contato',
            body: <CompanyCard company={company} />,
        },
    ];

    return <LegalDocument title="Termos de uso" summary={<p>As regras para usar a {appName}: quem pode abrir conta, como funcionam depósitos, saques e operações, o que não é permitido e como encerrar a conta.</p>} sections={sections} />;
}
