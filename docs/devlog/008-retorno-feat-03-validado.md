# 008 — Retorno do frontend — FEAT-03 `validado`

- **ID:** retorno (FEAT-03) · **Data:** 2026-11-14 · **Status:** aguardando revisão
- **Spec:** v0.9 · **Contrato:** v0.9 · **Roadmap:** v0.11

## Objetivo
Aplicar no backend as cópias de `docs/CONTRATO.md` (v0.9) e `docs/ROADMAP.md` (v0.11) que o frontend gerou ao validar a FEAT-03 contra o backend real.

## O que veio
- **CONTRATO v0.9 (FE):** a seção FEAT-03 passa a `validado`. Os 6 cenários passaram contra `http://localhost:3333`, além do JSON malformado (`invalidBody`), do `/health` com `0.8`, do CORS para `http://localhost:5173` e dos e2e da área `lab` com o MSW desligado. Não há mudança de formato.
- **ROADMAP v0.11:** FEAT-03 `validado` nos dois lados. A FEAT está concluída.

## Conferência
`git diff docs/CONTRATO.md docs/ROADMAP.md`. As cópias só acrescentam ao que havia aqui: o cabeçalho, a situação da FEAT-03 e uma linha nova no histórico de cada arquivo. Nenhuma linha do backend se perdeu.

## Pendência
- O autor informou que validou manualmente o `GET /health` da FEAT-01, e o frontend também. Ainda assim, a seção FEAT-01 do contrato continua `implementado (BE)`.
- Só o frontend marca `validado`, então o registro deve partir de lá.

## Arquivos
- `docs/CONTRATO.md` e `docs/ROADMAP.md` (cópias do frontend)
- `docs/devlog/README.md`

## Ponte com o frontend
Pedir ao frontend que registre a FEAT-01 como `validado`.

## Commit sugerido
`docs/feat-03 validated by frontend`
