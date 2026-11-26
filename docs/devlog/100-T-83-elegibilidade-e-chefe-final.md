# 100 — T-83 — Elegibilidade e chefe final

- Data — 2026-11-26
- Status — concluída
- Spec — v1.05, REQ-165, REQ-167 e REQ-168
- Contrato — v0.96, FEAT-19 `acordado`
- Horas — a preencher pelo autor

## Implementação

- `party-action`, `TakePartyActionUseCase` e `ActionNotAllowedError` — parser, despacho e motivos de recusa de `completeDimension`.
- `Party`, `available-actions` e `PartyPresenter` — validação compartilhada e projeção antes de `endTurn`. O chefe usa o fluxo de combate, com a carta projetada da dimensão e sem entrada no deck de eventos. As recusas antecedem o gasto de PA e a geração do ID do combate.
- `combat` e `DrizzlePartyMapper` — marcador `finalBoss` no combate, na continuação de entrada e no resultado. Marcador ausente é projetado como `false`. O snapshot aceita os textos vazios da carta sintética.
- A vitória aplica `bossPeakGain` por inimigo `boss`, inclusive em eventos. Os demais resultados do chefe seguem as regras de combate e preservam os itens de conclusão.

## Verificação

O autor confirmou 10 falhas esperadas e 58 casos aprovados antes da implementação. Os testes em `random-event.test.ts`, `completion.test.ts` e `drizzle-party-mapper.test.ts` verificam recusas, requisito dividido entre membros, projeção, Sem fuga, fuga, derrota, limite de ciclos, vitória, Pico configurável e reabertura. O autor confirmou a aprovação das três suítes unitárias após a implementação.

TypeScript e ESLint passaram. O agregado usa as portas existentes para horário e IDs e mantém o RNG do combate no fluxo semeado.

## Pendências

- A T-84 liga a ação sem chefe e a vitória ao desfecho comum, com prêmio, Pico de conclusão e passagem. Nesta etapa, a ação sem chefe valida e cobra o PA.
- A validação integrada da FEAT-19 permanece na T-86.

## Commit de implementação

`1dd9b94 feat/add dimension eligibility and final boss combat (t-83)`
