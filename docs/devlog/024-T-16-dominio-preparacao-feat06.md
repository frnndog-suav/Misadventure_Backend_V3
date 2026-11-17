# 024 — T-16 — Domínio da preparação (FEAT-06)

- **ID:** T-16 (FEAT-06) · **Data:** 2026-11-16 · **Status:** aguardando revisão
- **Spec:** v0.27 · **Contrato:** v0.24 (FEAT-06 `acordado`, sem mudança) · **ROADMAP:** v0.29

## Objetivo
O grupo nasce preparado dentro do `CreateParty` (README 10.1; REQ-31 a REQ-36, REQ-37 em memória): mapa montado pelo gerador (REQ-32, D-38), ordem por D20 (REQ-33), estado inicial do jogador (REQ-34), `playerClass` validado (REQ-35) e `DimensionInvalidError` (REQ-36, D-44).

## Decisões
- **D-58 (nova)**, com duas decisões do autor (2026-11-16):
  - `checkDimensionComposition({ dimension, zones })` cobre REQ-36, e o `ValidateDimension` já passa a Carta de Dimensão publicada. Isso adianta um pedaço da T-18.
  - **Ponte mínima** no infra, para o typecheck: o `campaign.module` injeta o `CardCatalog`, e o `DrizzlePartyMapper` já tem o schema Zod v2. Ficam na T-17: migração `0002`, presenter, filtro, e2e e `client.http`.
- Também na D-58: forma das setas na rotação 0, ordem de consumo do RNG (mapa → deck → ordem), empates, forma do `left` do `Party.create`, textos pt-BR de `problems` e carta do `starterDeck` ausente na trava.

## Passos e comandos
1. Funções puras em `src/domain/campaign/enterprise/`: `shuffle` (Fisher–Yates), `map-assembly` (`assembleMap`, `DIRECTIONS`), `turn-order` (`rollTurnOrder`), `starting-player` (`createStartingPlayer`).
2. `PartyMember.player` e `maxHealthOf`; `Party` com `dimension`/`turnOrder` e o `create` preparado; 4 eventos novos; `DimensionInvalidError`.
3. `CreatePartyUseCase` com o `CardCatalog`: busca a dimensão de menor `releaseOrder`, as zonas da coleção dela, a classe e as cartas do deck.
4. Fábricas: `makeFixtureContent` e `makePlayerState`; o `makeParty` e o repositório em memória ganham os campos novos.
5. Ponte no infra: mapper v2 e seu teste, `campaign.module`.
6. Revisão pelo `spec-reviewer`: **APROVADO**. Os 3 itens não bloqueantes foram corrigidos:
   - `localeCompare` trocado por comparação por código de caractere;
   - testes de `unknownClass` com outra classe;
   - teste de carta ausente na trava.
7. Comandos (PowerShell): `npm run format`, `node .claude/hooks/domain-guard.mjs --all`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

## Arquivos
- **Criados:**
  - `src/domain/campaign/enterprise/{shuffle,map-assembly,turn-order,starting-player}/index.ts`, mais os testes de `map-assembly`, `turn-order` e `starting-player`;
  - `src/domain/campaign/application/use-cases/_errors/dimension-invalid-error.ts`.
- **Alterados:**
  - `src/domain/campaign/enterprise/entities/{party,party-member}/index.ts` e o teste de `party`;
  - `events/party-events`;
  - `create-party/index{,.test}.ts`;
  - `src/domain/catalog/enterprise/dimension-composition/index{,.test}.ts`;
  - `validate-dimension/index{,.test}.ts`;
  - `src/infra/database/drizzle/mappers/drizzle-party-mapper{,.test}.ts`;
  - `src/infra/http/campaign.module.ts`;
  - `test/factories/{make-card,make-party}/index.ts`;
  - `test/repositories/in-memory-parties-repository.ts`;
  - `docs/SPEC-BACKEND.md`.

## Como verificar
`npx vitest related --run src/domain/campaign/enterprise/entities/party/index.ts` (pelo PowerShell). Rotas: só na T-17.

## Problemas
- **Vitest no Git Bash:** falha com "Cannot read properties of undefined (reading 'config')" quando chamado de `/d/...` (drive em minúsculas), inclusive na HEAD. Pelo PowerShell funciona.
- **TDD fora de ordem:** parte da implementação (gerador, ordem, jogador) foi escrita antes dos testes. Para compensar, conferi por mutação:
  - inverter "rotação aponta de volta" → 9 testes falham;
  - tirar o desempate → 2 testes falham.
- **E2e de `/parties`:** ficam vermelhos até a T-17 (`POST` exige `playerClass`, presenter sem os campos novos, saves v1 no banco). Não rodei os e2e (precisam do Docker).

## Checks
- `npm test`: 54 arquivos, 446 testes verdes.
- `typecheck`, `lint`, `format`, `build` e `domain-guard --all`: OK.

## Ponte com o frontend
Nenhuma ação agora. Os textos de `problems` vão ao contrato na `implementado (BE)` (T-18).

## Commit sugerido
`feat/match setup domain (map, turn order, starting player)`
