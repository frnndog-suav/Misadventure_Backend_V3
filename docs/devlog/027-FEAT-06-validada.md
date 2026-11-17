# 027 — FEAT-06 — Validação pelo frontend (fechamento)

- **ID:** FEAT-06-validada · **Data:** 2026-11-17 · **Status:** concluída
- **Spec:** v0.29 · **Contrato:** v0.26 (FEAT-06 `validado`) · **ROADMAP:** v0.31

## Objetivo
Receber o retorno do frontend (`/retorno-frontend`): subir o backend para a validação da FEAT-06, aplicar CONTRATO v0.26 e ROADMAP v0.31 e fechar a FEAT.

## Decisões
- A validação rodou sobre uma **cópia descartável** da `fixture` (pasta temporária da sessão), porque os cenários apagam conteúdo e criam `bosque`.
- O backend escuta em `3333`; o aviso do BE (devlog 026) citava `3000` por engano.
- `CONTRACT_VERSION` foi de `0.24` para `0.25` (esquecido no fechamento da T-18) e depois para `0.26`.
- O FE não rodou "apagar `fixture.stone-bend` → `204`" porque um save do autor usa o mapa; o `409` era o esperado ali. O caso está coberto pelo e2e `content-in-use.e2e-spec.ts`.

## Passos e comandos
1. `cp -r test/fixtures/content/. <scratchpad>/fe-content`
2. `CONTENT_DIR=<scratchpad>/fe-content LAB_ENABLED=true npm run start:dev` → `GET /health` `200`; `GET /catalog/classes` com `rogue` e `warrior`; `GET /lab/content/collections` com `fixture` e `publishedCount: 12`.
3. O FE validou 26 conferências dos 12 cenários e as telas sem MSW. Aplicados CONTRATO v0.26 (FEAT-06 `validado`) e ROADMAP v0.31 (FEAT-06 `validado` nas duas colunas), conferidos contra os arquivos colados.

## Arquivos
**Alterados:** `docs/{CONTRATO,ROADMAP}.md`, `src/infra/http/contract-version.ts`, `docs/devlog/README.md`.

## Como verificar
- `GET /health` → `contractVersion: "0.26"`.

## Ponte com o frontend
Nada pendente: CONTRATO v0.26 e ROADMAP v0.31 vieram do FE. Próximo: planejar a FEAT-07 com `/mudar-spec`.

## Commit sugerido
`docs/feat-06 validated (contract v0.26, roadmap v0.31)`
