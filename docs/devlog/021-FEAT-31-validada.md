# 021 — FEAT-31 — Validação pelo frontend (fechamento)

- **ID:** FEAT-31-validada · **Data:** 2026-11-16 · **Status:** aguardando revisão
- **Spec:** v0.24 · **Contrato:** v0.24 (FEAT-31 `validado`) · **ROADMAP:** v0.28

## Objetivo
Receber o retorno do frontend (`/retorno-frontend`): subir o backend para a validação da FEAT-31, aplicar CONTRATO v0.24 e ROADMAP v0.27/v0.28 e fechar a FEAT.

## Decisões
- A validação roda contra uma **cópia descartável** da `fixture` (`.tmp-validacao/`), porque os cenários gravam em `CONTENT_DIR` (criam `bosque`, renomeiam, importam). Apontar para `test/fixtures/content` sujaria a fixture.
- A primeira subida caiu em `content/` (coleção "base"), porque `CONTENT_DIR` não estava definido (padrão `content`, `src/infra/env/env.ts`). O FE avisou, e o backend foi subido de novo com a cópia.
- O backend escuta em `3333`. O aviso do FE citava `3000`.
- O cenário "laboratório desligado", que o FE não rodou, foi conferido aqui: `GET /lab/content/collections` → `404` `NOT_FOUND`.
- `CONTRACT_VERSION` passou de `0.23` para `0.24`.

## Passos e comandos
1. ROADMAP v0.27 (coluna FE da FEAT-31 `aguardando outro lado`).
2. `Copy-Item -Recurse test\fixtures\content .\.tmp-validacao`
3. `$env:DATABASE_URL='postgresql://docker:docker@localhost:5432/misadventures'; $env:LAB_ENABLED='true'; $env:CONTENT_DIR='.tmp-validacao'; $env:PORT='3333'; npm run start:dev` → `GET /lab/content/collections` só com `fixture`, `publishedCount: 6`.
4. O FE validou 17 de 18 cenários (29 conferências) e as telas sem MSW. Aplicados CONTRATO v0.24 (FEAT-31 `validado`) e ROADMAP v0.28 (FEAT-31 `validado` nas duas colunas).
5. Subida com `LAB_ENABLED='false'` e `curl -s -w ' %{http_code}' localhost:3333/lab/content/collections` → `404` `NOT_FOUND`; `/health` → `contractVersion: "0.24"`.
6. Backend parado, `.tmp-validacao` apagada; `npx vitest run --config vitest.config.e2e.ts health` → 1 passou.

## Arquivos
**Alterados:** `docs/{CONTRATO,ROADMAP}.md`, `src/infra/http/contract-version.ts`.

## Como verificar
- `GET /health` → `contractVersion: "0.24"`.

## Problemas
- `npx vitest related --run …` pelo Git Bash falhou ao carregar a config (`reading 'config'`), sem rodar nenhum teste. Pelo PowerShell, o e2e do health passou.

## Ponte com o frontend
Nada pendente: CONTRATO v0.24 e ROADMAP v0.28 vieram do FE. Próximo no BE: FEAT-06 (T-14).

## Commit sugerido
`docs/feat-31 validated (contract v0.24, roadmap v0.28)`
