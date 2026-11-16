# 015 — T-13 — Rotas da campanha (`/parties`) e FEAT-05 `implementado (BE)`

- **ID:** T-13 (FEAT-05) · **Data:** 2026-11-15 · **Status:** aguardando revisão
- **Spec:** v0.19 · **Contrato:** v0.16 (FEAT-05 `implementado (BE)`) · **ROADMAP:** v0.19

## Objetivo
Expor os seis casos de uso da campanha por HTTP conforme CONTRATO FEAT-05 (REQ-16 a REQ-21, REQ-23, REQ-24) e fechar o lado backend da FEAT-05.

## Decisões (D-35)
- `CampaignModule` separado (`src/infra/http/campaign.module.ts`, sempre ligado), com os providers das portas `Clock`, `IdGenerator`, `SeedGenerator` e um `GetGameConfigUseCase` próprio (o do `LabModule` só existe com `LAB_ENABLED=true`). Prós: `HttpModule` não cresce; contra: um provider duplicado (sem estado, barato).
- Filtro de erros: tabela prefixo → corpo `invalidBody` (`/lab/*` → `LAB_CONFIG_INVALID`; `/parties`, `/parties/*` → `PARTY_INVALID`). Generaliza D-17 sem repetir `if`.
- **Despacho de `domainEvent` não foi criado:** não há assinante. Os eventos morrem com o agregado no fim do pedido. O despachante nasce com o primeiro consumidor. Dúvida explícita: se o autor quiser o despachante já agora (para log, por exemplo), é uma tarefa pequena à parte.
- Tarefa só de infra → revisão do diff feita por mim contra spec e contrato, sem `spec-reviewer`.

## Passos e comandos
1. Testes primeiro: seis `index.controller.e2e-spec.ts` (um por controller) e o helper `test/parties-e2e.ts` (`resetCampaign`, `postParty`, `ISO_UTC`, `PARTY_NOT_FOUND`).
2. `docker compose up -d postgres`; `npx vitest run --config vitest.config.e2e.ts src/infra/http/controllers` → 16 testes novos falhando com `404 NOT_FOUND` (rotas inexistentes).
3. Presenters, controllers, `CampaignModule` (importado no `AppModule`), `PARTY_*` no `DOMAIN_ERROR_STATUS`, tabela `invalidBody` no filtro, `client.http`.
4. `npm run test:e2e` → 18 arquivos, 53 testes.
5. `npm run format`, `typecheck`, `lint`, `format:check`, `node .claude/hooks/domain-guard.mjs --all`, `npm test`, `npm run build`.
6. `npm run db:migrate`; `node dist/infra/main.js`; roteiro com `curl` (13 pedidos, todos com a resposta do contrato).
7. Servidor parado, `docker compose down`, Docker Desktop fechado.
8. `/contrato FEAT-05 implementado`: CONTRATO v0.16, ROADMAP v0.19 (BE `pronto`), `CONTRACT_VERSION` = `0.16`.

## Arquivos
**Criados:** `src/infra/http/campaign.module.ts`; `src/infra/http/controllers/{create-party,list-parties,get-party,start-session,end-session,abandon-party}/index.controller{.ts,.e2e-spec.ts}`; `src/infra/http/presenters/{party-presenter,party-summary-presenter}/index.ts`; `test/parties-e2e.ts`.

**Alterados:** `src/infra/app.module.ts`, `src/infra/http/errors/domain-error-status.ts`, `src/infra/http/errors/all-exceptions-filter/index.ts`, `src/infra/http/contract-version.ts`, `client.http`, `docs/SPEC-BACKEND.md` (T-13 `[x]`, D-35, v0.19), `docs/CONTRATO.md` (v0.16), `docs/ROADMAP.md` (v0.19), este índice, `tempo.html`.

## Como verificar
- Com Postgres: `npm run test:e2e` → 18 arquivos, 53 testes.
- `client.http` (bloco FEAT-05) ou o roteiro de `curl` da resposta da tarefa.

## Problemas
- Ordem de `GET /parties` no e2e dependia de dois `savedAt` no mesmo milissegundo (relógio real); o teste espera 5 ms antes de continuar o primeiro grupo.
- O `tempo.mjs fechar` contou 0 h ativas (19:58–21:39); registrado como veio.

## Checks
- `npm test`: 28 arquivos, 182 testes. `npm run test:e2e`: 18 arquivos, 53 testes.
- `typecheck`, `lint`, `format:check`, `domain-guard --all`, `build`: OK.

## Ponte com o frontend
AVISO DE FRONTEND — FEAT-05: levar `docs/CONTRATO.md` v0.16 e `docs/ROADMAP.md` v0.19; validar os 7 cenários contra o backend real (`/retorno-backend`).

## Commit sugerido
`feat/campaign routes and feat-05 implemented (t-13)`
