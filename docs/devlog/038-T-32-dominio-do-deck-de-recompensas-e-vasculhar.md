# 038 — T-32 — Domínio do deck de recompensas e do Vasculhar (FEAT-32)

**Data:** 2026-11-18 · **Spec:** v0.46 · **Contrato:** v0.46 (FEAT-32 `acordado`, sem mudança)

## Objetivo
Implementar no domínio REQ-89 a REQ-92 e REQ-96, mais o restante de REQ-93 e REQ-94: decks de recompensas montados na criação, alvos do Vasculhar, `Party.scavenge`, `lastScavenge`, parser, `availableActions` e o "em uso".

## Decisões
- **D-93** (spec): a partida guarda `rewardDecks` (`{ zoneType, cards }`, topo = índice 0), embaralhados **depois** da ordem dos jogadores, para os sorteios de REQ-31 a REQ-35 não mudarem. `scavengeTargets` é uma função pura e só conta itens `tool` do inventário. `inventoryFull` é conferido antes de olhar o deck, para a recusa não revelar o que há nele. Um save sem deck é aceito com `found: false` e não usa o RNG. `availableActions` ganhou um 5º parâmetro. O mapper v6 foi adiantado com os campos opcionais.
- Nenhuma ambiguidade levada ao autor. O ponto aberto (`inventoryFull` sem achado) foi decidido pela letra de REQ-92 e registrado em D-93 (c).

## Passos e comandos
1. Testes primeiro (red): `scavenge/index.test.ts`, `entities/party/scavenge.test.ts`, `party-action/scavenge.test.ts`, `available-actions/index.test.ts` (bloco REQ-93), `take-party-action/scavenge.test.ts`.
2. Implementação (green), nos arquivos abaixo.
3. Ajuste de `drizzle-party-mapper.test.ts`: o helper `legacyRow` remove `lastScavenge` e `rewardDecks` (saves v2 a v5 não os tinham), e o state v6 esperado ganha `rewardDecks: []`.
4. Checks (no **PowerShell**): `npm run format`, `npm run typecheck`, `npx vitest run`, `npm run lint`, `npm run format:check`, `npm run build`, `node .claude/hooks/domain-guard.mjs --all`.
5. Revisão pelo `spec-reviewer`: APROVADO. Em seguida acrescentei os testes de `noActionPoints` no caso de uso e de `lastScavenge` preservado após uma recusa.

## Arquivos
- Novos: `src/domain/campaign/enterprise/scavenge/{index,index.test}.ts`, `entities/party/scavenge.test.ts`, `party-action/scavenge.test.ts`, `take-party-action/scavenge.test.ts`.
- Alterados: `entities/party/index.ts`, `entities/party-member/index.ts`, `events/party-events/index.ts`, `party-action/index.ts`, `available-actions/index.ts` (e teste), `starting-player/index.ts`, `take-party-action/index.ts`, `_errors/action-not-allowed-error.ts`, `infra/database/drizzle/mappers/drizzle-party-mapper.ts` (e teste), `test/factories/make-party/index.ts`, `test/repositories/in-memory-parties-repository.ts`, `docs/SPEC-BACKEND.md`.

## Como verificar
`npx vitest run src/domain/campaign` no PowerShell. Sem rota nova: o HTTP fica para a T-33.

## Problemas
- No Git Bash, o Vitest 5.1 falha antes de rodar qualquer teste (`Cannot read properties of undefined (reading 'config')`), inclusive nos que já existiam. No PowerShell funciona. Use o PowerShell para rodar os testes.

## Checks
890 testes unitários verdes, 85 arquivos. Typecheck, lint, format:check, build e domain-guard OK.

## Ponte com o frontend
Nenhuma nesta etapa. O AVISO DE FRONTEND vem na T-33, junto do `implementado (BE)`.

## Commit sugerido
`feat/feat-32 reward decks and scavenge domain (t-32, spec v0.46)`
