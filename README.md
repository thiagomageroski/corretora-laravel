# Nivora

Corretora de opções binárias com conta real e conta demo. O cliente escolhe o ativo, o valor, a direção (CALL ou PUT) e o prazo. O servidor fixa o preço de entrada e fecha a operação pelo preço do provedor no segundo do vencimento. Depósitos e saques são feitos por PIX.

Feita em **Laravel 13**, **Inertia** e **React 19** (TypeScript, Tailwind 4).

## Destaques

- **Terminal de negociação:** gráfico ao vivo (Lightweight Charts) com velas, barras, linha e área, indicadores (médias, Bollinger, RSI, MACD, estocástico) e ferramentas de desenho. Arraste fluido, com inércia e histórico que carrega sozinho conforme o gráfico volta no tempo.
- **Cotações em tempo real:** feed WebSocket da Binance, repassado ao navegador pelo Reverb. Cada operação fecha pelo preço da vela de 1 segundo anterior ao vencimento.
- **Conta real e conta demo:** saldos separados que nunca se misturam. A demo começa com saldo virtual e pode ser reiniciada.
- **PIX pela AmploPay:** a cobrança tem QR Code e copia-e-cola. O saldo só é creditado quando o webhook confirma o pagamento, e PIX de outro CPF fica retido para análise. Saques vão para uma chave PIX do titular, com aprovação automática até um limite configurável.
- **Carteira com ledger:** cada movimentação é registrada em sequência, com conferência diária de consistência.
- **Segurança:** verificação em duas etapas, histórico de acessos, dispositivos conectados, CPF e chaves PIX criptografados e trilha de auditoria.
- **Painel administrativo:** clientes, depósitos, saques, operações, ativos (retorno e ativação), configurações da plataforma e auditoria.
- **Central jurídica:** termos de uso, política de privacidade (LGPD), política de cookies, divulgação de riscos e prevenção à lavagem de dinheiro.

## Ativos

O catálogo tem 269 instrumentos. O que pode ser operado depende do provedor de dados de cada um:

| Categoria | Quantidade | Provedor | Operável |
|---|---|---|---|
| Criptomoedas | 60 | Binance | Sim, 24 horas por dia, 7 dias por semana, em demo e real |
| Forex | 62 | Twelve Data | Ainda não: com `TWELVEDATA_API_KEY`, aparecem com cotação, sem liberar operação |
| Ações | 114 | Twelve Data | Ainda não |
| Índices | 10 | Sem provedor | Ainda não |
| Commodities | 13 | Sem provedor | Ainda não |
| ETFs | 10 | Twelve Data | Ainda não |

Um ativo só fica operável quando o provedor entrega cotação ao vivo e o preço exato do segundo do vencimento. Hoje só a Binance cumpre as duas condições. Para liberar forex é preciso um provedor pago com licença de exibição, além da gravação própria de cotações. Veja [docs/INTEGRACOES.md](docs/INTEGRACOES.md).

## Requisitos

- PHP 8.3 ou superior, com `intl`, `bcmath`, `pdo_mysql` ou `pdo_sqlite`, e um bundle de certificados em `curl.cainfo` e `openssl.cafile`
- MySQL 8 em produção; SQLite serve para desenvolvimento
- Composer e Node.js
- Relógio sincronizado por NTP. O `market:stream` avisa se o relógio estiver diferente do da Binance, e a hora do vencimento depende disso.

## Instalação

```sh
composer install
npm install
cp .env.example .env
php artisan key:generate
touch database/database.sqlite
php artisan migrate --seed
npm run build
```

No Windows, sem Git Bash, use `copy` em vez de `cp` e crie `database\database.sqlite` vazio manualmente. Para MySQL, ajuste as variáveis `DB_*` do `.env` e pule o `touch`.

Para entrar no painel administrativo, crie sua conta no site e rode:

```sh
php artisan admin:grant seu@email.com
```

## Configuração

As principais variáveis do `.env`:

