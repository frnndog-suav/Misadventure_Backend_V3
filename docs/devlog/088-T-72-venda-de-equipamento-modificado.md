# 088 — T-72 — Venda de equipamento modificado

- Data — 2026-11-24
- Status — aguardando revisão
- Spec — v0.88 (REQ-154; nova D-141)
- Contrato — v0.85, FEAT-17 `acordado` (sem mudança; aplica a alteração da FEAT-16 descrita lá)

## Objetivo

Preço de venda do equipamento com refino, encantamentos ligados, marcas de reparo e quebra (README 24.2, 5.1; REQ-154). `MarketView.sellOffers` com uma entrada por cópia de equipamento (`inventorySlotIndex`, `equipmentState`) e `sell` com `inventorySlotIndex` opcional. Fica fora: campanhas (T-73).

## Fluxo

1. Leitura de REQ-154, D-137 (h) e do CONTRATO FEAT-17 (mudança na FEAT-16, tipo de `sellOffers`, cenário "Venda valorizada").
2. Duas perguntas ao autor (AskUserQuestion), respondidas com as opções recomendadas: índice do inventário de antes do lote; índice inválido → `notInInventory` (D-141 a, b).
3. Red: unitários em `market-trade/index.test.ts` (preço, ofertas, venda por índice e sem índice) e `party-action/visit-market.test.ts` (parser). A expectativa antiga de `sellOffers` agregando `W` mudou pela própria REQ (oferta por cópia).
4. Green: `equipmentSellPrice` e `sellValue(config, card, state?)`; `sellOffersOf` por cópia; `applyMarketOperations` acompanha a origem de cada slot (`origins`) e vende pelo índice; `pickFromSlots` devolve também `taken` (quanto saiu de cada slot). Parser aceita `inventorySlotIndex` (`notNonNegativeInteger`).
5. e2e: o cenário "Lote com falha e quebra" de `index.blacksmith.controller.e2e-spec.ts` continua com Consertar e Venda valorizada (oferta a 3, venda por índice, 2ª venda do mesmo índice → 409 `notInInventory`).

## Decisões

- D-141 (a) a (e): ver a spec.

## Arquivos

- **Domínio:** `market-trade/index.ts` e teste; `party-action/index.ts` e `visit-market.test.ts`; `vault/index.ts` (`pickFromSlots` com `taken`).
- **e2e:** `index.blacksmith.controller.e2e-spec.ts`.
- **Docs:** `SPEC-BACKEND.md` v0.88.

## Checks

- typecheck, format e domain-guard: ok. `npx eslint src`: ok (`npm run lint` só com os 73 erros antigos de `test/prepare-feat-13.cjs` e `prepare-feat-14.cjs`).
- `npm test`: 123 arquivos, 1657 testes, verdes.
- `npm run test:e2e`: pendente no fechamento (Postgres fora); ver a revisão abaixo.

## Revisão 2026-11-24

- **spec-reviewer:** aprovado. Os dois pontos não bloqueantes foram aplicados: o crédito da venda passou a um só lugar (`credit`) e o `grow` ganhou um comentário sobre a suposição (compras só acrescentam no fim ou empilham).
- **e2e com o Postgres no ar:** o cenário "Venda valorizada" achou um bug. O `equipmentState` de `sellOffers` saía sem o `active` de cada encantamento, diferente do `InventorySlot`. Correção: `marketToHTTP` em `src/infra/http/presenters/party-presenter/index.ts` usa o mesmo `stateToHTTP` do inventário.
- **Checks finais:** `npm test` 123 arquivos e 1657 testes; `npm run test:e2e` 56 arquivos e 290 testes; typecheck, build, format:check, `npx eslint src` e domain-guard ok.
- **Roteiro ao vivo:** não executável. O conteúdo `content/base` não tem zona com mercado nem ferreiro. A verificação manual fica para as campanhas da T-73.

## Commit sugerido

`feat/add modified equipment sale price (t-72)` (feito pelo autor)

Correção do presenter: `fix/present equipment state in market sell offers (t-72)`
