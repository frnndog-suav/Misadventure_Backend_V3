# 006 — T-05 — Persistência da config (`game_config`)

- **ID:** T-05 (FEAT-03) · **Data:** 2026-11-14 · **Status:** aguardando revisão
- **Spec:** v0.8 · **Contrato:** v0.7 (FEAT-03 `acordado`, sem mudança) · **Roadmap:** v0.9

## Objetivo
Persistir o ajuste do laboratório (D-13): a tabela `game_config`, a primeira migração do projeto, um mapper que mescla o valor salvo sobre os padrões (REQ-09) e o `DrizzleGameConfigRepository`, ligado à porta `GameConfigRepository` no `DatabaseModule`.

## Decisões (D-16)
- O `save` grava só as chaves que **diferem do padrão**. Assim, se um padrão mudar depois, a mudança vale para quem não ajustou aquela chave.
- Na leitura, o mapper usa o padrão quando o valor salvo não é inteiro ou está fora dos limites atuais. Se `values` não for objeto, é tratado como `{}`. Chave salva que não existe mais é ignorada.
- Os tokens `PG_POOL`, `DRIZZLE` e `Database` passaram para `database.tokens.ts`. O módulo importa o repositório e o repositório precisa de `DRIZZLE`; no mesmo arquivo, isso criaria um import circular.
- Migrações: scripts `db:generate` (`drizzle-kit generate`) e `db:migrate` (`drizzle-kit migrate`). No e2e, `test/setup-e2e.ts` aplica as migrações dentro do schema da execução, com `migrationsSchema` apontando para esse schema. Sem isso, a tabela de controle iria para o schema `drizzle`, compartilhado, e as execuções seguintes pulariam as migrações.
- **Limite conhecido:** se o banco tiver `minPlayers > maxPlayers`, a leitura não corrige. Isso só acontece se os padrões ou limites mudarem no futuro.
- **Revisão:** a tarefa só toca infra, então revisei o diff eu mesmo contra a spec, sem `spec-reviewer`.

## Passos e comandos
1. Testes primeiro (red): o mapper unitário e o e2e do repositório. `npx vitest run src/infra/database` falhou por módulo inexistente.
2. Implementação: schema, mapper, repositório, tokens, provider e setup do e2e.
3. `DATABASE_URL=postgresql://x:x@localhost:5432/x npx drizzle-kit generate --name=game_config` gerou `0000_game_config.sql`. O generate não conecta ao banco, mas o `drizzle.config.ts` valida o env.
4. Rodar `npx drizzle-kit generate` de novo respondeu `No schema changes, nothing to migrate`.
5. Abri o Docker Desktop e rodei `docker compose up -d postgres`.
6. `DATABASE_URL=postgresql://docker:docker@localhost:5432/misadventures npm run test:e2e` deu 11/11.
7. `npm run db:migrate` no banco de dev aplicou a migração, e `\d game_config` confirmou as 3 colunas.
8. Rodei `npm run format`, `typecheck`, `lint`, `format:check`, `npm test`, `domain-guard --all` e `build`.
9. `docker compose down` e Docker Desktop fechado.

## Arquivos
**Criados:**
- `src/infra/database/database.tokens.ts`
- `src/infra/database/drizzle/schema/{index.ts,game-config.ts}`
- `src/infra/database/drizzle/migrations/0000_game_config.sql` (+ `meta/`)
- `src/infra/database/drizzle/mappers/drizzle-game-config-mapper{.ts,.test.ts}`
- `src/infra/database/drizzle/repositories/drizzle-game-config-repository{.ts,.e2e-spec.ts}`

**Alterados:**
- `src/infra/database/database.module.ts` (tokens importados, provider `GameConfigRepository`)
- `test/setup-e2e.ts` (aplica as migrações)
- `package.json` (`db:generate`, `db:migrate`)
- `docs/SPEC-BACKEND.md` (v0.8)
- `docs/devlog/README.md`
- `docs/devlog/tempo.html`

## Como verificar
- `npx vitest run src/infra/database/drizzle/mappers` → 6 testes.
- Com o Postgres de pé: `npm run test:e2e` → 3 arquivos e 11 testes (4 do repositório).
- `npx drizzle-kit generate` → `No schema changes`.

## Problemas
- Não há `.env` nem `.env.test` na máquina, e o agente não tem permissão para ler ou criar esses arquivos. Os comandos rodaram com `DATABASE_URL` passado direto na linha de comando.
- O Docker Desktop estava parado, então foi iniciado para o teste e fechado ao terminar.

## Checks
- `npm test`: 6 arquivos, 43 testes. `npm run test:e2e`: 3 arquivos, 11 testes.
- `typecheck`, `lint`, `format:check`, `domain-guard --all` e `build`: OK.
- Depois do e2e, só o schema `public` ficou no banco; nenhum schema `e2e_*` sobrou.

## Ponte com o frontend
Nenhum aviso. O contrato não mudou.

## Commit sugerido
`feat/game config persistence (t-05)`
