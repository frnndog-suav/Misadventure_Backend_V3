# 055 — T-46 — Estado de combate e dano

- Data — 2026-11-20
- Status — aguardando revisão
- Spec — v0.62
- Contrato — v0.62, acordado
- Horas — a preencher pelo autor

## Objetivo

Implementar a entrada de combate, a ordem de turnos, a seleção de alvos e os cálculos puros de dano.

## Decisões

- REQ-118 orienta os cenários de revelação pela compra e pelo descarte, identidade de cópias, alvos e ordem por Celeridade entre ciclos.
- REQ-120 e README §19.2 orientam os cálculos de Poder, Exaustão, acerto, Área, Perfuração, elemento, Reflexão e dano de efeito.
- O ID do combate deriva do encontro reservado, e os IDs das cópias e dos turnos derivam desse ID e das posições do combate. Ataques usam o RNG semeado do save.
- A entrada e as ações de combate ficam desabilitadas na composição HTTP até a T-49, pois o mapper atual ainda não grava esse estado. A T-47 liga habilidades, efeitos, IA e gatilhos aos cálculos. A T-48 aplica os desfechos.

## Arquivos

- `src/domain/campaign/application/use-cases/take-party-action/random-event.test.ts` — revelação, identidade das cópias e turno com 0 PA.
- `src/domain/campaign/enterprise/combat/combat.test.ts` — ordem entre ciclos e cálculos puros.
- `src/domain/campaign/enterprise/combat/index.ts` — estado, cópias, turnos, ataques básicos e cálculo de dano.
- `src/domain/campaign/enterprise/effective-modifiers/index.ts` — Poder e Exaustão no pipeline existente.
- `src/domain/campaign/enterprise/entities/party/index.ts`, `available-actions/index.ts` e `party-action/index.ts` — revelação, ações gratuitas, elegibilidade, alvos e bloqueios.
- Casos de uso `take-party-action` e `end-session` e erro `action-not-allowed-error.ts` — despacho e recusas.
- `src/infra/http/campaign.module.ts` e `src/infra/http/presenters/party-presenter/index.ts` — habilitação adiada até a persistência da T-49.

## Como verificar

```powershell
npm.cmd exec -- vitest run src/domain/campaign/application/use-cases/take-party-action/random-event.test.ts src/domain/campaign/enterprise/combat/combat.test.ts
```

Após a implementação, esperam-se 28 testes passando. Ambas as origens do deck devem abrir o combate com duas cópias distintas. Com 0 PA, passar avança ao segundo ciclo e atacar tira 4 PV da cópia escolhida. Alvo inexistente e turno obsoleto preservam RNG e gravação. No caso de borda de Área com Precisão zero, o golpe deve atingir ambos os alvos sem consumir rolagens e limitar a Reflexão ao dano calculado de cada alvo.

## Checks e pendências

- Antes da implementação, o autor confirmou 20 testes passando, duas revelações recusadas com `eventDeckEmpty` e falha ao importar o módulo `combat` ainda ausente.
- Após a implementação, `npm.cmd run typecheck` e `git diff --check` passaram. A execução dos testes pelo autor está pendente.

## Commit sugerido

`feat/implement combat turns and damage (t-46)`
