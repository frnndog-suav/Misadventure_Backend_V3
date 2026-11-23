# 078 — T-63 — Ir ao Mercado: compras, venda e projeção

- Data — 2026-11-23
- Status — aguardando revisão
- Spec — v0.77 (REQ-140, REQ-141, REQ-142, D-118, D-119; nova D-126)
- Contrato — v0.80, FEAT-16 `acordado` (sem mudança)
- Horas — registro automático

## Objetivo

Terceira tarefa da FEAT-16. O membro da vez numa zona com mercado envia `visitMarket` (lote de `buyStock`, `buyBooster`, `buySingle` e `sell`), por 1 PA, e o presenter projeta `market` e `lastMarketVisit`. Ficam para as próximas: `buyExpansion` e capacidades efetivas (T-64), `openBooster` (T-65).

## Decisões (D-126 na spec)

- Simulação pura em `market-trade` (`applyMarketOperations`); o `Party` só grava no sucesso. O RNG avança só na compra de single (reposição do slot, REQ-139 via `departSingle`).
- Preços em inteiros (D-119): estoque ⌈`stockPrice` × fator⌉; single ⌈base × centésimos × fator × (100 + passo × saídas)⌉ ÷ 10⁶; venda para baixo, mínimo 1 por lote.
- `buyExpansion` fora do parser (vira `unknownOperation` até a T-64); `services` já projetado.
- `sellOffers` só com lote completo; recusas com `cardId` quando citam carta; save antigo: fator 100, `showcase: null`.
- Evento novo `MarketVisited`; `lastMarketVisit` no jsonb v9 (opcional, sem nova versão).
- `availableActions`: `visitMarket` depois das ações de missão e antes de `trainWithMentor`.

## Arquivos

- Novos: `enterprise/market-trade/index.ts` (+ teste), `application/market-catalog/index.ts` (boosters de todas as coleções), testes `party-action/visit-market.test.ts`, `entities/party/visit-market.test.ts`, `take-party-action/visit-market.test.ts`, e2e `take-party-action/index.market.controller.e2e-spec.ts`.
- Alterados: `party-action` (parser), `entities/party` (`visitMarket`, `describeMarket`), `party-member` (`lastMarketVisit`), `party-events` (`MarketVisited`), `available-actions`, `vault` (exporta `removeFromInventory`), `take-party-action` (caso de uso e catálogo), `action-not-allowed-error`, `party-presenter` (`market`, `lastMarketVisit`, leitura das cartas), `drizzle-party-mapper` (schema de `lastMarketVisit`) e seu teste; asserts de `availableActions` da cidade em 5 e2e antigos (ganharam `visitMarket`, como o contrato v0.80 avisa).

## Como verificar

```bash
cd /d/Github/Misadventure_Backend_V3
unset CONTENT_DIR
npm test
docker compose up -d postgres   # o autor
npm run test:e2e
```

Unitários: 107 arquivos, 1470 testes verdes. O e2e **não foi executado** pelo agente (Docker é do autor).

## Problemas

- Heredocs com aspas no Bash do agente falharam; os arquivos foram gravados pelas ferramentas de escrita. Vitest roda pelo PowerShell.
- **Desvio de processo (Constituição 9):** a implementação foi escrita antes dos testes, sem fase red isolada; os testes passaram de primeira.
- Os e2e antigos que listam o `availableActions` da cidade ganharam `visitMarket` (CONTRATO v0.80: "cenários antigos mudam").
- Revisão (spec-reviewer): aprovado sem bloqueantes; corrigido o JSDoc deslocado de `findVaultCatalog` e acrescentado o e2e "Fora do mercado".
- `upgradePlayer` do mapper ainda limita o ouro por `purseCapacity` do snapshot: a T-64 precisa trocar pela efetiva.

## Checks

`domain-guard` OK; `typecheck` OK; `build` OK; `format` aplicado; lint só com os erros pré-existentes de `test/prepare-feat-13.cjs` e `prepare-feat-14.cjs`.

## Ponte com o frontend

Nenhum aviso: sem mudança de contrato. O backend já projeta `market` e `lastMarketVisit` (FEAT-16 ainda não `implementado (BE)`; faltam T-64 a T-66).

## Commit sugerido

`feat/add visit market purchases, sales and projection (t-63)`
