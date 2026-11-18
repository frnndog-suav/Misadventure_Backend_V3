# 039 — T-33 — Save v6, rotas e e2e da FEAT-32

- **Data:** 2026-11-18
- **Status:** aguardando revisão
- **Spec:** v0.47 (D-94) · **Contrato:** v0.47 (FEAT-32 `implementado (BE)`) · **Roadmap:** v0.51

## Objetivo
Levar REQ-80 a REQ-96 (cofre, limbo, deck de recompensas, Vasculhar) até a API: presenter, save v6 testado, e2e de cada cenário do contrato.

## Decisões (D-94)
- `findPartyCards` lê também a zona de cada membro, a Carta de Dimensão e as cartas do `rewardDecks`; o presenter usa `scavengeTargets` (função pura do domínio) e passa `zoneActions`/alvos a `availableActions`.
- Com grupo vivo, carta do deck de recompensas → `CONTENT_IN_USE` (vem antes de `CONTENT_REFERENCED`). O cenário do contrato foi esclarecido na v0.47 ("sem nenhum grupo").
- Mapper estrito por versão: os e2e que simulam saves v2 a v5 passaram a remover `lastScavenge` e `rewardDecks`, como nos saves reais.

## Passos
1. `src/infra/http/presenters/party-presenter/index.ts`: campos `vault`, `vaultCapacity`, `vaultDeckSlots`, `vaultGoldCapacity`, `scavengeTargets`, `lastScavenge`; leitura de zona/dimensão/cartas.
2. `drizzle-party-mapper.test.ts`: v5 lido com `lastScavenge: null` e sem decks; ida e volta de `rewardDecks` (ordem) e `lastScavenge`.
3. Novo `take-party-action/index.vault.controller.e2e-spec.ts` (14 testes, um por REQ ou cenário).
4. Cenários antigos atualizados conforme o CONTRATO v0.46: `useVault` na cidade em `availableActions` (create-party, take-party-action, prepare); campos novos no REQ-31.
5. `client.http`: requisições da FEAT-32.
6. `src/infra/http/contract-version.ts`: `0.43` → `0.47` (estava atrasado).
7. `npx drizzle-kit generate` → "No schema changes" (sem migração, D-31).

## Problemas
- No Git Bash, `vitest` falha em massa (`Cannot read properties of undefined (reading 'config')`) por causa da caixa da letra do drive (`/d/` vs `d:\`). Rodar pelo PowerShell.
- A T-32 adiantou campos no save sem ajustar os e2e de saves antigos (só rodou unitários); corrigido aqui.

## Checks (2026-11-18)
guarda ✅ · typecheck ✅ · lint ✅ · format ✅ · unitários 891/891 ✅ · e2e 206/206 ✅ · build ✅

## Ponte com o frontend
AVISO DE FRONTEND — FEAT-32: levar CONTRATO v0.47 e ROADMAP v0.51; validar contra o backend real.

## Commit sugerido
`feat/feat-32 vault and scavenge end to end (t-33, spec v0.47, contract v0.47)`
