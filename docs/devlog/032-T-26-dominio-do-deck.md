# 032 — T-26 — Domínio do deck (FEAT-09)

- **ID:** T-26 · **Data:** 2026-11-17 · **Status:** aguardando revisão
- **Spec:** v0.37 · **Contrato:** v0.36 (FEAT-09 `acordado`) · **Roadmap:** v0.41

## Objetivo
REQ-60 a REQ-67 no domínio (REQ-68 em memória): chaves novas da `GameConfig`, limite de cópias no deck pré-pronto, pasta de TCG no `PlayerState`, ações Recuperar e Ajustar deck.

## Decisões
- D-67 a D-71 passaram de propostas para decididas. A assinatura final é `Party.adjustDeck(build, { cards, classes }, at)`: o caso de uso lê no `CardCatalog` as cartas da build e da pasta e as classes do jogador (`findDeckCatalog`).
- D-72 (nova) registra:
  - o deck vem na frente ao embaralhar no `shuffleHand` e no `shuffleDiscard`;
  - a build e a pasta ficam em ordem de `cardId`, comparadas por `<`;
  - o sorteio da preparação continua expandindo na ordem do `starterDeck`, então as sementes antigas não mudam;
  - os modificadores seguem a 1ª classe;
  - carta ou classe ausente do catálogo fica sem limite de cópias e mantém a trava;
  - risco: `contentInUse` ignora a pasta (FEATs 10, 12 e 16).
- `starterDeckCopyLimit` só vale para classe publicada, como o tamanho e a trava (D-57b).
- **Adiantado da T-27**, para o código compilar sem perder a pasta:
  - mapper Drizzle v4, que lê v3 e v2 com `tcgFolder = []`, as chaves novas nos padrões e a build ordenada;
  - texto pt-BR de `starterDeckCopyLimit` em `content-messages.ts`;
  - `CardCatalog` injetado no `TakePartyActionUseCase` (`campaign.module.ts`).
- Testes antigos alinhados à spec, e não a um bug: `availableActions` (REQ-67), defaults da config (REQ-04 + REQ-60) e o teste do mapper, que passa para `schemaVersion` 4 com o v2 montado como v2 de verdade.

## Passos e comandos
1. Escrevi os testes primeiro. `npx vitest run src/domain` deu 69 falhas pelo motivo certo.
2. Implementei: `defaults.ts`, `catalog-integrity`, `party-member`, `starting-player` (`sortedByCardId`, `defaultModifiers` exportados), `party-action` (parser), `party-events`, `Party.recover`/`adjustDeck`, `available-actions`, `ActionNotAllowedError` (com `cardId`) e o caso de uso.
3. Ajustes do spec-reviewer: teste da precedência `notOwned` → `copyLimitExceeded` e teste de ida e volta no repositório em memória (REQ-68).
4. Checks: `npm run format`, `npx tsc --noEmit -p tsconfig.json`, `npm run lint`, `node .claude/hooks/domain-guard.mjs --all`, `npx vitest run`.

## Problemas
- O Vitest só roda pelo **PowerShell**. No Git Bash dá `Cannot read properties of undefined (reading 'config')`, e isso já acontece no HEAD.
- `.vitest/json/output.json` é rastreado. Um `--reporter=json` o sobrescreve: restaure com `git checkout -- .vitest/json/output.json`.
- Os e2e não rodaram (precisam do Docker). Espera-se falha em `get-lab-config` e `update-lab-config` (listam a config exata, sem as chaves de REQ-60) até a T-27.

## Arquivos
**Novos:** `docs/devlog/032-T-26-dominio-do-deck.md`.
**Alterados:**
- domínio: `src/domain/lab/enterprise/value-objects/game-config/{defaults.ts,index.test.ts}`, `src/domain/catalog/enterprise/catalog-integrity/{index.ts,index.test.ts}`, `src/domain/campaign/enterprise/{entities/party,entities/party-member,starting-player,party-action,events/party-events,available-actions}/*`, `src/domain/campaign/application/use-cases/{take-party-action/*,_errors/action-not-allowed-error.ts}`;
- infra: `src/infra/content/content-messages.ts`, `src/infra/database/drizzle/mappers/drizzle-party-mapper{.ts,.test.ts}`, `src/infra/http/campaign.module.ts`;
- testes: `test/factories/make-party/index.ts`;
- docs: `docs/SPEC-BACKEND.md`, `docs/devlog/{README.md,tempo.html}`.

## Como verificar
`npx vitest run` (PowerShell): 70 arquivos, 678 testes.

## Checks
format, lint, typecheck e domain-guard limpos; unitários verdes. E2E pendentes (T-27).

## Ponte com o frontend
Nenhuma nesta etapa: o contrato v0.36 já está `acordado`. O aviso vem na T-27.

## Commit sugerido
`feat/feat-09 deck domain`
