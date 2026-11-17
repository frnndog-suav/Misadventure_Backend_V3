# 031 — T-25 — Save v3 e rota da vez (FEAT-08)

- **ID:** T-25 · **Data:** 2026-11-17 · **Status:** aguardando revisão
- **Spec:** v0.35 · **Contrato:** v0.33 (FEAT-08 `implementado (BE)`) · **Roadmap:** v0.37

## Objetivo
REQ-54 a REQ-59 de ponta a ponta: `turn` gravado no Postgres (save v3, D-64), `turn` e `availableActions` na resposta, e2e de cada cenário do contrato.

## Decisões
- `DrizzlePartyMapper`: `stateSchema` é uma união discriminada por `schemaVersion` (2 | 3), com os mesmos campos e `turn` só no v3. O v2 é lido com `turn` na rodada 1, 1º de `turnOrder` e `config.actionPointsPerTurn` do save; a escrita é sempre v3 (D-64). Sem migração SQL (`npx drizzle-kit generate` → "No schema changes").
- O mapper também recusa (lança) `turn.memberId` fora de `turnOrder`, `round < 1` e `actionPoints < 0`: save corrompido, como o resto da D-31. Registrado no histórico da spec v0.35.
- `PartyPresenter`: `turn` no `Party` e `availableActions` (função pura do domínio, D-65) em cada `PlayerState`.
- Dois testes antigos foram alinhados à spec (não a um bug): o e2e do REQ-31 (`create-party`) passa a esperar `turn` e `availableActions`; o e2e do repositório (D-31) passa a esperar `schemaVersion` 3.
- REQ-54 no e2e usa `GameConfigRepository.save` direto (o arquivo sobe o app com o laboratório desligado).
- `CONTRACT_VERSION` → `0.33` (estava em `0.30`, defasado desde o `validado` da FEAT-07).

## Passos e comandos
1. Testes primeiro: `drizzle-party-mapper.test.ts` (v3, ida e volta de `turn`, v2 → v3, saves corrompidos) e `take-party-action/index.controller.e2e-spec.ts` (um `it` por REQ, inclusive o save v2 regravado à mão via `DRIZZLE`). `npx vitest run src/infra/database/drizzle/mappers/drizzle-party-mapper.test.ts` → 4 falhas pelo motivo certo.
2. Implementação do mapper e do presenter; `client.http` com `endTurn`.
3. `npm run format`, `npm run lint`, `npm run typecheck`, `node .claude/hooks/domain-guard.mjs --all`, `npm test`, `npm run test:e2e`, `npm run build`, `npx drizzle-kit generate`.

## Problemas
- No Git Bash do Windows (`cd /d/Github/...`), o Vitest falha toda suíte com `Cannot read properties of undefined (reading 'config')` (já acontecia no HEAD). No PowerShell roda normal. Use PowerShell para os testes.

## Arquivos
**Novos:** `docs/devlog/031-T-25-save-v3-e-rota-da-vez.md`.
**Alterados:** `src/infra/database/drizzle/mappers/drizzle-party-mapper{.ts,.test.ts}`, `src/infra/http/presenters/party-presenter/index.ts`, `src/infra/http/contract-version.ts`, `src/infra/http/controllers/{take-party-action,create-party}/index.controller.e2e-spec.ts`, `src/infra/database/drizzle/repositories/drizzle-parties-repository.e2e-spec.ts`, `client.http`, `docs/{SPEC-BACKEND,CONTRATO,ROADMAP}.md`, `docs/devlog/{README.md,tempo.html}`.

## Como verificar
`npm test` → 70 arquivos, 605 testes. `npm run test:e2e` (Postgres no ar) → 40 arquivos, 156 testes. Roteiro com `curl` na resposta da etapa.

## Checks
format, lint, typecheck, domain-guard, build limpos; drizzle-kit sem diferença.

## Ponte com o frontend
AVISO DE FRONTEND — FEAT-08: levar `docs/CONTRATO.md` v0.33 e `docs/ROADMAP.md` v0.37; o FE implementa e valida contra o backend real.

## Commit sugerido
`feat/feat-08 save v3 and turn route`
