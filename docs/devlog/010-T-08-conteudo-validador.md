# 010 — T-08 — Conteúdo e validador (FEAT-04)

- **ID:** T-08 · **Data:** 2026-11-14 · **Status:** aguardando revisão
- **Spec:** v0.13 · **Contrato:** v0.11 (FEAT-04 `acordado`, sem mudança)

## Objetivo
Ler e validar o conteúdo de cartas no boot (REQ-10, REQ-11, D-21), com o mesmo relatório no script `validate:content`. Também alinhar o domínio à regra do `id` de coleção em kebab-case (REQ-15, D-22). Criar a fixture de teste do contrato e uma coleção inicial em `content/`.

## Decisões (D-24)
- **Do autor (2026-11-14):**
  - O id da coleção, o `type` e o `collectionId` são derivados do caminho. A pasta é o id; `collection.json` = `{ "name" }`; `<tipo>.json` = array de cartas sem esses dois campos.
  - A coleção `content/base` é mínima e provisória, escrita pelo agente `content-author`.
- **Do agente:**
  - Objetos estritos.
  - Arquivo desconhecido é problema. Tipo sem arquivo = 0 cartas.
  - O caminho do validador pode ser a raiz, a pasta da coleção ou um arquivo dela, e é resolvido para absoluto.
  - Mensagens do Zod com o locale `ptBR`.
  - Ordem do relatório: raiz, coleções em ordem de nome, integridade por último. Id repetido aponta todos os arquivos.
  - Script = `nest build && node dist/...`, sem lib nova (o projeto não tem `tsx`). Contra: recompila a cada uso, e o `deleteOutDir` limpa o `dist`.
  - O e2e usa `CONTENT_DIR=test/fixtures/content`. A imagem Docker copia `content/`.

## Passos e comandos
1. Red no domínio: teste `invalidIdFormat` no id da coleção, depois a checagem em `checkCatalogIntegrity`.
2. `src/infra/content/card-schemas.ts` (schemas derivados dos enums de D-23).
3. Em paralelo, o agente `content-author` escreveu a fixture e a coleção `base`.
4. Red: `load-content.test.ts` (diretórios temporários) e o e2e `content.module.e2e-spec.ts` (o boot falha). Depois, `load-content.ts`, `content-card-catalog.ts`, `content.module.ts`, `validate-content.cli.ts`, `CONTENT_DIR` no env, `ContentModule` no `AppModule`.
5. Revisão do `spec-reviewer`: aprovada. Sugestões aplicadas:
   - `path.resolve` no caminho.
   - Teste da porta (`content-card-catalog.test.ts`).
   - Notas no D-24.
6. Comandos: `npm run format`, `npx vitest run`, `docker compose up -d postgres`, `npm run test:e2e`, `node .claude/hooks/domain-guard.mjs --all`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate:content -- content`, `npm run validate:content -- test/fixtures/content`, `docker compose down`.

## Arquivos
- **Criados:**
  - `src/infra/content/{card-schemas,load-content,content-card-catalog,content.module,validate-content.cli}.ts`
  - `src/infra/content/{load-content,content-card-catalog}.test.ts`
  - `src/infra/content/content.module.e2e-spec.ts`
  - `test/fixtures/content/fixture/*.json` (7 arquivos)
  - `content/base/*.json` (7 arquivos)
- **Alterados:**
  - `src/domain/catalog/enterprise/catalog-integrity/index.ts` e `index.test.ts`
  - `src/infra/env/env.ts` e `env.test.ts`
  - `src/infra/app.module.ts`
  - `test/setup-e2e.ts`
  - `package.json` (script `validate:content`)
  - `Dockerfile` (`COPY content ./content`)
  - `docs/SPEC-BACKEND.md` (v0.13)
  - `docs/devlog/README.md`
  - `docs/devlog/tempo.html`

## Como verificar
- `npm run validate:content -- content` → `Conteúdo válido (content): 1 coleção(ões), 7 carta(s).`, saída 0.
- `npm run validate:content -- test/fixtures/content` → 6 cartas, saída 0.
- Uma pasta com zona urbana de 3 setas, `zoneType: "lava"` e um campo `extra` → `Conteúdo inválido (5 problemas):` com uma linha por problema, saída 1.
- O backend com `CONTENT_DIR` apontando para essa pasta não sobe (saída 1, mostra o relatório). Com o padrão, `GET /health` → 200.

## Problemas
- Ordem dos problemas: o teste esperava outra ordem (a spec não define). A ordem ficou a da implementação e está registrada no D-24.
- Lint: variáveis de desestruturação não usadas no teste foram trocadas por `delete`.

## Checks
- **Unitários:** 105/105.
- **E2E:** 23/23.
- **domain-guard:** OK.
- **typecheck, lint, format:check e build:** saída 0.

## Ponte com o frontend
Nada novo: o contrato não mudou. A cópia das cartas da fixture vai no aviso da `implementado (BE)` (T-09).

## Commit sugerido
`feat/content loader and validator (t-08)`
