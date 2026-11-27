# Integrações externas

Situação em 07/11/2026. Todas as chaves ficam em variáveis de ambiente no backend e nunca chegam ao navegador.

| Provedor | Estado | Testado contra a API real? | Credencial |
|---|---|---|---|
| Binance, dados públicos | Em uso | Sim | Nenhuma |
| Twelve Data | Adaptador pronto | **Não.** Só com respostas simuladas, baseadas na documentação | `TWELVEDATA_API_KEY` |
| Finnhub, CoinGecko, Alpha Vantage, Massive | Não implementados | Não | A obter |
| AmploPay (PIX) | Implementado: depósito, saque, webhooks | **Não.** Só com respostas simuladas, baseadas na documentação | `AMPLOPAY_PUBLIC_KEY`, `AMPLOPAY_SECRET_KEY` |

## Binance

Adaptador: `app/Domain/Market/Providers/BinanceProvider.php`.

| Uso | Endpoint |
|---|---|
| Cotações em lote | `GET data-api.binance.vision/api/v3/ticker/24hr?symbols=[...]&type=MINI` |
| Velas | `GET /api/v3/klines?symbol&interval&limit` |
| Preço de encerramento | `GET /api/v3/klines?symbol&interval=1s&startTime&endTime&limit=1` |
| Listagem | `GET /api/v3/exchangeInfo?symbolStatus=TRADING&showPermissionSets=false` (2,5 MB; sem esses filtros, 17 MB) |
| Relógio | `GET /api/v3/time` |
| Tempo real | `wss://data-stream.binance.vision/stream?streams=<symbol>@aggTrade/<symbol>@miniTicker/...` |

O período de 1 s do gráfico usa velas reais dessa mesma rota. Elas ficam 2 s em cache e não são gravadas em `market_candles`, porque ocupariam espaço rapidamente. Só provedores com velas de 1 s oferecem esse modo; a Twelve Data não oferece.

Comportamento verificado:

- Velas de 1 s existem mesmo em segundos sem negócios, com volume zero e o último preço. Por isso a regra de encerramento funciona em ativos com pouca liquidez.
- `aggTrade` publica cada negócio assim que ocorre e dá o preço em tempo real. `miniTicker` publica a cada segundo e dá a abertura, a amplitude e o volume de 24 h. `market:stream` envia ao navegador até 10 vezes por segundo, só quando há mudança, e grava no banco 2 vezes por segundo.
- O ritmo do gráfico é o ritmo do mercado. Medido em 07/11/2026 de madrugada: BTC com cerca de 1,1 mudança de preço por segundo, ETH com 2,2, SOL com 0,3 e DOGE com 0,2, com pausas de até 80 s nos ativos menos líquidos.
- Os dois só publicam quando há negócios. Ativos pouco líquidos podem ficar mais de 5 s sem cotação e, nesse intervalo, as operações são recusadas.
- A conexão dura no máximo 24 h. `market:stream` renova a cada 23 h, reconecta com espera crescente de até 60 s e reconecta se ficar 30 s sem mensagens.

