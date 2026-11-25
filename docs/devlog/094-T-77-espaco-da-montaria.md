# 094 — T-77 — Espaço da montaria e transferência

- Data — 2026-11-25
- Status — aguardando e2e (Postgres) e revisão
- Spec — v0.97, T-77, REQ-159, REQ-160, D-143, D-144, D-148, D-152
- Contrato — v0.91 (FEAT-18: `destination` no resultado do `craft`; esclarecimentos de `PendingReward.destination` e `discard[].space`)
- Horas — registro automático

## Objetivo

Com montaria, toda chegada (compra de estoque, booster e single; booster aberto na Preparar; recompensa; doação; Vasculhar; Criar) vai primeiro ao inventário/pasta e o resto ao inventário extra/pasta extra. Regras de espaço somadas (booster, J1), Ajustar deck com a pasta extra, `transferMount` gratuita na Preparar, `ReceiveSpace` nas saídas e descarte da recompensa pendente por espaço.

## Decisões (D-152)

- (a) Escolha do autor: Criar também transborda e o resultado ganha `destination` (contrato v0.91).
- (b) Empilháveis entram inteiros num espaço; o resto enche principal → montaria.
- (c) `PendingReward.destination` = espaço principal; o real em `lastRewardDelivery.space`.
- (d) `discard[].space` opcional; espaço fora → 400 `unknownOption`; cópias a mais → `rewardDoesNotFit`.
- (e) J1: só o escudo transborda. (f) Ajustar deck em ordem de `cardId`. (g) `transferMount` sem evento. (h) Saves: campos novos opcionais na leitura, sem versão nova.

## Arquivos

- Domínio: `enterprise/mount` (`receiveResource`, `receiveAttribute`, `receiveCard`, `receiveCapacitiesOf`, `freeFolderCopies`, `holdingsIn`, `adjustFolders`, `transferMount`), `party` (grant, recompensas, Vasculhar, booster, equip J1, Ajustar deck, `transferMount`), `market-trade` (compras, vitrine), `booster`, `blacksmith` (craft), `rewards`, `party-action` (`transferMount`, `discard[].space`), `party-member` (`lastScavenge.delivery`), caso de uso `take-party-action`.
- Infra: `drizzle-party-mapper.ts` (campos opcionais, `upgradePendingReward`), `party-presenter` (dedução dos saves antigos).
- Testes novos: `mount/index.test.ts`, `party/mount-space.test.ts`, e2e `index.mount-space`, caso D-152 no teste do mapper.; casos novos em `blacksmith`, `market-trade`, `scavenge` e `party-presenter/mount`.
- Testes ajustados pela spec: `received` em `buyStock` (2) e `destination` no `craft` (1); `space` nas `discardOptions` do mapper.

## Como verificar

```
cd /d/Github/Misadventure_Backend_V3
npx vitest run
npm run test:e2e        # com o Postgres no ar
```

## Checks (2026-11-25)

- `domain-guard --all` OK; `typecheck` OK; Prettier nos arquivos alterados.
- `npx vitest run`: 135 arquivos, 1761 testes verdes (depois da revisão: craft, buySingle/buyBooster, Vasculhar, recusas da transferência e presenter de saves antigos).
- `lint`: só os erros preexistentes de `test/prepare-feat-13.cjs` e `test/prepare-feat-14.cjs`.
- e2e: pendente (Postgres fora do ar).

## Ponte com o frontend

Contrato v0.91 (campo `destination` no `craft`). O aviso completo vai na `implementado (BE)` da FEAT-18 (T-80); o autor pode levar a v0.91 já.

## Commit sugerido

`feat/add mount space overflow and transfer (t-77)`

## Revisão (spec-reviewer, 2026-11-25)

Pediu testes de cada chegada com o espaço principal cheio, recusas restantes da transferência e o presenter de saves antigos (atendidos); REQ-159 alinhada à D-152 c; histórico v0.91 do contrato registra `rewardDoesNotFit` e que `PendingReward.destination` aguarda aceite do frontend.
