# 052 — T-43 — Save e ações HTTP da FEAT-12

- **Data** — 2026-11-20
- **Status** — aguardando revisão
- **Spec** — REQ-108 a REQ-116
- **Contrato** — v0.57, acordado
- **Horas** — a preencher pelo autor

## Objetivo

Retomar do devlog 051 com testes de persistência e HTTP antes da implementação. Os cenários de configuração e catálogo de REQ-108 a REQ-110 reaproveitam as suítes da T-40. Os prazos multiplayer ficam para a integração FEAT-26.

## Arquivos

- `drizzle-party-mapper.test.ts` verifica o round-trip dos decks de evento, o descarte e o RNG.
- `index.random-event.controller.e2e-spec.ts` cobre save v7, antecipação oculta, recarga do recibo, reversão da última parte, fuga e dívida, retomada do desfecho e resolução concorrente. A carta é ajustada apenas na cópia temporária da fixture.
- `index.vault.controller.e2e-spec.ts` atualiza as expectativas de Vasculhar para a escolha com inventário cheio e a devolução ao fundo do deck.

## Como verificar

```powershell
npm.cmd test -- src/infra/database/drizzle/mappers/drizzle-party-mapper.test.ts
npm.cmd run test:e2e -- src/infra/http/controllers/take-party-action/index.random-event.controller.e2e-spec.ts src/infra/http/controllers/take-party-action/index.vault.controller.e2e-spec.ts
```

Execute o unitário sem serviços. Para o HTTP com o banco do Compose, execute `docker compose up -d --wait postgres` antes dos testes. O harness cria um schema isolado, aplica as migrações e inicializa sua própria instância Nest.

Na rodada inicial, a nova asserção do mapper deve mostrar o deck vazio após a recarga. No HTTP, os cenários de evento devem expor a ausência da projeção da FEAT-12 ou a recusa de `startEvent`. Os cenários atualizados de Vasculhar devem expor a recusa provisória `inventoryFull` ou a ausência de `lastScavenge.delivery`.

## Checks e retomada

- Typecheck, ESLint dos testes alterados e `git diff --check` passaram.
- O autor executou o unitário do mapper. A falha esperada foi confirmada: a recarga devolveu `eventDecks: []`. Os outros 24 testes passaram.
- A rodada HTTP pulou os 19 cenários porque o PostgreSQL recusou a conexão em `localhost:5432` durante a preparação do schema.
- A segunda tentativa teve o mesmo resultado, com `ECONNREFUSED` em `::1:5432` e `127.0.0.1:5432`.
- Com o PostgreSQL disponível, o autor confirmou 8 falhas e 11 aprovações. As cinco falhas de evento expuseram os campos ausentes e a recusa de `handCopies` pelo mapper antigo. As três falhas de Vasculhar expuseram a recusa `inventoryFull` e a ausência de `lastScavenge.delivery`.
- Após a implementação, typecheck, ESLint dos arquivos alterados e `git diff --check` passaram. A revisão dos arquivos de domínio confirmou o uso das portas existentes para relógio, IDs e repositório e a preservação do RNG semeado.
- Aguardando os resultados da rodada de validação do autor. O aceite no contrato e o aviso de validação para o frontend dependem dessa rodada.

## Implementação

- `drizzle-party-mapper.ts` grava o JSONB v8 e mantém a leitura de v2 a v7. A recarga conserva os decks, o RNG, o encontro com o cursor do desfecho, a escolha pendente, as cópias e os recibos do jogador. A migração converte o resultado antigo de Vasculhar. IDs de mão legados são derivados em ordem na leitura e preservados quando a mão muda.
- O repositório Drizzle lê o grupo com `SELECT FOR UPDATE` e grava na mesma transação. Ações, início e fim de sessão e doação do laboratório usam esse fluxo.
- O presenter carrega as cartas usadas pelos requisitos e disponibiliza as ações da fase. O módulo da campanha habilita as ações de encontro e recompensa e a resolução de Vasculhar com inventário cheio.
- Os testes de regressão da criação, das ações e do repositório conferem a resposta acordada e a gravação v8.

## Rodada após a implementação

```powershell
npm.cmd test
npm.cmd run test:e2e -- src/infra/http/controllers/take-party-action src/infra/http/controllers/create-party src/infra/database/drizzle/repositories/drizzle-parties-repository.e2e-spec.ts src/infra/http/controllers/update-lab-config src/infra/http/controllers/publish-card
```

Todos os cenários selecionados devem passar. No caso de borda de duas escolhas concorrentes, uma resposta deve ser 200 e a outra 409 com `staleReward`. A recompensa seguinte deve permanecer disponível e a tentativa de repetir a última escolha deve preservar o save.

## Commit sugerido

`feat/persist random events and expose party actions (t-43)`
