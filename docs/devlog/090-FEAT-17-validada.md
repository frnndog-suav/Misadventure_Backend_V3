# 090 — FEAT-17 validada

- **Data:** 2026-11-24
- **FEAT:** FEAT-17 (Ferreiro e Oficina do Artífice)
- **Situação:** concluída

## Objetivo

Fechar a FEAT-17 e a T-73 depois da validação integrada do frontend (T-79).

## O que aconteceu

- 1º retorno: o `replaced` do encantar vinha sem `active`. Foi corrigido no backend (D-139 h, devlog 089) e as campanhas foram geradas de novo.
- 2º retorno: as 7 campanhas bateram por HTTP. Foi gerado um 3º lote para a conferência das telas.
- 3º retorno: a `ferreiro-arcano` não tinha Minério para o extra da Runa da Guarda. Ela ganhou 2 Minérios e a semente `[0,0,0,14]` (1º D20 = 15).
- O frontend validou as telas com o MSW desligado e mandou o CONTRATO v0.87 (FEAT-17 `validado`) e o ROADMAP v0.80 (FEAT-17 `validado` nos dois lados).
- O cenário "Lote com falha e quebra" do contrato agora diz 5 operações, nenhuma `skipped`, como o e2e do backend já fazia (D-139 g).

## Arquivos

- `docs/CONTRATO.md` v0.87 e `docs/ROADMAP.md` v0.80: aplicadas as mudanças da cópia do frontend (título da FEAT-17, frase do cenário, versões e históricos). Depois de aplicadas, as cópias daqui ficaram iguais às do frontend.
- `src/infra/http/contract-version.ts`: 0.87.
- `docs/SPEC-BACKEND.md` v0.91: T-73 `[x]`.

## Como verificar

`curl http://localhost:3333/health` responde `contractVersion` 0.87 (o `start:dev` recarrega sozinho).

## Ponte com o frontend

Nada a levar: as versões vieram do frontend.

## Commit sugerido

`docs/close feat-17 validation (t-73)`
