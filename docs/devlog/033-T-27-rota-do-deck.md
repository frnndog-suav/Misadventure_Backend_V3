# 033 — T-27 — Rota do deck (FEAT-09)

- **ID:** T-27 · **Data:** 2026-11-17 · **Status:** aguardando revisão
- **Spec:** v0.38 · **Contrato:** v0.37 (FEAT-09 `implementado (BE)`) · **Roadmap:** v0.42

## Objetivo
REQ-60 a REQ-68 de ponta a ponta: build e pasta na resposta, `recover` e `adjustDeck` pela rota de ações, save v4 no Postgres, e2e de cada cenário do contrato.

## Decisões
- O mapper v4 (leitura de v3 e v2) e o texto de `starterDeckCopyLimit` já tinham sido adiantados na T-26 (D-72). Aqui faltavam presenter, e2e e `client.http`.
- `PartyPresenter`: `build` e `tcgFolder` copiados do `PlayerState` (já em ordem de `cardId`), `buildSize` = soma das cópias da build, `tcgFolderCapacity` = `party.config.tcgFolderCapacity` (cópia do grupo, D-11).
- Saves com pasta montados **direto no `jsonb`** (helper `mount` no e2e), como o save v2 da T-25; não foi criada uma "factory do Drizzle" (a spec citava uma, que não existe). Registrado no histórico da spec v0.38.
- A fixture não tem carta sinérgica. O e2e cria `fixture.might-synergy` só na **cópia temporária** do conteúdo (`createContentApp(prepare)`, D-52); a `fixture` compartilhada com o FE não muda.
- Testes antigos alinhados à spec (não a bug): `get-lab-config` e `update-lab-config` com as 5 chaves de REQ-60; `create-party` (REQ-31) com `build`/`buildSize`/`tcgFolder`/`tcgFolderCapacity` e `availableActions` de REQ-67 (a asserção "a build não trafega" saiu: D-69); `take-party-action` com REQ-67 e o save v2 regravado como v4; repositório Drizzle com `schemaVersion` 4.
- `CONTRACT_VERSION` → `0.37`.

## Passos e comandos
1. `npm run test:e2e` antes de mexer: 9 falhas, todas por testes antigos defasados pela T-26.
2. Testes: novo `src/infra/http/controllers/take-party-action/index.deck.controller.e2e-spec.ts` (13 `it`) e os alinhamentos. `npx vitest run --config vitest.config.e2e.ts src/infra/http/controllers/take-party-action ...` → falhas pelo motivo certo (campos ausentes no presenter).
3. Presenter; `client.http` com os cenários da FEAT-09.
4. `npm run format`, `npm run lint`, `npm run typecheck`, `node .claude/hooks/domain-guard.mjs --all`, `npm test`, `npm run test:e2e`, `npm run build`, `npx drizzle-kit generate`.
5. `/contrato FEAT-09 implementado`: CONTRATO v0.37, ROADMAP v0.42 (BE `pronto`).

## Arquivos
**Novos:** `src/infra/http/controllers/take-party-action/index.deck.controller.e2e-spec.ts`, `docs/devlog/033-T-27-rota-do-deck.md`.
**Alterados:** `src/infra/http/presenters/party-presenter/index.ts`, `src/infra/http/contract-version.ts`, `src/infra/http/controllers/{create-party,get-lab-config,update-lab-config,take-party-action}/index.controller.e2e-spec.ts`, `src/infra/database/drizzle/repositories/drizzle-parties-repository.e2e-spec.ts`, `client.http`, `docs/{SPEC-BACKEND,CONTRATO,ROADMAP}.md`, `docs/devlog/{README.md,tempo.html}`.

## Como verificar
`npm test` → 70 arquivos, 678 testes. `npm run test:e2e` (Postgres no ar) → 41 arquivos, 169 testes. Roteiro com `curl` na resposta da etapa.

## Checks
format, lint, typecheck, domain-guard, build limpos; `drizzle-kit generate` → "No schema changes".

## Ponte com o frontend
AVISO DE FRONTEND — FEAT-09: levar `docs/CONTRATO.md` v0.37 e `docs/ROADMAP.md` v0.42; o FE implementa e valida contra o backend real.

## Commit sugerido
`feat/feat-09 deck route`
