# 096 — T-79 — Montaria como recompensa

- Data — 2026-11-25
- Status — aguardando revisão
- Spec — v1.00, T-79, REQ-162, D-154
- Contrato — v0.91 (sem mudança; FEAT-18 "Montaria ganha com montaria em uso", FEAT-12/15 aceitam `mount`)
- Horas — registro automático

## Objetivo

Recompensas (deck de recompensas, `grantReward`/`searchReward` de eventos, recompensas de missão) aceitam carta `mount`. Sem montaria → vira a montaria, vazia, sem escolha. Com montaria → volta ao fundo do deck de origem ou, se fixa, vai ao limbo. Nunca gera `PendingReward`.

## Decisões (D-154)

- (a) Montaria recebida: `lastRewardDelivery` `disposition: 'kept'`, `space: null`.
- (b) Fixa com montaria: `SentToLimbo` `from: 'mount'` pelo `limboSink` já usado pela `loseMount`; do deck: fundo do deck, sem evento.
- (c) `isRewardCard` aceita `mount` (integridade e proteção em substituir/importar); texto de `notARewardCard` cita a montaria.
- (d) Sem e2e HTTP novo; cobertura unitária (T-80 prepara a campanha).

## Arquivos

- Domínio: `catalog-integrity` (`isRewardCard`), `entities/party` (`deliverMountReward` em `resolveOutcomeSteps`).
- Infra: `content/content-messages.ts` (texto de `notARewardCard`).
- Testes: `take-party-action/random-event.test.ts` (bloco T-79), `catalog-integrity/index.test.ts` (2 casos REQ-162).

## Como verificar

```
cd /d/Github/Misadventure_Backend_V3
npx vitest run src/domain/catalog src/domain/campaign src/infra/content
```

## Checks (2026-11-25)

- `domain-guard --all` OK; `typecheck` OK; `npm run format`.
- Vitest (catalog, campaign, infra/content): 113 arquivos, 1574 testes verdes.
- `lint`: só os 73 erros preexistentes de `test/prepare-feat-13.cjs` e `test/prepare-feat-14.cjs` (iguais sem a mudança).

## Ponte com o frontend

Nenhuma ação agora; o aviso vai na `implementado (BE)` da FEAT-18 (T-80).

## Commit sugerido

`feat/add mount as reward (t-79)`