| Variável | Função |
|---|---|
| `REAL_MONEY_ENABLED` | Liga a conta real. Também pode ser ligada e desligada pelo painel admin. |
| `AMPLOPAY_PUBLIC_KEY`, `AMPLOPAY_SECRET_KEY` | Credenciais do PIX. Sem elas, depósitos e saques ficam indisponíveis. |
| `AMPLOPAY_WEBHOOK_TOKEN` | Token que autentica as notificações de pagamento. |
| `REAL_AUTO_APPROVE_WITHDRAWAL_MAX_CENTS` | Saques até esse valor saem sem aprovação manual. `0` = todo saque espera aprovação. |
| `DEMO_INITIAL_BALANCE_CENTS`, `DEMO_DEFAULT_PAYOUT_BPS` | Saldo inicial da conta demo e retorno padrão das operações. |
| `TWELVEDATA_API_KEY` | Cotações de forex, ações e ETFs. |
| `REVERB_APP_KEY`, `REVERB_APP_SECRET` | WebSocket do navegador. Troque o segredo. Depois de mudar qualquer `VITE_*`, rode `npm run build`. |

A AmploPay só confirma pagamentos por webhook, e as notificações precisam chegar a um domínio público com HTTPS (`POST /webhooks/amplopay`). Limites de depósito, saque, valores por operação, prazos e dados da empresa exibidos nas políticas são editados no painel admin, em Configurações.

## Execução

```sh
npm run dev:all
```

Abra http://localhost:8000. O comando inicia:

| Processo | Comando | Função |
|---|---|---|
| web | `php artisan serve` | Aplicação |
| ws | `php artisan reverb:start` | WebSocket para o navegador |
| feed | `php artisan market:stream` | Cotações da Binance |
| settle | `php artisan trading:settle` | Fechamento das operações vencidas |
| cron | `php artisan schedule:work` | Rotinas agendadas |
| vite | `npm run dev` | Frontend com recarga automática |

Sem o `feed`, nenhuma cotação nova chega e as operações são recusadas. Sem o `settle`, as operações ficam abertas depois do vencimento. Sem o `ws`, o terminal continua funcionando por polling a cada 3 segundos.

Em produção, mantenha `reverb:start`, `market:stream` e `trading:settle` sempre rodando, por exemplo com Supervisor ou cron com `flock`, e agende `php artisan schedule:run` a cada minuto. As rotinas agendadas são:

| Rotina | Frequência |
|---|---|
| `trading:settle --once` | A cada minuto, como reserva do processo contínuo |
| `market:poll twelvedata` | A cada minuto, dentro do limite de créditos |
| `payments:reconcile` | A cada 2 minutos |
| `market:sync-catalog` | Diária |
| `wallet:reconcile` | Diária, às 03:00 |

## Rotas principais

| Rota | Página |
|---|---|
| `/` | Página inicial |
| `/negociar` | Terminal de negociação |
| `/dashboard` | Painel do cliente |
| `/ativos` | Catálogo de ativos |
| `/operacoes` | Histórico de operações |
| `/carteira` | Saldos, depósito, saque e extrato |
| `/conta` | Perfil, segurança, preferências e encerramento da conta |
| `/admin` | Painel administrativo |
| `/termos`, `/privacidade`, `/cookies`, `/riscos`, `/pld` | Central jurídica |

## Comandos

| Comando | Função |
|---|---|
| `php artisan admin:grant {email}` | Dá acesso ao painel admin. Com `--revoke`, remove. |
| `php artisan payments:deposits` | Lista depósitos em análise. Com `credit`, `confirm` ou `dismiss`, decide um deles. |
| `php artisan payments:withdrawals` | Lista saques pendentes. Com `approve`, `reject` ou `retry`, decide um deles. |
| `php artisan payments:reconcile` | Consulta o provedor sobre depósitos e saques em aberto. |
| `php artisan market:sync-catalog` | Desativa ativos que a Binance deixou de listar e reativa os que voltaram. |
| `php artisan wallet:reconcile` | Confere a consistência dos ledgers. |
| `php artisan trading:settle --once` | Fecha o que estiver vencido e encerra. |

Toda decisão manual de pagamento exige `--operator` e `--note`, que ficam registrados na auditoria.

## Testes

```sh
php artisan test
npm test
npm run types
```

Os testes do backend usam SQLite em memória e respostas HTTP simuladas dos provedores.

## Documentação

- [Integrações externas e credenciais](docs/INTEGRACOES.md)
- [Planejamento inicial, arquitetura e banco de dados](docs/ETAPA-1-PLANEJAMENTO.md). É o documento da primeira etapa, de antes da conta real; a arquitetura continua valendo.

## Aviso

Opções binárias são produtos de alto risco: o cliente pode perder todo o valor de cada operação. Quem operar esta plataforma com dinheiro real é responsável por verificar e cumprir a regulamentação aplicável no seu país, inclusive licenças de dados de mercado e de pagamentos.
