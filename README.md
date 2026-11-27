# Nivora

Simulador de trading com dinheiro virtual: terminal com gráficos, catálogo de 269 instrumentos e contratos de resultado binário liquidados pelo servidor com preços de provedores identificados.

**Não é corretora.** Nenhuma operação é executada em bolsa, e o modo real está desligado no código. Leia [docs/ETAPA-1-PLANEJAMENTO.md](docs/ETAPA-1-PLANEJAMENTO.md) antes de planejar qualquer uso com dinheiro real.

## Requisitos

- PHP 8.3 ou superior, com `pdo_sqlite`, `intl`, `bcmath` e um bundle de certificados em `curl.cainfo` e `openssl.cafile`
- Composer e Node.js
- Relógio sincronizado por NTP. `market:stream` avisa se houver diferença em relação à bolsa

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

No Windows, sem Git Bash, use `copy` em vez de `cp` e crie `database\database.sqlite` vazio manualmente.

Troque `REVERB_APP_SECRET` no `.env`. Depois de mudar qualquer `VITE_*`, rode `npm run build` novamente.

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
| settle | `php artisan trading:settle` | Liquidação das operações vencidas |
| vite | `npm run dev` | Frontend com recarga automática |

Sem o `feed`, nenhuma cotação nova chega e as operações são recusadas. Sem o `settle`, as operações ficam abertas depois do vencimento. Sem o `ws`, o terminal continua funcionando por polling a cada 3 segundos.

O link de confirmação de e-mail vai para `storage/logs/laravel.log` enquanto `MAIL_MAILER=log`.

Rotinas agendadas, com `php artisan schedule:work`: sincronização do catálogo, reconciliação do ledger e polling da Twelve Data.

## Rotas principais

| Rota | Página |
|---|---|
| `/` | Página inicial |
| `/dashboard` | Painel |
| `/terminal` | Terminal de operações |
| `/ativos` | Catálogo de ativos |
| `/operacoes` | Histórico de operações |
| `/carteira` | Carteira demo e extrato |
| `/conta` | Perfil, preferências, segurança e conta demo |

As configurações da conta também abrem em um painel lateral, pelo menu do avatar, em qualquer página. No terminal, o gráfico continua rodando atrás do painel.

## Testes

```sh
php artisan test
npm test
npm run types
```

Os testes usam SQLite em memória e HTTP simulado. Ainda não há execução automatizada em PostgreSQL.

## Comandos

| Comando | Função |
|---|---|
| `php artisan market:poll binance` | Busca cotações por REST |
| `php artisan market:poll twelvedata --limit=8` | Busca cotações respeitando o limite de créditos |
| `php artisan market:sync-catalog` | Ativa e desativa ativos conforme a listagem da Binance |
| `php artisan wallet:reconcile` | Verifica a consistência dos ledgers |
| `php artisan trading:settle --once` | Liquida o que estiver vencido e encerra |

## Documentação

- [Planejamento, arquitetura e banco de dados](docs/ETAPA-1-PLANEJAMENTO.md)
- [Integrações externas e credenciais](docs/INTEGRACOES.md)
