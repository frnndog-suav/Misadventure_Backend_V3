# 029 — T-23 — Rota de ações (FEAT-07)

- **ID:** T-23 · **Data:** 2026-11-17 · **Status:** aguardando revisão
- **Spec:** v0.32 · **Contrato:** v0.29 (FEAT-07 `implementado (BE)`) · **Roadmap:** v0.33

## Objetivo
Levar REQ-50 a REQ-53 (domínio da T-22) até o HTTP: `POST /parties/:partyId/actions` e `moveTargets` no estado do jogador.

## Decisões
- Controller fino, no padrão de `create-party`/`end-session`: corpo cru (`@Body() body: unknown`), `200`, validação toda no domínio (D-62).
- `moveTargets` sai do `PartyPresenter` por `connectedZones(map, player.zoneId)`; não é gravado no save (REQ-50). O presenter importa a função pura do domínio, o que a hexagonal permite (infra → domínio).
- `ACTION_INVALID` → 400 e `ACTION_NOT_ALLOWED` → 409 em `domain-error-status.ts`.
- **Bug achado pelo e2e:** o filtro de JSON malformado casava prefixo por `startsWith`, então `/parties/*/actions` nunca casava e a resposta era `PARTY_INVALID`. `invalidBodyFor` passou a aceitar `*` como um segmento da rota; a entrada de ações vem antes de `/parties` (D-62, como D-51).
- O e2e do `create-party` ganhou `moveTargets: expect.any(Array)`: é o campo novo do contrato (FEAT-06 alterada pela FEAT-07), não um teste forçado a passar.
- Sem migração (D-61).

## Passos e comandos
1. Testes primeiro: `src/infra/http/controllers/take-party-action/index.controller.e2e-spec.ts` (um `it` por REQ-50 a REQ-53, cenários do contrato com a `fixture`).
2. Implementação (controller, módulo, status, filtro, presenter).
3. `npx vitest run --config vitest.config.e2e.ts <controllers de parties>` → 2 falhas (filtro e `moveTargets`) → corrigidas.
4. `npm run format`, `npm run typecheck`, `npm run lint`, `node .claude/hooks/domain-guard.mjs --all`, `npm test`, `npm run test:e2e`.
5. `/contrato FEAT-07 implementado`: CONTRATO v0.29, ROADMAP v0.33 (BE `pronto`).

## Arquivos
**Novos:** `src/infra/http/controllers/take-party-action/index.controller.ts` e `index.controller.e2e-spec.ts`.
**Alterados:** `src/infra/http/campaign.module.ts`, `src/infra/http/errors/{domain-error-status.ts,all-exceptions-filter/index.ts}`, `src/infra/http/presenters/party-presenter/index.ts`, `src/infra/http/controllers/create-party/index.controller.e2e-spec.ts`, `client.http`, `docs/{SPEC-BACKEND,CONTRATO,ROADMAP}.md`, `docs/devlog/{README.md,tempo.html}`.

## Como verificar
`npm run test:e2e` → 40 arquivos, 148 testes verdes. `npm test` → 69 arquivos, 572 testes verdes. Requests em `client.http` (seção FEAT-07).

## Checks
typecheck, lint, format e domain-guard limpos. `curl` real não rodado: o Docker é manual do autor; os e2e usam o app em memória.

## Ponte com o frontend
AVISO DE FRONTEND — FEAT-07 emitido (CONTRATO v0.29, ROADMAP v0.33). O FE valida contra o backend real e devolve por `/retorno-backend`.

## Commit sugerido
`feat/feat-07 actions route`
