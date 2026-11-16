# 020 — T-21 — Rotas do editor (FEAT-31)

- **ID:** T-21 (FEAT-31) · **Data:** 2026-11-16 · **Status:** aguardando revisão
- **Spec:** v0.24 · **Contrato:** v0.23 (FEAT-31 `implementado (BE)`) · **ROADMAP:** v0.26

## Objetivo
Expor os 15 casos de uso do editor (T-19) em `/lab/content/*` (REQ-42 a REQ-48 de ponta a ponta), com o filtro de erros traduzindo os problemas de conteúdo para `{ path, message }` (D-49) e o JSON malformado virando `CONTENT_INVALID` (D-51). Isso fecha o lado BE da FEAT-31.

## Decisões
- **D-55 (nova):** o filtro global traduz `details.fields` de `ContentInvalidError`/`ContentIdTakenError` pelo `ContentIssuesPresenter`, em um lugar só e não em 15 controllers. `CONTENT_IN_USE` continua fora de `DOMAIN_ERROR_STATUS` até a T-18 (D-53).
- D-51 aplicada: o prefixo `/lab/content` vem antes de `/lab/` na tabela de corpo malformado, com o corpo próprio (`path ""`, "Envie um objeto JSON.").
- `ContentEditorModule` é importado pelo `LabModule` e só existe com `LAB_ENABLED=true`. As portas vêm do `ContentModule` global.
- Os e2e seguem D-52: o helper `test/content-app.ts` copia `test/fixtures/content` para `os.tmpdir()` em cada arquivo e apaga a cópia no fim.
- `CONTRACT_VERSION` ia de `0.17` para `0.23`: estava defasada desde a v0.17.
- Revisão `spec-reviewer`: sem bloqueantes. Entraram os e2e que faltavam: PUT 400/409, publicar com 400 (cópia de zona, D-50), filtros combinados, `status` desconhecido, `classes` não vazio no import e o catálogo depois de apagar a coleção.

## Passos e comandos
1. Testes primeiro: 15 `index.controller.e2e-spec.ts`, o helper `test/content-app.ts` e 2 casos novos em `lab.module.e2e-spec.ts`.
2. Implementação: presenters, controllers, módulo, filtro e `domain-error-status`.
3. `npm run format`, `npm run lint`, `npm run typecheck`, `node .claude/hooks/domain-guard.mjs --all`, `npm test`, `npm run build`, `npm run validate:content -- content`, `npm run validate:content -- test/fixtures/content`.
4. O autor subiu `docker compose up -d postgres` e rodei `npm run test:e2e`.
5. Roteiro: `LAB_ENABLED=true PORT=3399 CONTENT_DIR=<cópia da fixture no scratchpad> node dist/infra/main.js` e `curl` de cada cenário do contrato.
6. Contrato v0.23 (`implementado (BE)`), ROADMAP v0.26 e spec v0.24 com T-21 `[x]`.

## Arquivos
**Criados:**
- `src/infra/http/content-editor.module.ts`;
- `src/infra/http/presenters/{editor-collection,editor-card,dimension-validation,collection-export,import-result,content-issues}-presenter/index.ts`;
- `src/infra/http/controllers/{list-editor-collections,create-collection,get-editor-collection,update-collection,delete-collection,validate-dimension,export-collection,import-collection,list-editor-cards,create-card,get-editor-card,replace-card,publish-card,duplicate-card,delete-card}/index.controller{,.e2e-spec}.ts`;
- `test/content-app.ts`.

**Alterados:**
- `src/infra/http/{lab.module.ts,lab.module.e2e-spec.ts,contract-version.ts}`;
- `src/infra/http/errors/{domain-error-status.ts,all-exceptions-filter/index.ts}`;
- `client.http`;
- `docs/{SPEC-BACKEND,CONTRATO,ROADMAP}.md`.

## Como verificar
- `npm run test:e2e` (precisa do Postgres).
- `client.http` (seção FEAT-31).
- `curl http://localhost:3333/lab/content/collections` com `LAB_ENABLED=true`.

## Problemas
- Os e2e foram escritos antes do código, mas o Postgres estava desligado. Só rodaram depois da implementação, então o "vermelho" não foi confirmado.
- Um script de criação em lote no Git Bash falhou na análise (heredocs) e não criou nada. Os arquivos foram criados um a um.
- O Git Bash manda acentos dos argumentos do `curl` em outra codificação, e a resposta mostrou `�`. Pelo `client.http` e no e2e (UTF-8) o resultado está certo.
- **Dúvida em aberto:** REQ-48 prevê `409` para "id de carta usado por outra coleção". Como o id leva o prefixo da coleção, uma carta com id de outra coleção cai antes em `400` (`collectionMismatch`/formato). Na prática, o `409` parece inalcançável. O teste foi retirado e o caso fica para o autor decidir.

## Checks
- domain-guard OK.
- tsc, eslint e format:check limpos.
- Unitários: 49 arquivos, 341 testes.
- e2e: 34 arquivos, 101 testes; depois da revisão, as rotas http passaram (30 arquivos, 92 testes).
- build ok.
- validate:content (content e fixture) ok.

## Ponte com o frontend
AVISO DE FRONTEND da FEAT-31: levar CONTRATO v0.23 e ROADMAP v0.26 e validar o editor contra o backend real (`/retorno-backend`).

## Commit sugerido
`feat/content editor routes`
