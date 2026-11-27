import { usePage } from '@inertiajs/react';
import { Bullets, Callout, CompanyCard, DocLink, LegalDocument, LegalTable, MailLink, type LegalSection } from '@/components/legal/LegalDocument';
import { privacyContact, type LegalEntity } from '@/lib/legal';
import type { SharedProps } from '@/lib/types';

type RealLimits = { minimum_age: number };

export default function Privacy({ real, company }: { real: RealLimits; company: LegalEntity }) {
    const { appName } = usePage<SharedProps>().props;
    const operator = company.name ?? appName;
    const contact = privacyContact(company);

    const sections: LegalSection[] = [
        {
            id: 'controlador',
            title: 'Quem trata os seus dados',
            body: (
                <>
                    <p>
                        A {operator} é a controladora dos dados pessoais tratados na plataforma {appName}, nos termos da Lei Geral de Proteção de Dados (Lei nº 13.709/2018, a LGPD). Esta política explica quais dados usamos, por quê, com
                        quem compartilhamos, por quanto tempo guardamos e como você exerce os seus direitos.
                    </p>
                    <CompanyCard company={company} />
                </>
            ),
        },
        {
            id: 'dados',
            title: 'Dados que coletamos',
            body: (
                <LegalTable
                    head={['Categoria', 'Dados', 'Quando']}
                    rows={[
                        ['Cadastro', 'Nome, sobrenome, apelido (opcional), e-mail, telefone, senha (guardada apenas como hash) e foto de perfil (opcional).', 'Ao criar a conta e ao editar os dados pessoais.'],
                        ['Conta real', 'CPF, data de nascimento e a data em que você aceitou as regras da conta real.', 'Ao abrir a conta real.'],
                        ['Pagamentos', 'Depósitos e saques, valores, situação, chaves PIX cadastradas e dados do pagador informados pela instituição de pagamento.', 'A cada depósito ou saque.'],
                        ['Operações', 'Ativo, direção, valor, prazo, preços de entrada e de encerramento, resultado e extrato da conta.', 'A cada operação.'],
                        ['Acesso e segurança', 'Endereço IP, navegador e dispositivo, data e hora de acessos e tentativas de acesso, sessões ativas e configuração da verificação em duas etapas.', 'A cada acesso e ação sensível.'],
                        ['Preferências', 'Configurações do gráfico, valores padrão, fuso horário, escala da interface e preferências de e-mail.', 'Quando você ajusta a plataforma.'],
                    ]}
                />
            ),
        },
        {
            id: 'finalidades',
            title: 'Para que usamos e com qual base legal',
            body: (
                <LegalTable
                    head={['Finalidade', 'Base legal (LGPD, art. 7º)']}
                    rows={[
                        ['Criar e manter a conta, executar operações, depósitos e saques, mostrar o extrato.', 'Execução de contrato (inciso V).'],
                        ['Verificar identidade e idade, garantir uma conta por CPF, conferir que pagamentos e saques são do titular.', 'Cumprimento de obrigação legal (inciso II) e prevenção à fraude (art. 11, II, g).'],
                        ['Guardar registros de acesso e de transações pelos prazos legais.', 'Cumprimento de obrigação legal (inciso II).'],
                        ['Proteger a conta, detectar acessos suspeitos e abusos, manter a plataforma estável.', 'Legítimo interesse (inciso IX).'],
                        ['Enviar avisos da conta, de pagamentos e de segurança.', 'Execução de contrato (inciso V).'],
                        ['Enviar novidades e ofertas.', 'Consentimento (inciso I), que você controla em Minha conta.'],
                        ['Defender direitos em processos judiciais, administrativos ou arbitrais.', 'Exercício regular de direitos (inciso VI).'],
                    ]}
                />
            ),
        },
        {
            id: 'compartilhamento',
            title: 'Com quem compartilhamos',
            body: (
                <>
                    <p>Não vendemos nem alugamos seus dados. Eles são compartilhados apenas quando necessário:</p>
                    <Bullets
                        items={[
                            <>
                                <strong className="text-text-1">Provedor de pagamentos PIX (AmploPay) e instituições do arranjo PIX:</strong> nome, e-mail, telefone, CPF e valor, para gerar cobranças, confirmar pagamentos e enviar saques.
                            </>,
                            <>
                                <strong className="text-text-1">Provedores de infraestrutura:</strong> hospedagem, banco de dados e envio de e-mails, que tratam os dados apenas em nosso nome e sob nossas instruções.
                            </>,
                            <>
                                <strong className="text-text-1">Autoridades públicas:</strong> quando houver obrigação legal, ordem judicial ou requisição de autoridade competente.
                            </>,
                        ]}
                    />
                    <p>Os provedores de cotações de mercado recebem apenas consultas sobre ativos e preços, nunca dados pessoais.</p>
                </>
            ),
        },
        {
            id: 'transferencia',
            title: 'Transferência internacional',
            body: <p>Alguns prestadores podem armazenar ou processar dados fora do Brasil. Quando isso acontece, a transferência segue as hipóteses do art. 33 da LGPD, com garantias de proteção compatíveis com as exigidas no Brasil.</p>,
        },
        {
            id: 'retencao',
            title: 'Por quanto tempo guardamos',
            body: (
                <>
                    <Bullets
                        items={[
                            'Dados de cadastro, preferências e operações: enquanto a conta existir.',
                            'Registros de acesso (IP, data e hora): pelo menos 6 meses, como exige o Marco Civil da Internet (Lei nº 12.965/2014, art. 15).',
                            'Cadastro do titular e registros de depósitos, saques e operações da conta real: pelo menos 5 anos após o encerramento da conta, como exige a lei de prevenção à lavagem de dinheiro (Lei nº 9.613/1998, art. 10).',
                            'Dados de quem pediu para receber ofertas: até a revogação do consentimento.',
                        ]}
                    />
                    <p>Terminados os prazos, os dados são eliminados ou anonimizados, salvo quando outra obrigação legal exigir que sejam mantidos.</p>
                </>
            ),
        },
        {
            id: 'direitos',
            title: 'Seus direitos',
            body: (
                <>
                    <p>A LGPD (art. 18) garante a você, a qualquer momento:</p>
                    <Bullets
                        items={[
                            'confirmar se tratamos seus dados e acessá-los;',
                            'corrigir dados incompletos, inexatos ou desatualizados;',
                            'pedir anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade com a lei;',
                            'pedir a portabilidade dos dados a outro fornecedor;',
                            'pedir a eliminação dos dados tratados com base no consentimento e revogar esse consentimento;',
                            'saber com quem seus dados foram compartilhados;',
                            'opor-se a tratamento feito em desacordo com a lei;',
                            'pedir a revisão de decisões tomadas apenas com base em tratamento automatizado (art. 20).',
                        ]}
                    />
                    <p>
                        Muita coisa você faz sozinho em Minha conta: editar os dados pessoais, baixar o extrato da conta em planilha, ver o histórico de acessos, mudar as preferências de e-mail, fechar a conta e pedir a exclusão dos dados.
                        {contact ? (
                            <>
                                {' '}
                                Para os demais pedidos, escreva para <MailLink email={contact} />.
                            </>
                        ) : (
                            ' Para os demais pedidos, use os canais de contato desta página.'
                        )}{' '}
                        Respondemos em até 15 dias e podemos pedir a confirmação da sua identidade antes de atender.
                    </p>
                    <p>Você também pode apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD).</p>
                </>
            ),
        },
        {
            id: 'exclusao',
            title: 'Exclusão da conta e dos dados',
            body: (
                <p>
                    O pedido de exclusão é feito em Minha conta, depois de encerradas as operações abertas e os saques em andamento e de sacado o saldo da conta real. Os dados são então eliminados, com exceção dos que a lei manda guardar
                    pelos prazos acima, que ficam bloqueados para qualquer outro uso até poderem ser apagados.
                </p>
            ),
        },
        {
            id: 'seguranca',
            title: 'Como protegemos os dados',
            body: (
                <Bullets
                    items={[
                        'Toda a comunicação com a plataforma é criptografada (HTTPS).',
                        'Senhas são guardadas apenas como hash. CPF, chaves PIX e a chave da verificação em duas etapas são guardados criptografados.',
                        'O acesso interno é restrito a quem precisa dele, e ações administrativas ficam registradas em trilha de auditoria.',
                        'Você pode ativar a verificação em duas etapas e acompanhar dispositivos conectados e o histórico de acessos.',
                    ]}
                />
            ),
        },
        {
            id: 'incidentes',
            title: 'Incidentes de segurança',
            body: <p>Se ocorrer um incidente que possa trazer risco ou dano relevante a você, comunicaremos você e a ANPD, como determina o art. 48 da LGPD, informando o que aconteceu, quais dados foram afetados e as medidas adotadas.</p>,
        },
        {
            id: 'menores',
            title: 'Menores de idade',
            body: <p>A conta real é exclusiva para maiores de {real.minimum_age} anos. Se identificarmos dados de menor de idade usados na conta real, a conta é bloqueada e os dados são tratados conforme a lei.</p>,
        },
        {
            id: 'cookies',
            title: 'Cookies',
            body: (
                <p>
                    Usamos apenas cookies essenciais, para manter você conectado e proteger a conta. Os detalhes estão na <DocLink href="/cookies">política de cookies</DocLink>.
                </p>
            ),
        },
        {
            id: 'alteracoes',
            title: 'Alterações desta política',
            body: <p>Esta política pode ser atualizada para refletir mudanças na plataforma ou na lei. A data no topo indica a versão em vigor, e mudanças relevantes serão avisadas pela plataforma ou por e-mail.</p>,
        },
    ];

    return (
        <LegalDocument
            title="Política de privacidade"
            summary={
                <>
                    <p>Como a {appName} coleta, usa, compartilha e protege os seus dados pessoais, de acordo com a LGPD.</p>
                    <div className="mt-4">
                        <Callout>Coletamos só o necessário para manter a conta, cumprir a lei e proteger você. Não vendemos seus dados e não usamos cookies de publicidade.</Callout>
                    </div>
                </>
            }
            sections={sections}
        />
    );
}