**Licença:** um [FAQ de 2022](https://www.binance.com/en-BH/support/faq/how-to-download-historical-market-data-on-binance-5810ae42176b4770b880ce1f14932262) proíbe uso comercial e streaming sem consentimento escrito. Serve para desenvolvimento; o lançamento público exige consentimento ou outro feed.

**Quote em USDT:** os ativos mantêm o símbolo `BTC/USD`, mas o preço é em USDT. A interface mostra isso em "Cotado em".

## Twelve Data

Adaptador: `app/Domain/Market/Providers/TwelveDataProvider.php`. Usa `/quote` (1 crédito por símbolo) e `/time_series`.

- Cobre forex, ações e ETFs do catálogo. O limite de créditos é respeitado localmente (`TWELVEDATA_CREDITS_PER_MINUTE`).
- `market:poll` percorre o catálogo em rodízio. No plano grátis, são 8 símbolos por minuto: uma volta completa pelos 186 ativos leva cerca de 23 minutos e consome o limite de 800 por dia em menos de 2 horas.
- Ativos deste provedor **só podem ser visualizados**, sem simulação, porque o REST não oferece preço por segundo no vencimento. Para operar seria preciso um feed por WebSocket e nova regra de encerramento.
- **Licença:** plano grátis "internal, non-display". Exibição a terceiros exige Venture (US$ 149/mês) ou superior.

Depois de obter a chave, validar contra a API real: nada aqui foi testado com ela.

## Índices e commodities

Sem provedor configurado (`provider_code` nulo): aparecem no catálogo como "Sem dados". Falta escolher a fonte e confirmar símbolos e licença.

## AmploPay (PIX)

Substitui o Mercado Pago, que nunca chegou a ser implementado. Código em `app/Domain/Payments/`. Base: `https://app.amplopay.com/api/v1`, cabeçalhos `x-public-key` e `x-secret-key`. Valores trafegam em reais na API e em centavos inteiros no sistema.

| Uso | Endpoint |
|---|---|
| Cobrança PIX do depósito | `POST /gateway/pix/receive` com `identifier` = id público do depósito, `client` (nome, e-mail, telefone, CPF) e `callbackUrl` |
| Confirmar depósito | `GET /gateway/transactions?id=` |
| Saque | `POST /gateway/transfers` com `identifier` = id público do saque, chave PIX e `owner` (CPF do titular, IP do usuário) |
| Confirmar saque | `GET /gateway/transfers?id=`, ou `?clientIdentifier=` quando o envio ficou sem resposta |
| Notificações | `POST /webhooks/amplopay` (sem CSRF, limite de 240/min) |

Regras de segurança implementadas:

- **A AmploPay bloqueia consultas de status** (`GET /gateway/transactions` responde 429 "Tentativa de polling bloqueada. Receba atualizações via webhook", com espera de 300 s, mesmo para uma única consulta). Confirmado em 07/11/2026 com a conta real. Por isso a confirmação vem **só do webhook**.
- O webhook é autenticado pelo `webhookToken` que a AmploPay devolve apenas para nós ao criar cada cobrança ou saque (guardado como hash SHA-256), ou pelo token da conta (`AMPLOPAY_WEBHOOK_TOKEN`). Com token válido, os dados da notificação são aplicados, desde que o id, o identificador e o valor confiram com o registro. Token errado: 401. Sem nenhum token para conferir, a notificação só dispara uma consulta.
- Depósitos e saques são **recusados** enquanto não houver endereço HTTPS público para as notificações (`webhook_unavailable`): sem ele, um PIX pago nunca seria creditado.
- Consultas de status ficam desligadas (`AMPLOPAY_STATUS_LOOKUPS=false`). Se ligadas e a AmploPay responder 429, todas as consultas pausam pelo tempo indicado.
- Crédito idempotente: chave do razão `deposit:{id}:credit`. Notificações repetidas não creditam duas vezes.
- Depósito pago por **outro CPF** (`pixMetadata.payerDocument`) ou com valor menor que o cobrado fica **em análise**, sem crédito. O operador decide com `php artisan payments:deposits`.
- Estorno ou contestação depois do crédito: o valor é retirado. Se já foi usado, o sistema retira o que houver e **bloqueia a conta real** para tratamento manual.
- Saque reserva o valor no pedido e só sai do razão com a transferência `COMPLETED` confirmada na consulta. Falha ou cancelamento devolve o valor. Exige a senha do usuário. Chave do tipo CPF precisa ser o CPF do titular; a AmploPay também recusa chave de outro titular.
- Saques aguardam um operador (`php artisan payments:withdrawals approve <id> --operator=<e-mail> --note=<justificativa>`), salvo valores até `REAL_AUTO_APPROVE_WITHDRAWAL_MAX_CENTS`. Toda decisão vai para `audit_logs`.
- Se o envio do saque fica sem resposta, ele **não é reenviado sozinho**: `payments:reconcile` procura pelo `identifier`, e o reenvio é manual com `payments:withdrawals retry`.
- Payload guardado em `payment_webhooks` sem token, dados do cliente, conta de destino e `pixMetadata`.

Endereço das notificações: `APP_URL` + `/webhooks/amplopay`. Só funciona com o site no domínio HTTPS de produção (`APP_URL=https://seudominio.com`). Em `localhost`, depósitos e saques ficam indisponíveis: o botão Depositar não aparece e a Carteira mostra "Depósitos e saques indisponíveis no momento". Nada mais precisa ser configurado para ligar em produção.

Cobrança paga sem aviso: confira o pagamento no painel da AmploPay e confirme com `php artisan payments:deposits confirm <id> --operator=<e-mail> --note=<justificativa>`. Fica no registro de auditoria.

Pendências a confirmar com a conta real da AmploPay:

- Nada foi testado contra a API real. Testar primeiro com valores mínimos.
- Se o `amount` da consulta vem líquido de taxas. O sistema compara `chargeAmount` (valor pago); se vier menor que o cobrado, o depósito fica em análise.
- Formato exato da chave de celular aceito em saques (o sistema envia `+55DDDNÚMERO`).
- Bloqueio por localização (FAQ "API bloqueada por localização"): o servidor no exterior pode precisar ser liberado pela AmploPay.

## Atribuições obrigatórias

- **TradingView Lightweight Charts** (Apache-2.0): o logotipo no gráfico e o link no rodapé da página inicial atendem à exigência. Não remover.
- **CoinGecko:** exigirá atribuição quando for integrado.
