# 052 — T-43 — Save e ações HTTP da FEAT-12

- **Data** — 2026-11-20
- **Status** — concluída
- **Spec** — REQ-108 a REQ-116
- **Contrato** — v0.57 na implementação, v0.58 após a validação BE
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
- O autor confirmou a aprovação de todos os testes e registrou a implementação no commit `aa95860`. A validação integrada com o frontend está pendente.

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

## Ponte com o frontend

O CONTRATO v0.58 registra `implementado (BE)` e o ROADMAP v0.59 marca o backend `pronto`. Copiar ambos na íntegra. Validar a seção FEAT-12 com MSW desligado contra o backend real disponibilizado pelo autor. A URL padrão local é `http://localhost:3333`; confirmar a URL efetiva na sessão integrada.

`src/infra/http/contract-version.ts` anuncia `0.58` em `GET /health` após reiniciar o backend com esta atualização.

### Estados da T-62 para validação integrada

O frontend confirmou os fluxos com o Viajante Ferido, a poção, a vara de pesca e o Peixe Prateado. A validação integral segue aberta. Foram cadastrados 23 grupos no banco local apontado por `.env`. `GET /health` retornou `0.58` e o GET de cada grupo retornou seu estado inicial em `http://localhost:3333`. As ações ficam para a rodada do autor com o frontend.

Os IDs usam o prefixo `fe120000-0000-4000-8000-0000000000` seguido pelos dois dígitos da tabela. O membro é `m1`. Encontros pré-abertos usam `e1`; ao iniciar um encontro pelo HTTP, use o ID da resposta.

| Sufixo | Cenário | Ação e resultado esperado |
| --- | --- | --- |
| 01 | `deck-misto` | Iniciar e revelar, desistir e repetir. A antecipação oculta a carta, e a revelação compra o aleatório mesmo após reciclar. |
| 02 | `so-combate` | `startEvent` ausente. Pedido direto com 1 PA retorna `409 eventDeckEmpty`. |
| 03–04 | `pagamento-vigor-7`, `pagamento-vigor-8` | Pagar `attrs` em dois envios com `h1` e `h2`, depois `gold`. `vigor` retorna `409 eventMinimumNotMet` com `actual: 4` no 03 e êxito com Vigor 5 no 04. |
| 05–06 | `duplicatas-parcial`, `duplicatas-recusado` | Pagar `attrs` com `h2`. No 05 sobra `h1` e fica parcial. No 06 o mínimo falha e ambas as cópias permanecem. |
| 07 | `consumivel` | Ativar a poção com 0 PA leva vida de 10 a 15. Pagar `attrs` com `h2` e tentar ativar de novo retorna `409 eventPaymentStarted`. |
| 08–09 | `aleatorio-vigor-4`, `aleatorio-vigor-5` | Enviar `discard` sem `payment` sorteia `h2`. Segundo envio retorna 409 no 08 e consome `h3` no 09. No 08 compare o RNG e `savedAt` antes e depois da recusa. |
| 10–11 | `esquiva-79`, `esquiva-80` | `resolveEvent` retorna 409 com `actual: 79` no 10 e êxito no 11. |
| 12–14 | `fuga-10-zero-pa`, `fuga-10-um-pa`, `fuga-11` | `escapeEvent` com 10 falha. No 12 cria dívida e o próximo turno começa com 2 PA, no 13 gasta 1 PA agora. Com 11, a fuga tem êxito. |
| 15–16 | `fuga-proibida`, `fuga-sem-vigor` | Fuga retorna `escapeForbidden` ou `notEnoughVigor`. |
| 17 | `recompensa-deck-e-reserva` | `resolveEvent` abre minério urbano. Descartar só um peixe falha; descartar os dois permite manter e abre a poção da reserva. Deixar a poção retorna `removed`. |
| 18–20 | `recompensa-deck-deixar`, `recompensa-fixa-deixar`, `recompensa-busca-vazia` | `resolveEvent` abre a recompensa para conferir `returnedToDeck` ou `sentToLimbo`. No 20 a busca retorna `found: false`. |
| 21–23 | `vasculhar-pendente`, `vasculhar-empilha`, `vasculhar-sem-achado` | Vasculhar `fixture.silver-fish` retorna respectivamente `pending`, `inventory` e `none`. No 21, deixar muda para `left`. |

O catálogo da fixture usa Força e Destreza separadas no 03–04, portanto a variação reproduz a checagem final com dois recibos de atributo e reposição de duas cópias. Vasculhar usa o peixe acessível pela vara. Os cenários de prazo multiplayer seguem a FEAT-26.

```powershell
# Listar os IDs sem acessar o banco
node_modules/.bin/tsx.cmd test/fixtures/restore-feat-12.ts

# Restaurar um grupo de teste
node_modules/.bin/tsx.cmd test/fixtures/restore-feat-12.ts --env .env --only aleatorio-vigor-4

# Ler o estado bruto do RNG e savedAt sem restaurar
node_modules/.bin/tsx.cmd test/fixtures/restore-feat-12.ts --env .env --only aleatorio-vigor-4 --inspect
```

Para restaurar todos os grupos, omita `--only` no comando de restauração. Use o mesmo banco local da API, com o PostgreSQL e o backend disponíveis durante a validação integrada.

### Retorno da validação integrada

A T-62 confirmou os 23 cenários determinísticos contra a API v0.58, inclusive a preservação do RNG e de `savedAt` no grupo 08. A FEAT-12 foi validada. O CONTRATO v0.59 e o ROADMAP v0.60 foram copiados integralmente do frontend e conferidos por SHA-256. Os prazos multiplayer seguem na FEAT-26.
