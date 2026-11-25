# 092 — T-75 — Estado da montaria e save v11

- Data — 2026-11-25
- Status — aguardando revisão
- Spec — v0.95, T-75, REQ-157, REQ-163, D-146, D-148, D-150
- Contrato — v0.90, FEAT-18 `acordado` (sem mudança)
- Horas — registro automático

## Objetivo

Montaria no estado do jogador (`mount`), com efeitos e habilidades valendo como equipamento em uso (sem Pico), origens `mount`/`mountAbility`, `useAbility` com `mountAbility: true`, doação de carta `mount` no laboratório, ativação `loseMount` e save v11.

## Decisões (D-150)

- (a) `loseMount`: um `SentToLimbo` por entrada, na ordem montaria → inventário extra → pasta extra, em todos os caminhos (escolha do autor: cobrir também habilidades, gatilhos e evento). Os eventos saem antes do próximo evento do agregado. `SentToLimbo.from` ganha `mount`, `mountInventory`, `mountTcgFolder`.
- (b)/(d) Habilidade da montaria: `equipmentSlot: null`, `mountAbility: true` em `abilityStates` e `combatAbilityUsed`.
- (c) Equipamento no inventário extra é inerte.
- (e) Doação de `mount` com `quantity` > 1 → 409 `LAB_GRANT_NO_SPACE` `mountAlreadyOwned` (sem motivo novo no contrato).
- (f) Forma inválida do `useAbility` → `ACTION_INVALID` `mountAbility`/`invalidItem`.
- (g) Só a anulação geral de habilidades atinge a montaria.
- (h) Schemas v2 a v10 aceitam `mount: null`.

## Arquivos

- Domínio: `enterprise/mount` (novo), `party-member`, `party` (grant, useAbility, origens, limbo pendente), `party-action`, `combat` e `combat/abilities`, `activatable-effects`, `effective-modifiers`, `effect-activation`, `effect-payment`, `random-event`, `events/party-events`, `lab-grant`, casos de uso `grant-to-member` e `take-party-action`, erro `lab-grant-no-space-error`; catálogo: `value-objects/effect`, `effect-rules`.
- Infra: `content/effect-schemas.ts` (`loseMount`), `drizzle-party-mapper.ts` (v11, tipos nomeados para o TS7056), `party-presenter` (`MountState`, catálogo, modificadores).
- Docs: `docs/EFEITOS-CATALOGO.md` (linha `loseMount`).
- Testes novos: `party/mount.test.ts`, `party-action/mount-ability.test.ts`, `take-party-action/mount.test.ts`, `lose-mount.test.ts`, `mount-triggers.test.ts`, `party-presenter/mount.test.ts`, `drizzle-party-mapper.mount.test.ts`, e2e `index.mount` e `index.lose-mount`. Factory `makeWarPonyCard`; `makePlayerState` com `mount: null`.
- Testes ajustados pela spec: `schemaVersion` 10 → 11 (mapper e e2e), contagem de variações 172 → 173 (`loseMount`), `mount: null` no REQ-31, passivo da montaria calculado com o Pico.

## Como verificar

```
cd D:/Github/Misadventure_Backend_V3
npx vitest run
npm run test:e2e        # com o Postgres no ar
```

Atenção: o vitest só roda com `D:` maiúsculo no caminho.

## Checks (2026-11-25)

- `domain-guard --all` OK; `typecheck` OK; `build` OK; Prettier OK nos arquivos alterados.
- `npx vitest run`: 132 arquivos, 1721 testes. `npm run test:e2e`: 313 testes.
- `lint`: 73 erros só em `test/prepare-feat-13.cjs` e `test/prepare-feat-14.cjs` (preexistentes).
- Revisão do spec-reviewer: pediu testes das origens, do gatilho com `loseMount` e uma correção de contrato (motivo da doação); atendidos (D-150 e revista).

## Ponte com o frontend

Nenhuma ação agora; o aviso vai na `implementado (BE)` da FEAT-18 (T-80).

## Commit sugerido

`feat/add player mount state, mount abilities, lose mount and save v11 (t-75)`
