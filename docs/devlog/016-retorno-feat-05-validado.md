# 016 — Retorno do frontend — FEAT-05 `validado`

- **ID:** retorno (FEAT-05) · **Data:** 2026-11-15 · **Status:** concluída
- **Spec:** v0.19 · **Contrato:** v0.17 · **Roadmap:** v0.21

## Objetivo
Aplicar as cópias de `docs/CONTRATO.md` (v0.17) e `docs/ROADMAP.md` (v0.21) que o frontend gerou ao validar a FEAT-05 contra o backend real.

## O que veio
- **ROADMAP v0.20 (FE):** lado FE da FEAT-05 `pronto` com MSW. O backend ficou no ar em `http://localhost:3333`, com `LAB_ENABLED=true`, para conferir as telas.
- **CONTRATO v0.17 (FE):** seção FEAT-05 `validado`. Os 7 cenários passaram com `curl`, e as telas `/`, `/novo` e `/grupo/:partyId` passaram com o MSW desligado. Não há mudança de formato.
- **ROADMAP v0.21 (FE):** FEAT-05 `validado` nas duas colunas. A FEAT está concluída.

## Conferência
`git diff docs/CONTRATO.md docs/ROADMAP.md`. As cópias só acrescentam ao que havia aqui: o cabeçalho de versão, a situação da FEAT-05 e as linhas novas no histórico de cada arquivo. Nenhuma linha do backend se perdeu.

## Alterações aqui
- `CONTRACT_VERSION` foi de `0.16` para `0.17`, seguindo o precedente da FEAT-04. O `GET /health` passa a informar `0.17`.
- Devlog 015 (T-13) passou de "aguardando revisão" para "concluída", porque a validação cobre a T-13.

## Arquivos
`docs/CONTRATO.md`, `docs/ROADMAP.md` (cópias do frontend), `src/infra/http/contract-version.ts`, `docs/devlog/015-T-13-rotas-campanha.md`, `docs/devlog/README.md`.

## Commit sugerido
`docs/feat-05 validated and contract v0.17`
