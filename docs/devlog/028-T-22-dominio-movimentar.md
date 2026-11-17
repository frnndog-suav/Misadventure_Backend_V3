# 028 — T-22 — Domínio do Movimentar (FEAT-07)

- **ID:** T-22 · **Data:** 2026-11-17 · **Status:** aguardando revisão
- **Spec:** v0.31 · **Contrato:** v0.28 (FEAT-07 `acordado`, sem mudança)

## Objetivo
Implementar no domínio REQ-50 a REQ-53 (destinos, mover, recusas, leitura da intenção), sem HTTP (isso é a T-23).

## Decisões
- `Party.move(zoneId, at)` → `Either<'sessionNotActive' | 'zoneNotInMap' | 'notConnected', void>`. Quem age é o host (D-61). A recusa fora de sessão fica no próprio agregado, pela máquina de estados. O `at` alimenta `savedAt` e `occurredAt`. A D-62 foi atualizada com isso na spec v0.31.
- `parsePartyAction` para no primeiro problema em `type` (`required`/`notString`/`unknownAction`). `zoneId` e os campos a mais só são conferidos quando a ação é conhecida, como mostram os exemplos do contrato. O texto da REQ-53 foi esclarecido.
- `connectedZones(map, zoneId)` é uma função pura: as travessias valem nos dois sentidos, sem repetição, ordenadas por código de caractere, e a própria zona nunca entra.
- `Party.move` cria um `PartyMember` novo com o `zoneId` trocado em vez de mudar o existente. Assim não há aliasing com cópias do repositório em memória.
- Os tipos `TActionIssue` (em `enterprise/party-action`) e `TActionNotAllowedReason` (no erro) ficam no domínio. As FEATs 08+ acrescentam variantes.

## Passos e comandos
1. Testes primeiro: `npx vitest related --run <4 arquivos de teste>` → falharam porque os módulos e `Party.move` ainda não existiam.
2. Implementação. Depois: `npm run format`, `npm run typecheck`, `npm run lint`, `node .claude/hooks/domain-guard.mjs --all`, `npx vitest run src/domain/campaign`, `npm run format:check`, `npm run build`.
3. O spec-reviewer não achou problema de código. Pediu para alinhar a D-62 e a REQ-53 e para testar o host que não é o 1º membro, e os três ajustes foram feitos.

## Arquivos
**Novos:** `src/domain/campaign/enterprise/{connected-zones,party-action}/index{,.test}.ts`, `src/domain/campaign/application/use-cases/take-party-action/index{,.test}.ts`, `src/domain/campaign/application/use-cases/_errors/{action-invalid-error,action-not-allowed-error}.ts`.
**Alterados:** `src/domain/campaign/enterprise/entities/party/index{,.test}.ts`, `src/domain/campaign/enterprise/events/party-events/index.ts`, `docs/SPEC-BACKEND.md`, `docs/devlog/{README.md,tempo.html}`.

## Como verificar
`npx vitest run src/domain/campaign` → 14 arquivos e 142 testes verdes. `node .claude/hooks/domain-guard.mjs --all` → `OK`.

## Checks
typecheck, lint, format:check, domain-guard e build limpos; 142 testes verdes.

## Ponte com o frontend
Nada agora. O AVISO DE FRONTEND sai ao fim da T-23 (`implementado (BE)`).

## Commit sugerido
`feat/feat-07 move domain`
