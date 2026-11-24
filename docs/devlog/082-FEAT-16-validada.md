# 082 — FEAT-16 validada

- **Data:** 2026-11-24
- **FEAT:** FEAT-16 (Mercado)
- **Situação:** concluída

## Objetivo

Fechar a FEAT-16 depois da validação integrada do frontend (T-74).

## O que aconteceu

- O frontend mandou o AVISO DE BACKEND com o ROADMAP v0.73 (FE `aguardando outro lado`), e essa versão foi aplicada aqui.
- O autor subiu o backend com o `CONTENT_DIR` da T-66 e `LAB_ENABLED=true`. O `/health` respondeu 0.81 e o preparador criou as 11 campanhas.
- O frontend rodou a T-74 contra `http://localhost:3333` com o MSW desligado e respondeu "FEAT-16 validado".
- Nova regra no CLAUDE.md: o comando para a sessão do frontend vai sempre completo, com os dados reais e sem placeholders.

## Arquivos

- `docs/CONTRATO.md` v0.82: FEAT-16 `validado`.
- `docs/ROADMAP.md` v0.74: FEAT-16 `validado` no FE e no BE.
- `src/infra/http/contract-version.ts`: 0.82.
- `CLAUDE.md`: regra "Mensagem para o frontend".

## Como verificar

`curl http://localhost:3333/health` responde `contractVersion` 0.82 depois que o backend é reiniciado.

## Ponte com o frontend

Copie para o frontend o CONTRATO v0.82 e o ROADMAP v0.74.

## Commit sugerido

`docs/close feat-16 validation`
