# 030 — T-24 — Domínio da vez (FEAT-08)

- **ID:** T-24 · **Data:** 2026-11-17 · **Status:** aguardando revisão
- **Spec:** v0.34 · **Contrato:** v0.32 (FEAT-08 `acordado`) · **Roadmap:** v0.36

## Objetivo
REQ-54 a REQ-58 no domínio (e REQ-59 em memória): a vez (`turn`), o custo do Movimentar, encerrar a vez e as ações disponíveis.

## Decisões
- `TPartyTurn` (`party-turn/`) é um tipo readonly `{ round, memberId, actionPoints }` gravado em `TPartyProps.turn` (D-63). Na criação: rodada 1, `turnOrder[0]`, `config.actionPointsPerTurn`, mais o evento `TurnStarted` depois de `PlayersArrived` (REQ-55).
- `Party.move`: o ator é `turn.memberId` (D-63 substitui D-61). A ordem das recusas é `sessionNotActive`, `zoneNotInMap`, `noActionPoints`, `notConnected` (REQ-56). Gasta 1 ponto só no sucesso.
- `Party.endTurn(at)`: passa a vez ao seguinte em `turnOrder`, com `round + 1` na virada e pontos cheios. Grava `savedAt` e emite `TurnEnded` e depois `TurnStarted`. Aceito com 0 pontos (K2).
- `availableActions(party, memberId)` (`available-actions/`) é uma função pura. Devolve `move` (se há ponto e `moveTargets`) e `endTurn` para o membro da vez, e `[]` para os demais. Não olha o `status` (D-65, registrado na revisão).
- `parsePartyAction` aceita `endTurn`; campo a mais gera `unknownKey`. O caso de uso tem `switch` exaustivo sobre `action`.
- O teste "quem move é o host" (D-61) foi reescrito para "o membro da vez", porque D-63 o substitui.
- **Provisório:** `DrizzlePartyMapper.toDomain` monta `turn` como um save v2 e não grava. A T-25 troca isso pelo save v3 (D-64). Até lá, `turn` não persiste no Postgres.

## Passos e comandos
1. Testes primeiro em `party/index.test.ts`, `party-action/index.test.ts`, `available-actions/index.test.ts` (novo), `take-party-action/index.test.ts` e `create-party/index.test.ts`. Rodei `npx vitest run src/domain/campaign`: 26 falhas pelo motivo certo.
2. Implementação. Depois, `npm run format`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` e `node .claude/hooks/domain-guard.mjs --all`.
3. O `spec-reviewer` apontou a falta do teste do REQ-59 em memória. Acrescentei esse teste e a verificação dos 5 pontos na criação (REQ-54).

## Arquivos
**Novos:** `src/domain/campaign/enterprise/party-turn/index.ts`, `src/domain/campaign/enterprise/available-actions/{index.ts,index.test.ts}`.
**Alterados:** `src/domain/campaign/enterprise/{entities/party,events/party-events,party-action}/*`, `src/domain/campaign/application/use-cases/{take-party-action,create-party}/*`, `_errors/action-not-allowed-error.ts`, `src/infra/database/drizzle/mappers/drizzle-party-mapper.ts`, `test/factories/make-party/index.ts`, `test/repositories/in-memory-parties-repository.ts`, `docs/SPEC-BACKEND.md`, `docs/devlog/{README.md,tempo.html}`.

## Como verificar
`npx vitest run src/domain/campaign` → 170 testes verdes. `npm test` → 70 arquivos verdes.

## Checks
typecheck, lint, format, build e domain-guard limpos. Os e2e não rodaram: dependem do Docker, e a rota da vez é da T-25.

## Ponte com o frontend
Nenhuma nesta etapa. O AVISO DE FRONTEND sai ao fim da T-25.

## Commit sugerido
`feat/feat-08 turn domain`
