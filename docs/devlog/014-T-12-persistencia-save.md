# 014 — T-12 — Persistência do save (`parties`) e adaptadores

- **ID:** T-12 (FEAT-05) · **Data:** 2026-11-15 · **Status:** aguardando revisão
- **Spec:** v0.18 · **Contrato:** v0.15 (FEAT-05 `acordado`, sem mudança)

## Objetivo
Gravar o save (`Party`) no Postgres (REQ-22 no Drizzle, D-31): tabela `parties` + migração, `DrizzlePartyMapper` com Zod e `schemaVersion`, `DrizzlePartiesRepository` ligado à porta no `DatabaseModule`; adaptadores reais das portas do core `SystemClock`, `UuidIdGenerator`, `CryptoSeedGenerator` (D-26).

## Decisões (D-34)
- `state` jsonb = `{ schemaVersion: 1, members, hostMemberId, config, rngState }`; `createdAt`/`savedAt` só nas colunas.
- `status` como `text` (não enum do Postgres), validado no mapper: `frozen` (FEAT-19) entra sem migração de tipo.
- Save corrompido → o mapper **lança** (Zod estrito; `rngState` validado antes de `fromState`, D-32). É falha de infra (500), não `DomainError`. Contra: uma chave nova na `GameConfig` exige `schemaVersion` 2 + atualização no mapper.
- `save` de grupo inexistente lança (igual ao repositório em memória). `findById` com texto não uuid devolve `null` sem ir ao banco (senão o Postgres lança e a T-13 não daria 404).
- Adaptadores sem provider Nest: só a T-13 tem consumidor.
- Revisão: tarefa só de infra; diff revisado por mim contra a spec, sem `spec-reviewer`.

## Passos e comandos
1. Testes primeiro: mapper (unitário), três adaptadores (unitários), repositório (e2e). `npx vitest run src/infra/clock src/infra/ids src/infra/rng src/infra/database/drizzle/mappers` falhou por módulo inexistente.
2. Implementação: schema, mapper, repositório, provider, adaptadores.
3. `DATABASE_URL=postgresql://x:x@localhost:5432/x npx drizzle-kit generate --name=parties` → `0001_parties.sql`; repetido → `No schema changes, nothing to migrate`.
4. Docker Desktop + `docker compose up -d postgres`; `npm run test:e2e` com `DATABASE_URL` na linha de comando.
5. `npm run db:migrate` no banco de dev; `docker exec misadventures-postgres psql -U docker -d misadventures -c "\d parties"` mostrou as 6 colunas.
6. `npm run format`, `typecheck`, `lint`, `format:check`, `npm test`, `domain-guard --all`, `build`.
7. `docker compose down` e Docker Desktop fechado.

## Arquivos
**Criados:**
- `src/infra/database/drizzle/schema/parties.ts`
- `src/infra/database/drizzle/migrations/0001_parties.sql` (+ `meta/0001_snapshot.json`)
- `src/infra/database/drizzle/mappers/drizzle-party-mapper{.ts,.test.ts}`
- `src/infra/database/drizzle/repositories/drizzle-parties-repository{.ts,.e2e-spec.ts}`
- `src/infra/clock/system-clock{.ts,.test.ts}`, `src/infra/ids/uuid-id-generator{.ts,.test.ts}`, `src/infra/rng/crypto-seed-generator{.ts,.test.ts}`

**Alterados:** `src/infra/database/database.module.ts` (provider `PartiesRepository`), `schema/index.ts`, `migrations/meta/_journal.json`, `docs/SPEC-BACKEND.md` (T-12 `[x]`, D-34, v0.18; cabeçalho que ficara em 0.16), este índice, `tempo.html`.

## Como verificar
- `npx vitest run src/infra/clock src/infra/ids src/infra/rng src/infra/database/drizzle/mappers` → 5 arquivos, 18 testes.
- Com Postgres: `npm run test:e2e` → 12 arquivos, 37 testes (7 do repositório).
- `npx drizzle-kit generate` → `No schema changes`.

## Problemas
- Tipo do teste do mapper (`Record<string, unknown>` não servia como `TPartyRow`) apontado pelo `tsc`; corrigido o cast, sem mudar o que o teste verifica.
- Sem Python no Git Bash; edições de doc feitas com o editor.

## Checks
- `npm test`: 28 arquivos, 182 testes. `npm run test:e2e`: 12 arquivos, 37 testes.
- `typecheck`, `lint`, `format:check`, `domain-guard --all`, `build`: OK.

## Ponte com o frontend
Nenhuma (contrato inalterado).

## Commit sugerido
`feat/party persistence and core adapters (t-12)`
