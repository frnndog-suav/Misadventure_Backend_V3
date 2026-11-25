# 095 — T-78 — Movimentar com montaria

- Data — 2026-11-25
- Status — aguardando revisão
- Spec — v0.99, T-78, REQ-161, D-145, D-153
- Contrato — v0.91 (sem mudança; FEAT-18 `moveRoutes`, `MoveAction.viaZoneId`)
- Horas — registro automático

## Objetivo

Com montaria, `move` alcança zonas a 2 travessias por 1 PA, com `viaZoneId` opcional (sem ele, a primeira zona do meio por `id`). A projeção traz `moveTargets` ampliado e `moveRoutes` com `direct` e `via`; `PlayerMoved` ganha `viaZoneId`.

## Decisões (D-153)

- (a) `moveRoutes(map, zoneId, withMount)` em `connected-zones`; `moveTargets` = seus `zoneId`.
- (b) Ordem das validações: sessão → `zoneId` no mapa → `viaZoneId` no mapa (400) → PA → `noMount` → `notConnected`.
- (c) `viaZoneId` válido com destino a 1 travessia é aceito; sem `viaZoneId`, 1 travessia é simples (`null`).
- (d) Sem e2e HTTP novo: o cenário do contrato precisa de montaria e mapa de dois caminhos (T-80).

## Arquivos

- Domínio: `enterprise/connected-zones` (`moveRoutes`), `entities/party` (`move` com `viaZoneId`), `events/party-events` (`viaZoneId`), `party-action` (parse e tipo), caso de uso `take-party-action` (erros).
- Infra: `party-presenter` (`moveTargets`, `moveRoutes`).
- Testes novos: `connected-zones` (`moveRoutes`), `party/move-mount.test.ts`, parse em `party-action`, casos em `take-party-action` e `party-presenter/mount.test.ts`.

## Como verificar

```
cd /d/Github/Misadventure_Backend_V3
npx vitest run
```

No Git Bash o vitest falhou com `Cannot read properties of undefined (reading 'config')` (também em testes não alterados); no PowerShell roda normal.

## Checks (2026-11-25)

- `domain-guard --all` OK; `typecheck` OK; Prettier nos arquivos alterados.
- `npx vitest run` (PowerShell): 136 arquivos, 1788 testes verdes.
- `lint`: só os erros preexistentes de `test/prepare-feat-13.cjs` e `test/prepare-feat-14.cjs`.

## Ponte com o frontend

Nenhuma ação agora; o aviso completo vai na `implementado (BE)` da FEAT-18 (T-80).

## Commit sugerido

`feat/add mount movement with via zone (t-78)`
