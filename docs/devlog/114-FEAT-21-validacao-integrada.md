# 114 — Fechamento da validação integrada da FEAT-21

- Data — 2026-11-27
- Status — concluída
- Spec — v1.15
- Contrato — v1.15
- Horas — a preencher pelo autor

## Evidência e resultados

Conferido o arquivo `docs/devlog/145-t-108-validacao-integrada-feat-21.md` no commit `88975b5` do frontend. Os seis cenários da T-108 passaram em Chromium contra a API real, com MSW desligado e sem divergências. O `GET /health` respondeu 200 e anunciou a interface `1.13`.

| Operação no save reservado | Duração | Acontecimentos |
| --- | ---: | ---: |
| Abertura | 488,4 ms | 151 |
| `endTurn` | 559,8 ms | 87 |

Cada operação processou cinco ajudantes distintos e devolveu a vez a Lia. O GET final confirmou a rodada 2, 3 pontos de ação e a revisão 13.

## Arquivos e sincronização

- `docs/CONTRATO.md` v1.15 registra a FEAT-21 como `validado`.
- `docs/ROADMAP.md` v1.01 registra `validado` nas duas colunas da FEAT-21.
- Os dois arquivos completos seguem para sincronização no frontend. A validação integrada está concluída.

Commit sugerido — `docs/validate feat-21 (t-108)`
