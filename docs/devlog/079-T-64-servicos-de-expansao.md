# 079 — T-64 — Serviços de expansão e capacidades efetivas

- Data — 2026-11-23
- Status — aguardando revisão
- Spec — v0.78 (REQ-143, D-120; nova D-127)
- Contrato — v0.80, FEAT-16 `acordado` (sem mudança)
- Horas — registro automático

## Objetivo

Quarta tarefa da FEAT-16. O `visitMarket` aceita `buyExpansion` (`vaultSlots`, `deckSlots`, `tcgFolder`, `purse`, `vaultGold`), e as capacidades efetivas do jogador (snapshot + expansões) passam a valer em todas as regras que as usam, no save e no presenter. Fica para a T-65 abrir booster.

## Decisões (D-127 na spec)

- `capacitiesOf` foi de `market-trade` para `markets`: o cofre precisa dela e `market-trade` já importa o cofre (evita ciclo).
- `buyExpansion` só recusa com `notEnoughGold` (`operationIndex`, sem `cardId`). A compra vale na hora: bolsa comprada no lote já vale na venda seguinte.
- Capacidades efetivas em: Usar cofre (slots, ouro do cofre, bolsa, pasta, decks), recompensa de carta, Ajustar deck, doação do laboratório, ativações de efeito, ouro de recompensa, habilidades em combate e limite de ouro ao ler o save.
- Presenter: `expansions` e as capacidades efetivas de cada membro.
- Save: o schema zod do `lastMarketVisit` aceita `buyExpansion`; sem nova versão.

## Arquivos

- Alterados (domínio): `markets` (`capacitiesOf`, `TCapacities`), `market-trade` (operação e resultado), `party-action` (tipo e parser), `vault`, `combat`, `entities/party`.
- Alterados (infra): `drizzle-party-mapper` (schema do `lastMarketVisit`, ouro limitado pela bolsa efetiva), `party-presenter` (`expansions`, capacidades efetivas).
- Testes: `party-action/visit-market.test.ts`, `market-trade/index.test.ts`, novo `entities/party/expansions.test.ts`, `drizzle-party-mapper.test.ts`, e2e `index.market.controller.e2e-spec.ts` (2 casos novos).

## Como verificar

```bash
cd /d/Github/Misadventure_Backend_V3
unset CONTENT_DIR
npm test
docker compose up -d postgres   # o autor
npm run test:e2e
```

Unitários: 108 arquivos, 1489 testes verdes. E2e rodado pelo autor em 2026-11-23: 52 arquivos, 267 de 268 verdes; a falha era o `toEqual` da criação (REQ-31) sem o campo novo `expansions`, ajustado só no teste (o contrato pede as 5 contagens em 0 na criação).

## Problemas

- Vitest não roda pelo Git Bash neste ambiente (`reading 'config'`); rodou pelo PowerShell.
- O typecheck pegou o schema zod do `lastMarketVisit` sem `buyExpansion`; sem esse ajuste a visita com expansão não seria gravada.

## Checks

`domain-guard` OK; `typecheck` OK; `build` OK; `format:check` OK; lint só com os erros pré-existentes de `test/prepare-feat-13.cjs` e `prepare-feat-14.cjs`.

## Ponte com o frontend

Nenhum aviso: sem mudança de contrato. O backend já projeta `expansions` e as capacidades efetivas (FEAT-16 ainda não `implementado (BE)`; faltam T-65 e T-66).

## Commit sugerido

`feat/add market expansions and effective capacities (t-64)`
