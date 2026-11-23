# 080 — T-65 — Abrir booster

- Data — 2026-11-23
- Status — aguardando revisão
- Spec — v0.79 (REQ-144, D-122; nova D-128)
- Contrato — v0.80, FEAT-16 `acordado` (sem mudança)
- Horas — registro automático

## Objetivo

Quinta tarefa da FEAT-16. `openBooster` no Preparar (gratuito) e no Usar cofre (1 PA, no lote): sorteio de `boosterCardCount` cartas com slot garantido, divisão pasta/inventário, entrega pendente com fonte `booster` e origem `fixed`, `lastBoosterOpening` e embalagem no limbo. Fica para a T-66 a validação integrada.

## Decisões (D-128 na spec)

- Módulo puro novo `booster`: `drawBoosterCards` (sorteio), `placeBoosterInPrepare` (entrega do Preparar) e `boosterCandidatesOf` (mesmo filtro da vitrine, REQ-138, na coleção do booster).
- Sorteio por carta: raridade pelas chances; sem elegíveis → refaz só entre as que têm; a última carta é o slot garantido (Incomum em diante; sem elegíveis ali, vale como slot comum). Soma de chances 0 → uniforme.
- Recusas na ordem do contrato: `notInInventory`/`notInVault` → `notBooster` → `tcgFolderFull`/`vaultFull` → `boosterEmpty`. `vaultFull` conta os slots livres antes de tirar a embalagem.
- O que não cabe no inventário já fica `pending` em `lastBoosterOpening`; a 1ª abre o `pendingReward` e as demais ficam na fila persistida `boosterQueue`, uma por `resolveReward`.
- Usar cofre simula o lote com o RNG do grupo, que só avança no sucesso.
- Sem evento de domínio novo (o contrato não lista); a embalagem gera `SentToLimbo`.

## Arquivos

- Criados (domínio): `enterprise/booster/index.ts` e `index.test.ts`.
- Alterados (domínio): `party-action` (operação e parser), `vault` (operação, `rng`, `lastBoosterOpening`), `entities/party` (`prepare`, `useVault`, `boosterQueue`, `resolveReward`), `entities/party-member`, `rewards` (fonte `booster`), `available-actions` (`prepare` com booster), `take-party-action` (catálogo da coleção, motivos), `_errors/action-not-allowed-error`.
- Alterados (infra): `drizzle-party-mapper` (schema de `lastBoosterOpening`, fonte `booster`, `boosterQueue`), `party-presenter` (`lastBoosterOpening`, `boosterCardIds`).
- Testes: `entities/party/open-booster.test.ts`, `party-action/open-booster.test.ts`, `take-party-action/open-booster.test.ts`, `drizzle-party-mapper.test.ts`, `test/repositories/in-memory-parties-repository.ts` (copia `boosterQueue`), e2e `index.market.controller.e2e-spec.ts` (3 casos) e `create-party` (`lastBoosterOpening: null`).

## Como verificar

```bash
cd /d/Github/Misadventure_Backend_V3
unset CONTENT_DIR
npm test
docker compose up -d postgres   # o autor
npm run test:e2e
```

Unitários: 112 arquivos, 1525 testes verdes. E2e a rodar pelo autor (precisa do Docker).

## Problemas

- Vitest não roda pelo Git Bash neste ambiente; rodou pelo PowerShell.
- O repositório em memória copiava o agregado campo a campo e perdeu `boosterQueue`; ajustado no fake.
- A coleção de teste não pode ter poção entre as elegíveis (consumível entra no filtro da REQ-138); os fixtures usam só atributo ou só equipamento.

## Checks

`domain-guard` OK; `typecheck` OK; `build` OK; `format:check` OK; lint só com os erros pré-existentes de `test/prepare-feat-13.cjs` e `prepare-feat-14.cjs`.

## Ponte com o frontend

Nenhum aviso: sem mudança de contrato. FEAT-16 ainda não está `implementado (BE)`; falta a T-66.

## Commit sugerido

`feat/add booster opening (t-65)`
