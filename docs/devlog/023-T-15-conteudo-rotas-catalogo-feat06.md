# 023 — T-15 — Conteúdo, leitor e rotas do catálogo (FEAT-06)

- **ID:** T-15 (FEAT-06) · **Data:** 2026-11-16 · **Status:** aguardando revisão
- **Spec:** v0.26 · **Contrato:** v0.24 (FEAT-06 `acordado`, sem mudança) · **ROADMAP:** v0.29

## Objetivo
Ler `class.json` do disco (REQ-10, REQ-11, REQ-26), servir as classes publicadas pela porta `CardCatalog`, expor `GET /catalog/classes` (REQ-27) e pôr na fixture e no `content/base` o conteúdo da FEAT-06 (Carta de Dimensão, zonas com `arrowLayout`, cartas `basic` e classes; REQ-28, D-37, D-39, D-40).

## Decisões
- **D-57 (nova):** `status` opcional em `class.json`; integridade de boot sobre todas as classes (**pendente para a T-18**: tamanho, trava e essenciais únicos só nas publicadas); `TContentProblem.playerClass`; exclusão e import com `replace` tiram as classes da coleção; arquivos em ordem de `id`/`playerClass`; e2e antigos ajustados à fixture maior.
- Conteúdo escrito pelo agente `content-author`. Os decks provisórios da base seguem uma regra mecânica: a trava exata nos essenciais e o restante repartido em 5–6 cópias pelos outros atributos.

## Passos e comandos
1. Schema `classFileSchema`, `readClasses` no `loadContent`, classes no `FileContentStore`, `TEditorClass` no domínio.
2. Testes: `load-content.test.ts` (leitura, schema, integridade, não-lista, relatório), `file-content-store.test.ts` (só publicadas, exclusão, import), e2e `list-classes`, `get-card` (Dimensão, `arrowLayout`) e `list-collection-cards` (`?type=dimension`).
3. `ListClassesController`, `ClassPresenter`, `client.http`.
4. `npm run format`, `typecheck`, `lint`, `domain-guard --all`, `npm test` (382), `npm run test:e2e` (112), `validate:content` em `content` e na fixture, `curl`.

## Arquivos
- **Criados:** `src/infra/http/controllers/list-classes/index.controller{,.e2e-spec}.ts`, `src/infra/http/presenters/class-presenter/index.ts`, `content/base/{class,dimension}.json`, `test/fixtures/content/fixture/{class,dimension}.json`.
- **Alterados:** `src/domain/catalog/enterprise/value-objects/content`, `src/infra/content/{card-schemas,load-content,file-content-store}.ts` e seus testes, `src/infra/http/http.module.ts`, e2e de `catalog-published-only`, `get-card`, `get-editor-collection`, `list-collections`, `list-collection-cards`, `list-editor-collections` e `validate-dimension`, `content/base/attribute.json`, `test/fixtures/content/fixture/{attribute,zone}.json`, `client.http`, `docs/SPEC-BACKEND.md`.

## Como verificar
`CONTENT_DIR=test/fixtures/content npm run start:dev` e `curl localhost:3333/catalog/classes` → `rogue` e `warrior` no formato do contrato.

## Problemas
- O Vitest falha ("failed to find the runner") quando é chamado com o drive em minúsculas (`/d/…` no Git Bash). Pelo PowerShell (`D:`) funciona.

## Ponte com o frontend
Nenhuma ação agora: a FEAT-06 só fica `implementado (BE)` na T-18.

## Commit sugerido
`feat/class content and catalog classes route`
