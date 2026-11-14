# 011 — T-09 — Rotas do catálogo (FEAT-04)

- **ID:** T-09 · **Data:** 2026-11-14 · **Status:** aguardando revisão
- **Spec:** v0.14 · **Contrato:** v0.12 (FEAT-04 `implementado (BE)`) · **ROADMAP:** v0.14

## Objetivo
Expor o catálogo carregado na T-08 pelas três rotas do contrato (REQ-12 a REQ-14): `GET /catalog/collections`, `GET /catalog/collections/:collectionId/cards` (`?type=`) e `GET /catalog/cards/:cardId`. Fechar o lado backend da FEAT-04.

## Decisões (D-25)
Todas do agente. Não houve ambiguidade real: o contrato traz os valores exatos, e D-23 já define que o filtro é conferido antes da coleção.
- Rotas no `HttpModule` (sempre ligadas, ao contrário do `LabModule`), com os casos de uso criados por `useFactory` a partir da porta `CardCatalog` do `ContentModule` (global).
- `?type=` vai cru (`unknown`) ao caso de uso, sem pipe. Por isso `?type=` vazio ou repetido também dá `CATALOG_QUERY_INVALID`.
- `CardPresenter` devolve a carta sem cópia: os tipos do domínio espelham o contrato campo a campo (D-23). Contra: se o domínio ganhar um campo interno, o presenter precisa passar a filtrar. `CollectionPresenter` copia os três campos.
- A ordem das chaves no JSON da carta segue o leitor de conteúdo (`type` e `collectionId` no fim). Não é parte do contrato; registrado no histórico do contrato para o frontend comparar por campo.
- `CONTRACT_VERSION` passou de `0.8` para `0.12` (D-06: atualizado pela `/contrato`).

## Passos e comandos
1. Red: e2e de cada controller (7 casos, um por cenário do contrato). `docker compose up -d postgres` e `npx vitest run --config vitest.config.e2e.ts src/infra/http/controllers/list-collections src/infra/http/controllers/list-collection-cards src/infra/http/controllers/get-card`: 7 falhando com 404 `NOT_FOUND` (rotas inexistentes).
2. Green: presenters, controllers, `DOMAIN_ERROR_STATUS`, providers no `HttpModule`, `client.http`.
3. `npm run format`; `npm run test:e2e`; checks da `/checar`.
4. Verificação real: `npm run start:dev` (conteúdo `content/`) e `curl` dos cenários; depois `docker compose down`.
5. `/contrato FEAT-04 implementado`: CONTRATO v0.12, ROADMAP v0.14, `CONTRACT_VERSION` = `0.12`; e2e do `/health` rodado de novo (1 passando).

## Arquivos
- **Criados:**
  - `src/infra/http/controllers/{list-collections,list-collection-cards,get-card}/index.controller.ts` e os `index.controller.e2e-spec.ts` ao lado
  - `src/infra/http/presenters/{card-presenter,collection-presenter}/index.ts`
- **Alterados:** `src/infra/http/http.module.ts`, `src/infra/http/errors/domain-error-status.ts`, `src/infra/http/contract-version.ts`, `client.http`, `docs/SPEC-BACKEND.md`, `docs/CONTRATO.md`, `docs/ROADMAP.md`, `docs/devlog/README.md`, `docs/devlog/tempo.html`.

## Como verificar
`docker compose up -d postgres`, `npm run start:dev`, depois:
- `curl -s localhost:3333/catalog/collections` → 200 com a coleção `base` (`zone: 2`, demais tipos 1).
- `curl -s "localhost:3333/catalog/collections/base/cards?type=monster"` → 400 `CATALOG_QUERY_INVALID` com `details`.
- `curl -s localhost:3333/catalog/collections/nope/cards` → 404 `COLLECTION_NOT_FOUND`.
- `curl -s localhost:3333/catalog/cards/base.dexterity-basic` → 200; `base.nope` → 404 `CARD_NOT_FOUND`.
- Cenários exatos do contrato (coleção `fixture`): `npm run test:e2e`.

## Problemas
Nenhum.

## Checks
domain-guard OK; typecheck, lint, format:check limpos; unitários 105/105; e2e 30/30 (11 arquivos); build OK (`dist/` apagado).

## Ponte com o frontend
AVISO DE FRONTEND — FEAT-04 emitido: levar `docs/CONTRATO.md` v0.12 e `docs/ROADMAP.md` v0.14 e as cópias de `test/fixtures/content/fixture/*.json` para as fixtures do MSW.

## Commit sugerido
`feat/catalog routes (t-09)`
