# 018 — T-19 — Domínio do editor de conteúdo (FEAT-31)

- **ID:** T-19 (FEAT-31) · **Data:** 2026-11-16 · **Status:** aguardando revisão
- **Spec:** v0.22 · **Contrato:** v0.22 (FEAT-31 `acordado`, sem mudança) · **ROADMAP:** v0.25

## Objetivo
Regras de REQ-41 a REQ-48 no domínio puro (contexto `catalog`, D-46), com TDD unitário, sem infra.

## Decisões
- D-54 (nova, spec v0.22): (a) erros com `details.fields: {path, reason, message?}`, textos no infra (D-49); (b) `checkDimensionComposition` devolve os textos pt-BR; (c) 404 antes do corpo (exceção: filtros da lista, REQ-46); (d) título de zona repetido: carta nova por último, carta existente no lugar do id antigo (D-50); (e) `ContentStore` usa `listEditorCards`/`findEditorCard` para o mesmo adaptador servir `CardCatalog`; (f) problemas das cartas no import só com `collection` válida; (g) corrida conferir/gravar aceita (só dev); (h) busca sem acento via NFD.
- Revisão `spec-reviewer`: aprovado, sem bloqueantes. Aplicados: teste de REQ-41 no domínio; exceção e corrida anotadas em D-54. Pendentes para a T-20: texto pt-BR de `invalidFormat` (`cards` não array) e da tabela D-49; nota de contrato "D-38 → D-49".

## Passos e comandos
1. Tipos (`enterprise/value-objects/content`), portas `ContentStore` e `CardInputParser`, 3 erros, fakes `test/fakes/in-memory-content-store.ts` (editor + catálogo só publicadas) e `fake-card-input-parser.ts`, `toCardInput` em `test/factories/make-card`.
2. Testes (17 arquivos) → vermelho: `Cannot find module '.'`.
3. Funções puras (`collection-input`, `card-validation`, `editor-collection`, `dimension-composition`) e os 15 casos de uso.
4. `npx vitest run src/domain/catalog` (pelo **PowerShell**), `npx tsc --noEmit`, `npx eslint .`, `npm run format:check`, `node .claude/hooks/domain-guard.mjs --all`, `npx vitest run`, `npx nest build`.

## Arquivos
**Criados:** `src/domain/catalog/enterprise/{value-objects/content,collection-input,card-validation,editor-collection,dimension-composition}/`; `src/domain/catalog/application/repositories/{content-store,card-input-parser}/`; `application/use-cases/_errors/content-{invalid,id-taken,locked}-error.ts`; `_shared/normalize-text.ts`; use cases `list-editor-collections`, `create-collection`, `get-editor-collection`, `update-collection`, `delete-collection`, `list-editor-cards`, `create-card`, `get-editor-card`, `replace-card`, `publish-card`, `duplicate-card`, `delete-card`, `validate-dimension`, `export-collection`, `import-collection` (cada um com `index.test.ts`); `get-card/req-41.test.ts`; `test/fakes/in-memory-content-store.ts`, `test/fakes/fake-card-input-parser.ts`.
**Alterados:** `test/factories/make-card/index.ts` (`toCardInput`), `docs/SPEC-BACKEND.md` (v0.22: T-19 `[x]`, D-54).

## Como verificar
`npx vitest run src/domain/catalog` → 22 arquivos, 174 testes verdes. Sem rotas nesta tarefa (entram na T-21).

## Problemas
- No Bash do Git (`cd /d/...`) o vitest falhou em todos os arquivos com `Cannot read properties of undefined (reading 'config')`, inclusive nos testes antigos. Pelo PowerShell (`d:\...`) passa. Use o PowerShell para o vitest.
- A primeira regra de título repetido (só a ordem por id) deixava passar uma zona nova cujo id vinha antes da existente; corrigido com D-54(d).

## Checks
domain-guard OK; tsc sem erros; eslint sem problemas; format:check ok; `npx vitest run` 45 arquivos / 313 testes (antes do teste de REQ-41) e catálogo 174/174 depois; build ok.

## Ponte com o frontend
Nenhum aviso: o contrato não mudou.

## Commit sugerido
`feat/content editor domain`
