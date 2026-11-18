# 037 — T-31 — Domínio do cofre e do limbo (FEAT-32)

- **ID:** T-31 · **Data:** 2026-11-18 · **Status:** aguardando revisão
- **Spec:** v0.45 · **Contrato:** v0.46 (FEAT-32 `acordado`) · **Roadmap:** sem mudança

## Objetivo
REQ-80, REQ-83 a REQ-88 e, na parte do cofre, REQ-93 e REQ-94: chaves de config do cofre, `vault` no estado do jogador, `Party.useVault` com as operações (guardar, retirar, ouro, descartar para o limbo, decks guardados, trocar/editar a build), parser da ação, eventos, `availableActions` e o caso de uso lendo o catálogo.

## Decisões
- **D-92 (nova):**
  - A simulação em ordem fica numa função pura, `applyVaultOperations` (`src/domain/campaign/enterprise/vault`); `Party.useVault` cuida de sessão, pontos, zona, RNG e eventos.
  - As ações da zona vêm do caso de uso, pela carta da zona no catálogo. `availableActions` ganhou `zoneActions` (4º parâmetro, padrão `[]`); o presenter só passa a zona na T-33.
  - Ordem das checagens dentro de cada operação, `editBuild` (pool sem a pasta), `saveDeck` com lista vazia aceito: ver D-92 na spec.
  - O passo "refazer o deck" (README 4.4) foi extraído do `adjustDeck` para `rebuildPlayerDeck`, sem mudar o comportamento (os testes do Ajustar deck seguem verdes sem edição).
- **Mapper v6 adiantado:** como `TPlayerState.vault` é obrigatório, o mapper já grava o save v6 com `vault` e as chaves de REQ-80 (lê v5 a v2 com cofre vazio e padrões). A T-33 acrescenta `lastScavenge` ao mesmo v6.

## Passos e comandos
1. Testes primeiro (red): `game-config/index.test.ts` (REQ-80), `party-action/use-vault.test.ts` (parser), `entities/party/use-vault.test.ts` (domínio), `available-actions/index.test.ts`, `starting-player/index.test.ts`, `take-party-action/use-vault.test.ts` (caso de uso), `drizzle-party-mapper.test.ts` (v6 e v5).
2. Config: três chaves e limites em `game-config/defaults.ts` (30 / 10 / 2000; 0–1000, 1–100, 0–10.000.000).
3. Parser: `TVaultOperation`, `parseUseVault`; `parseCardCopies` compartilhado com o Ajustar deck.
4. Domínio: `vault/index.ts`, `TPlayerState.vault`, `emptyVault` na criação, `VaultUsed` e `SentToLimbo`, `Party.useVault`, `contentInUse` com o cofre.
5. Caso de uso `take-party-action`: `findVaultCatalog`; `ActionNotAllowedError` com os motivos novos e `operationIndex`.
6. Mapper v6 e ajuste dos e2e que montam saves antigos (esperam `schemaVersion: 6`, tiram `vault` e as chaves novas) e dos que listam a config (`get-lab-config`, `update-lab-config`).
7. `npm run format`; `npm run lint`; `npm run typecheck`; `npm run build`.

## Arquivos
- **Criados:** `src/domain/campaign/enterprise/vault/index.ts`; `entities/party/use-vault.test.ts`; `party-action/use-vault.test.ts`; `take-party-action/use-vault.test.ts`.
- **Alterados:** `game-config/defaults.ts`, `party-action`, `entities/party`, `party-member`, `starting-player`, `available-actions`, `events/party-events`, `action-not-allowed-error`, `take-party-action`, `drizzle-party-mapper` e testes; `test/factories/make-party`; e2e de config, de ações e do repositório Drizzle (v6).

## Como verificar
- `npx vitest run` → 81 arquivos, 854 testes verdes.
- `npm run test:e2e` (Postgres do autor no ar) → 44 arquivos, 192 testes verdes.
- Não há rota nova nem presenter ainda: `POST /actions` com `useVault` já passa pelo caso de uso, mas a resposta só mostra o cofre na T-33.

## Problemas
- Os e2e de saves antigos e de config listavam as chaves/versão antigas e quebraram com o v6; foram atualizados mecanicamente (mesma intenção, versão e chaves novas).

## Checks
`domain-guard --all` OK; `typecheck`, `lint`, `format:check` e `build` limpos; testes e e2e acima.

## Ponte com o frontend
Nada a levar: o contrato v0.46 não mudou. O aviso vem no fim da T-33.

## Commit sugerido
`feat/feat-32 vault domain (t-31, spec v0.45)`

## Revisão (spec-reviewer, 2026-11-18)
Aprovada sem bloqueantes. Aplicado:
- `notStorable` também em `saveDeck` (antes de `notAttribute`) e em `store` de carta que não é atributo, equipamento ou item (registrado em D-92).
- Nota em D-92: os saves v6 gravados antes da T-33 (sem `lastScavenge`) são só de desenvolvimento.
- A T-33 precisa passar `zoneActions` ao `availableActions` no presenter.
Depois dos ajustes: 854 testes unitários verdes, typecheck, lint e domain-guard OK.
