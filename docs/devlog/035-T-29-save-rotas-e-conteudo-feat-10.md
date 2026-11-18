# 035 — T-29 — Save v5, rotas e conteúdo de teste (FEAT-10)

- **ID:** T-29 · **Data:** 2026-11-17 · **Status:** concluída
- **Spec:** v0.41 · **Contrato:** v0.41 (FEAT-10 `implementado (BE)`) · **Roadmap:** v0.48

## Objetivo
Levar a FEAT-10 de ponta a ponta (REQ-69 a REQ-79): presenter, rota de doação, conteúdo de teste, e2e e `client.http`.

## Decisões
- **D-79 (complemento):** o autor decidiu limitar o `gold` de save antigo à `purseCapacity` na leitura. Era o ponto aberto da T-28. O mapper aplica `min(gold, purseCapacity)`, e há teste unitário e e2e.
- **D-81 (nova):**
  - `PartyPresenter.toHTTP(party, cards)` continua síncrono.
  - Os controllers leem antes as cartas do inventário e dos equipamentos, com `findPartyCards`.
  - O `LabModule` ganha seu próprio `Clock`.

## Passos e comandos
1. Mapper: limite do ouro e teste (`npx vitest run src/infra/database/drizzle/mappers`).
2. Fixture: `fixture.short-sword`, `fixture.oak-shield`, `fixture.iron-helm` (Pico 50), `fixture.arcane-wand` (só `mage`) e `fixture.pickaxe` (ferramenta). Validação: `npm run validate:content -- test/fixtures/content/fixture` (17 cartas).
3. Presenter com os campos da FEAT-10. `findPartyCards` passou a ser chamado nos 5 controllers de `Party`.
4. `GrantToMemberController` (`POST /lab/parties/:partyId/members/:memberId/grants`) no `LabModule`. Status de `LAB_GRANT_INVALID` (400), `MEMBER_NOT_FOUND` (404) e `LAB_GRANT_NO_SPACE` (409).
5. E2E novos:
   - `grant-to-member/index.controller.e2e-spec.ts`: REQ-69, 70, 76, 77 e 78;
   - `take-party-action/index.prepare.controller.e2e-spec.ts`: REQ-70 a 75 e 79.
6. E2E antigos ajustados:
   - config exata (`get-lab-config`, `update-lab-config`) e `create-party`;
   - saves v2/v3 sem os campos v5;
   - contagens da fixture;
   - `schemaVersion` 5 no repositório Drizzle;
   - rota nova no teste do laboratório desligado.
7. Testes unitários de conteúdo: contagem 17. Os dois testes REQ-49 passaram a usar o `combatEvent`, que continua com uma carta só.
8. `drizzle-kit check`: sem diferença. `CONTRACT_VERSION` passou para 0.41 (estava em 0.38).
9. `client.http`: 8 requisições da FEAT-10.

## Arquivos
- **Novos:**
  - `src/infra/http/controllers/grant-to-member/{index.controller.ts,index.controller.e2e-spec.ts}`
  - `src/infra/http/controllers/take-party-action/index.prepare.controller.e2e-spec.ts`
- **Alterados:**
  - `party-presenter`;
  - controllers `create-party`, `get-party`, `start-session`, `end-session`, `take-party-action`;
  - `lab.module.ts`, `domain-error-status.ts`, `contract-version.ts`, `drizzle-party-mapper{,.test}.ts`;
  - fixtures `equipment.json` e `item.json`;
  - testes de conteúdo e e2e citados acima;
  - `client.http`;
  - spec, contrato, roadmap e devlog 034.

## Como verificar
- `npx vitest run` (PowerShell): 77 arquivos, 767 testes.
- `npm run test:e2e`: 43 arquivos, 187 testes.
- Requisições FEAT-10 do `client.http`.

## Problemas
Os testes que contam a fixture quebraram com as cartas novas. Foram ajustados sem mudar o que provam.

## Checks
format, typecheck, lint, domain-guard, unitários e e2e: verdes.

## Ponte com o frontend
AVISO DE FRONTEND — FEAT-10. Levar CONTRATO v0.41 e ROADMAP v0.48.

## Commit sugerido
`feat/feat-10 inventory routes (contract v0.41, roadmap v0.48)`
