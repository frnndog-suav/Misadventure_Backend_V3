# 003 — T-02 — Docker Compose, env e base do Drizzle

- **ID:** T-02 (FEAT-01) · **Data:** 2026-11-14 · **Status:** aguardando revisão
- **Spec:** v0.4 · **Contrato:** v0.4

## Objetivo

Subir banco e backend com Docker Compose, validar o env na inicialização, conectar no PostgreSQL via Drizzle (sem tabelas ainda) e preparar o isolamento do banco nos testes e2e (D-03).

## Decisões

- **D-09** (spec v0.4): env validado por Zod via `ConfigModule.forRoot({ validate })`; `PORT` padrão 3333; `DATABASE_URL` só `postgres(ql)://`. `select 1` na criação do pool faz o boot falhar cedo sem banco. Schema `e2e_<uuid>` por arquivo de teste, via `options=-c search_path=…` na URL, apagado no `afterAll`.
- **CORS fica na T-03**, como diz a spec (a variável da origem do frontend nasce com ele). O env da T-02 tem só `PORT` e `DATABASE_URL`.
- **Credenciais do Compose são de desenvolvimento** (`docker`/`docker`, banco `misadventures`), fixas no `docker-compose.yml`. Não são segredo: o banco só existe na máquina local.
- **Imagens:** `postgres:17-alpine` e `node:22-alpine` (mesmo major do Node local). Dockerfile em dois estágios: build com devDeps e runtime só com deps de produção.
- **Sem migração no `setup-e2e.ts` ainda:** o `drizzle-kit migrate` precisa de pasta de migrações, que nasce com o primeiro schema do Drizzle. O comentário no arquivo marca o lugar.
- **`@types/pg` 8.23.1** instalado (D-05 autoriza os `@types/*` necessários; sem ele o typecheck falha).
- **`.env.example` não foi criado pelo agente:** a regra de permissão do projeto bloqueia escrita em `.env*`. O autor cria (conteúdo em "Como verificar").

## Passos e comandos

```
npm install -D @types/pg@8
docker compose up -d --build
```

## Arquivos

Criados: `docker-compose.yml`, `Dockerfile`, `.dockerignore`, `drizzle.config.ts`, `src/infra/env/{env.ts,env.service.ts,env.module.ts,env.test.ts}`, `src/infra/database/database.module.ts`, `test/setup-e2e.ts`.
Alterados: `src/infra/main.ts` (porta vem do `EnvService`; `enableShutdownHooks` para fechar o pool), `src/infra/app.module.ts` (importa `EnvModule` e `DatabaseModule`), `tsconfig.json` (inclui `drizzle.config.ts`), `package.json`/`package-lock.json` (`@types/pg`), `docs/SPEC-BACKEND.md` (v0.4), `docs/devlog/tempo.html`.

## Como verificar

`.env.example` (o autor cria; copie para `.env` e `.env.test`):

```
PORT=3333
DATABASE_URL=postgresql://docker:docker@localhost:5432/misadventures
```

1. `docker compose up -d --build` → `misadventures-postgres` healthy e `misadventures-backend` Up; `docker compose logs backend` mostra `DatabaseModule dependencies initialized` e `Nest application successfully started`.
2. Env inválido: `npm run build` e depois `node dist/infra/main` com `PORT=abc` e sem `DATABASE_URL` → exit 1 com `Variáveis de ambiente inválidas…`, `→ at PORT`, `→ at DATABASE_URL`.
3. Banco inacessível: `DATABASE_URL=postgresql://docker:docker@localhost:5999/misadventures` → exit 1 com `ECONNREFUSED`.

## Problemas

1. Docker Desktop estava parado → iniciado pelo agente.
2. `tsc` sem tipos do `pg` (TS7016) → `@types/pg`.
3. Escrita do `.env.example` bloqueada pela permissão `.env*` → deixado para o autor.

## Checks

| Check | Resultado |
|---|---|
| guarda do domínio | ✅ (sem src/core e src/domain) |
| tipos | ✅ 0 erros |
| lint | ✅ 0 erros |
| formatação | ✅ |
| unitários | ✅ 5/5 (`src/infra/env/env.test.ts`) |
| e2e | ✅ 1/1 num teste descartável (já apagado): `current_schema()` = `e2e_…`; depois do teste, 0 schemas `e2e_%` no banco |
| build | ✅ |
| compose | ✅ banco healthy, backend conectado |
| segredos fora do Git | ✅ |

## Ponte com o frontend

Nenhum aviso: nada de contrato, README ou ROADMAP.

## Commit sugerido

`chore/docker compose, env e base do drizzle (t-02)`
