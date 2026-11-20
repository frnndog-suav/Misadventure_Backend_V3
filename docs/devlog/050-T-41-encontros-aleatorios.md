# 050 — T-41 — Domínio e ações do encontro

- **Data** — 2026-11-20
- **Status** — concluída
- **Spec** — v0.58, REQ-111 a REQ-114
- **Contrato** — v0.57, acordado
- **Horas** — a preencher pelo autor

## Objetivo

Verificar as ações de encontro pelo caso de uso antes de implementar as regras.

## Arquivos

- `src/domain/campaign/application/use-cases/take-party-action/random-event.test.ts` reúne cenários de antecipação, revelação, reciclagem, pagamentos por cópia, ativação, checagem final, desistência, reposição, fuga e dívida de PA.
- `src/domain/campaign/enterprise/random-event`, o agregado `Party`, o parser e o caso de uso implementam as ações, o progresso dos requisitos e os recibos. O agregado simula o último pagamento e o RNG, confirma os mínimos e só então grava o estado.
- O módulo HTTP mantém essas ações desabilitadas até a T-43. A T-42 retoma passos de recompensa a partir do índice guardado no desfecho. O relógio multiplayer segue na FEAT-26.

## Como verificar

```powershell
npm.cmd test -- src/domain/campaign/application/use-cases/take-party-action/random-event.test.ts
```

A rodada atual deve passar os 14 casos. No caso de borda de deck só de combate, espera-se `eventDeckEmpty` com PA preservado. Na recusa da última parte aleatória, mão, recibos e RNG permanecem iguais após repetir o pedido. Fuga automática usa uma permissão explícita no estado de teste e conserva o RNG. O catálogo atual só traz fontes dos modificadores de fuga, sem uma carta que conceda essa permissão.

## Checks e retomada

- O autor confirmou 13 falhas na rodada inicial com `ACTION_INVALID` e `type: unknownAction`.
- Typecheck, ESLint nos arquivos afetados e `git diff --check` passaram.
- O autor confirmou a aprovação da rodada unitária após a implementação e registrou a entrega no commit `86edbdb`. A persistência em banco e os cenários HTTP ficam na T-43.
- A T-42 retoma deste ponto com recompensas pendentes, reserva, destinos de manter/deixar e recibos de Vasculhar.

## Commit sugerido

`feat/resolve random event encounters (t-41)`
