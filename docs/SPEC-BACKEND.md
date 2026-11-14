# Misadventures — Especificação do backend

> **Versão da spec:** 0.7 · **Data:** 2026-11-14
>
> Fonte da verdade do **comportamento do backend** (spec-anchored). Regras do jogo: [`README.md`](README.md) (citar por seção, nunca copiar). O que trafega com o frontend: [`CONTRATO.md`](CONTRATO.md). Fases: [`ROADMAP.md`](ROADMAP.md).

## 1. Visão

- **Problema:** o Misadventures precisa de um motor de regras único e autoritativo, para que o jogo solo, os ajudantes de IA e o online usem o mesmo código (README II.1).
- **O que o backend faz:** guarda o estado das partidas e saves, aplica todas as regras do README, valida as intenções do jogador, sorteia com RNG com semente, calcula os valores que o frontend exibe e devolve o novo estado e os `domainEvent` em ordem.
- **Público:** o frontend do Misadventures (web e depois Tauri, sempre contra servidor remoto, README II.2).
- **Fora do escopo agora:** modos além da Campanha e raides (README II.1, 22); autenticação até a FEAT-25 (não propor antes, README II.1); Socket.IO antes da FEAT-26.

## 2. Regras do domínio

As regras estão no README (Parte I, Apêndice A e Apêndice B). Esta spec só registra **como** cada uma vira código: os REQs citam a seção do README de onde vêm. Quando o README for omisso, vale a ordem do Apêndice B (texto da carta → regra mais específica → decisão mais recente → interpretação mais simples, registrada).

## 3. Arquitetura

### 3.1 Glossário

O glossário termo → identificador é o de [`CONTRATO.md`](CONTRATO.md) §2 (compartilhado). Termos só do backend (nunca trafegam):

| Termo | Identificador | Definição |
|---|---|---|
| Gerador de números aleatórios | `Rng` / `RngState` | Porta do sorteio; o estado é serializável e salvo com o agregado. |
| Relógio | `Clock` | Porta que devolve o instante atual; fixo nos testes. |
| Gerador de IDs | `IdGenerator` | Porta que cria `UniqueEntityID`; sequencial nos testes. |
| Catálogo de cartas | `CardCatalog` | Porta de leitura do conteúdo (cartas como dados). |
| Configuração de jogo | `GameConfig` | Valores ajustáveis do Apêndice A, injetados (FEAT-03). |

### 3.2 Stack, camadas, pastas e bibliotecas

**Stack (README II.2, II.3):** TypeScript, NestJS, Drizzle ORM, PostgreSQL, Docker Compose (banco + backend), Vitest, Supertest. Socket.IO só no momento 3.

**Bibliotecas autorizadas e instaladas:** as de **D-05**, instaladas na T-01 (versões exatas no devlog 001). Herdadas da organização de referência: `@nestjs/*` (core, common, platform-express, config, testing, cli), `drizzle-orm` + `drizzle-kit` + `pg`, `zod` (env, pipes, validação de conteúdo), `vitest` + `unplugin-swc` + `@swc/core` + `vite-tsconfig-paths`, `supertest`, `@faker-js/faker` (só em testes, nunca para sorteio de regra), `prettier`, `eslint`, `dotenv`.

**Camadas (hexagonal + DDD):**

| Camada | Pasta | Pode importar | Não pode |
|---|---|---|---|
| Core (kernel compartilhado) | `src/core/` | nada externo | Nest, Drizzle, infra, I/O, relógio/aleatório do sistema |
| Domínio — enterprise | `src/domain/<contexto>/enterprise/` | `@/core` | application, infra |
| Domínio — application | `src/domain/<contexto>/application/` | `@/core`, enterprise | infra, Nest |
| Infra (adaptadores) | `src/infra/` | tudo acima + libs autorizadas | — |

**Árvore de pastas** (organização herdada do projeto de referência NestJS + DDD; as pastas nascem com as tarefas que as usam):

```
.
├── CLAUDE.md
├── docker-compose.yml              # postgres + backend
├── drizzle.config.ts
├── nest-cli.json                   # entryFile: infra/main
├── tsconfig.json / tsconfig.build.json   # paths: "@/*" → "./src/*"
├── vitest.config.ts                # unitários (*.test.ts)
├── vitest.config.e2e.ts            # e2e (*.e2e-spec.ts), setupFiles: test/setup-e2e.ts
├── .env.example                    # .env e .env.test fora do Git
├── content/                        # cartas como dados (JSON versionado)
│   └── <coleção>/<tipo>.json
├── docs/
│   ├── README.md · ROADMAP.md · CONTRATO.md   # compartilhados
│   ├── SPEC-BACKEND.md
│   └── devlog/
├── src/
│   ├── core/
│   │   ├── entities/               # Entity<Props>, UniqueEntityID
│   │   ├── pattern/                # AggregateRoot (eventos em ordem, pullDomainEvents), WatchedList
│   │   ├── events/                 # DomainEvent (interface)
│   │   ├── error/                  # Either (left/right), DomainError (code + message pt-BR)
│   │   ├── value-object/           # ValueObject<Props>
│   │   ├── ports/                  # Rng, Clock, IdGenerator
│   │   └── types/                  # Optional<T, K> etc.
│   ├── domain/
│   │   └── <contexto>/             # ex.: catalog (FEAT-04), campaign (FEAT-05+)
│   │       ├── enterprise/
│   │       │   ├── entities/<nome>/index.ts
│   │       │   ├── value-objects/<nome>/index.ts (+ index.test.ts)
│   │       │   └── events/<nome>-event/index.ts
│   │       └── application/
│   │           ├── repositories/<nome>/index.ts        # portas: abstract class
│   │           └── use-cases/
│   │               ├── <nome>/index.ts + index.test.ts
│   │               └── _errors/<nome>-error.ts
│   └── infra/
│       ├── main.ts · app.module.ts
│       ├── env/                    # schema do env, EnvModule, EnvService
│       ├── http/
│       │   ├── http.module.ts      # liga use cases (providers/useFactory) a controllers
│       │   ├── controllers/<nome>/index.controller.ts + index.controller.e2e-spec.ts
│       │   ├── presenters/<nome>-presenter/index.ts   # domínio → JSON do contrato
│       │   ├── pipes/              # validação do corpo
│       │   └── errors/             # DomainError.code → status HTTP + corpo CONTRATO §1.4
│       ├── database/
│       │   ├── database.module.ts  # provide: <Porta>, useClass: Drizzle<Nome>Repository
│       │   └── drizzle/
│       │       ├── schema/ · migrations/
│       │       ├── mappers/drizzle-<nome>-mapper.ts
│       │       └── repositories/drizzle-<nome>-repository.ts
│       ├── content/                # adaptador do CardCatalog (lê content/, valida)
│       ├── rng/ · clock/ · ids/    # adaptadores das portas do core
│       ├── events/                 # despacho dos domainEvent puxados dos agregados
│       └── websocket/              # só no momento 3
└── test/
    ├── setup-e2e.ts                # schema Postgres único por execução, migrações, limpeza
    ├── factories/make-<nome>/index.ts   # makeX(override, id) + XFactory (persiste via Drizzle)
    ├── repositories/in-memory-<nome>-repository.ts
    ├── fakes/                      # fixedRng, fixedClock, sequentialIds, in-memory-card-catalog
    └── fixtures/content/           # conteúdo de teste (Apêndice A desta spec)
```

**Convenções de nomes:** pastas e arquivos em `kebab-case`; classes em `PascalCase` com sufixo do papel (`CreatePartyUseCase`, `PartiesRepository`, `DrizzlePartiesRepository`, `DrizzlePartyMapper`, `PartyPresenter`, `CreatePartyController`, `PartyCreatedEvent`, `PartyNotFoundError`); tipos de props `T<Nome>Props`; request/response de caso de uso `T<Nome>UseCaseRequest` / `T<Nome>UseCaseResponse = Either<Erro, { ... }>`.

**Padrões:**
- **Entity / AggregateRoot:** construtor `protected`; criação por `static create(props, id?)`; props privadas com getters e setters/métodos de intenção que validam invariantes. O agregado acumula `domainEvent` em ordem e os entrega por `pullDomainEvents()` (devolve e limpa). **Diferença em relação à referência:** sem registro estático global de eventos no domínio, e `UniqueEntityID` não gera UUID sozinho (vem do `IdGenerator`).
- **State Machine:** a fase da partida é uma união discriminada; cada método de intenção confere a fase e devolve erro se a ação não cabe nela.
- **Caso de uso:** uma classe com `execute(request)`, dependências (portas) no construtor, **sem decorators do Nest**; o `http.module.ts` registra cada caso de uso com `useFactory`. Retorna `Either`.
- **Repositório:** porta `abstract class` em `application/repositories/`; implementação em memória em `test/repositories/`; implementação Drizzle em `infra/database/drizzle/repositories/` com mapper.
- **Presenter:** converte entidade em JSON exatamente no formato do contrato (camelCase, valores já calculados).
- **Erros:** `DomainError` com `code` do CONTRATO §4 e `message` em pt-BR; o infra mapeia para status HTTP.

### 3.3 Modelo de dados

*(a definir por FEAT; os tipos que trafegam estão no contrato)*

### 3.4 API pública e eventos

*(a definir por FEAT: casos de uso, intenções aceitas, `domainEvent` emitidos e a ordem deles)*

- **FEAT-01:** `GET /health` (CONTRATO FEAT-01). Sem caso de uso, sem domínio e sem `domainEvent` (D-07).
- **FEAT-03:** `GET /lab/config`, `PATCH /lab/config`, `POST /lab/config/reset`, só com `LAB_ENABLED` (D-14). Casos de uso `GetGameConfig`, `UpdateGameConfig`, `ResetGameConfig` (D-11). Sem `domainEvent` (config não é agregado de partida).

## Requisitos

### FEAT-01 — Esqueleto técnico

Sem regra de jogo (README II.2, II.3); o comportamento observável vem de CONTRATO v0.4, seção FEAT-01 e §1.4.

- **REQ-01 — Health check:** Dado o backend no ar, quando `GET /health`, então `200` com `{ "status": "ok", "contractVersion": <versão do contrato que o backend implementa, D-06> }` (CONTRATO FEAT-01, §1.5).
- **REQ-02 — Rota desconhecida:** Dado o backend no ar, quando chega um pedido para rota inexistente (qualquer método), então `404` com `{ "error": { "code": "NOT_FOUND", "message": "Recurso não encontrado." } }` (CONTRATO §1.4, §4).
- **REQ-03 — Falha inesperada:** Dado um pedido que provoca uma exceção não tratada em qualquer endpoint, quando o backend responde, então `500` com `{ "error": { "code": "INTERNAL_ERROR", "message": "Erro inesperado no servidor. Tente novamente." } }`, sem vazar stack trace no corpo (CONTRATO FEAT-01, §1.4, §4). No e2e, a exceção é provocada por um controller descartável declarado só no arquivo de teste — não existe endpoint de depuração.

### FEAT-03 — Esqueleto do laboratório

Regras de README II.6 e Apêndice A. Valores desta FEAT (D-11): Partida (jogadores 1 a 6, README 1.3), pontos de ação por vez 3 (11.1), Pico e Vigor iniciais 10/10 (7.4), vida base / ouro / mão iniciais 20/10/7 (9.1). Os demais valores do Apêndice A entram com a FEAT que os usa (ROADMAP §1). Formatos exatos: CONTRATO, seção FEAT-03 (a propor).

- **REQ-04 — Configuração padrão:** Dado o laboratório ligado (D-14) e nenhum ajuste salvo, quando `GET /lab/config`, então `200` com `values` e `defaults` iguais a `{ minPlayers: 1, maxPlayers: 6, actionPointsPerTurn: 3, initialPeak: 10, initialVigor: 10, baseHealth: 20, initialGold: 10, initialHandSize: 7 }` e `limits` com `{ min, max }` de cada chave (D-12).
- **REQ-05 — Ajuste parcial:** Dado a configuração padrão, quando `PATCH /lab/config` com `{ "actionPointsPerTurn": 4 }`, então `200` com `values.actionPointsPerTurn = 4` e as demais chaves inalteradas; um `GET /lab/config` seguinte (inclusive após reiniciar o backend) devolve o mesmo `values` (D-13).
- **REQ-06 — Ajuste inválido:** Dado qualquer configuração salva, quando `PATCH /lab/config` com corpo que não é objeto JSON, chave desconhecida, valor não inteiro, valor fora de `limits`, ou que deixaria `minPlayers > maxPlayers`, então `400` com `code: "LAB_CONFIG_INVALID"` e `details.fields` listando cada chave inválida com o motivo; **nada** é salvo (o pedido inteiro é rejeitado).
- **REQ-07 — Restaurar padrões:** Dado ajustes salvos, quando `POST /lab/config/reset`, então `200` com `values` igual a `defaults`, e o próximo `GET` devolve os padrões.
- **REQ-08 — Laboratório desligado:** Dado `LAB_ENABLED` ausente ou `false`, quando qualquer pedido a `/lab/*`, então `404` `NOT_FOUND` (as rotas não existem, README II.6).
- **REQ-09 — Leitura pelas regras:** Dado o caso de uso `GetGameConfigUseCase`, quando não há ajuste salvo, então devolve a `GameConfig` com os padrões; quando há, devolve os valores salvos sobre os padrões (chave salva que não existe mais é ignorada; chave nova sem valor salvo usa o padrão). É a porta pela qual as regras das próximas FEATs leem os valores (Constituição 7).

## Decisões

- **D-01 — Códigos de erro:** a lista única é CONTRATO §4. Todo `DomainError` usa um código de lá; código novo entra pelo `/contrato` antes do código.
- **D-02 — Estilo do domínio:** classes `Entity`/`AggregateRoot` com portas (organização de referência), mas sem estado global e sem fontes não determinísticas (decidido pelo autor em 2026-11-13).
- **D-03 — Banco:** PostgreSQL via Drizzle; e2e com schema isolado por execução (2026-11-13).
- **D-04 — Conteúdo:** todas as cartas são versionadas em `content/` (JSON validado por schema); não há conteúdo privado (2026-11-13).
- **D-05 — Bibliotecas da FEAT-01 (autorizada em 2026-11-14 pela ordem de executar a T-01; instalada, versões no devlog 001):** `@nestjs/{core,common,platform-express,config,testing,cli}` 11.x, `drizzle-orm` + `drizzle-kit` (últimas estáveis) + `pg` 8.x, `zod` (última estável), `vitest` + `unplugin-swc` + `@swc/core` + `vite-tsconfig-paths` (últimas estáveis), `supertest` 7.x (+ `@types/*` necessários), `prettier` 3.x, `eslint` 9.x (+ `typescript-eslint`), `dotenv` e `dotenv-cli` (scripts de teste/drizzle). `@faker-js/faker` fica para a FEAT que primeiro precisar dele (nada na FEAT-01 o usa). **Versões exatas são fixadas na instalação (T-01) e registradas no devlog**; major novo em relação ao aqui autorizado → nova autorização.
- **D-06 — Fonte do `contractVersion`:** constante `CONTRACT_VERSION` em `src/infra/http/contract-version.ts`, atualizada pela skill `/contrato` quando o backend passa a implementar uma versão nova. Não vem de env (não varia por ambiente) nem de parse do `CONTRATO.md` em runtime (frágil e acopla deploy ao arquivo de docs) (2026-11-14).
- **D-07 — `/health` é só infra:** o endpoint não tem regra de jogo; controller em `src/infra/http/controllers/health/` responde direto, sem caso de uso, domínio ou banco (criar camadas vazias violaria "apenas o necessário"). O primeiro caso de uso real nasce na FEAT que tiver regra (2026-11-14).
- **D-08 — Erros HTTP fora do domínio:** um exception filter global em `src/infra/http/errors/` traduz qualquer exceção para o corpo de CONTRATO §1.4: `HttpException` 404 → `NOT_FOUND`; qualquer exceção não tratada → 500 `INTERNAL_ERROR` (sem stack trace no corpo; log no servidor). O mapeamento `DomainError.code` → status entra no mesmo filtro quando os primeiros `DomainError` existirem (2026-11-14).
- **D-09 — Env, conexão e isolamento do e2e:** o env é validado pelo schema Zod de `src/infra/env/env.ts` via `ConfigModule.forRoot({ validate })` (`PORT` padrão 3333; `DATABASE_URL` precisa ser `postgres(ql)://`); env inválido derruba o boot listando cada variável. O `DatabaseModule` faz `select 1` ao criar o pool, então banco inacessível também derruba o boot. No e2e, `test/setup-e2e.ts` cria um schema `e2e_<uuid>` por arquivo de teste, aponta o `DATABASE_URL` para ele (`options=-c search_path=…`) e o apaga no fim (2026-11-14).
- **D-10 — CORS e forma do filtro:** origem liberada vem de `CORS_ORIGIN` (env, URL `http(s)`, padrão `http://localhost:5173`, o dev server do Vite usado pelo frontend), aplicada com `enableCors` no `main.ts`. O filtro de D-08 é registrado como `APP_FILTER` no `HttpModule` (vale também no e2e) e responde pelo `HttpAdapterHost` (sem depender de tipos do Express). Hoje toda `HttpException` que não é 404 vira 500 `INTERNAL_ERROR`, como D-08 diz; o mapeamento de 4xx entra quando o primeiro endpoint com corpo existir (2026-11-14).

- **D-11 — `GameConfig` no domínio `lab`:** value object `GameConfig` em `src/domain/lab/enterprise/value-objects/game-config/`, com os padrões do Apêndice A em **um único** arquivo (`defaults.ts`) e os limites (D-12). Porta `GameConfigRepository` (assíncrona: `get(): Promise<GameConfig | null>`, `save(config)`, `delete()`, este último para o reset de D-13); casos de uso `GetGameConfigUseCase`, `UpdateGameConfigUseCase` (parcial, valida tudo antes de salvar), `ResetGameConfigUseCase`; erro `LabConfigInvalidError` (`LAB_CONFIG_INVALID`). Cada FEAT seguinte acrescenta as suas chaves ao `GameConfig`, aos padrões e aos limites. Quando a campanha existir (FEAT-05+), ela **copia** a config no momento da criação, para a regra não mudar no meio de um save (decisão do autor, 2026-11-14).
- **D-12 — Limites (proposta, ajustável pelo autor):** todos inteiros. `minPlayers` 1–6 e `maxPlayers` 1–6 (teto do MVP, README 1.3), com `minPlayers ≤ maxPlayers`; `actionPointsPerTurn` 1–10; `initialPeak` 1–1000; `initialVigor` 0–1000; `baseHealth` 1–1000; `initialGold` 0–100000; `initialHandSize` 0–60 (2026-11-14).
- **D-13 — Persistência da config:** tabela `game_config` com uma linha (`id = 'current'`), `values jsonb` (só as chaves ajustadas) e `updated_at`. Na leitura, o mapper mescla o salvo sobre os padrões (REQ-09), então FEAT nova que acrescenta chave não precisa migrar dados. Reset apaga a linha (decisão do autor: banco, 2026-11-14).
- **D-14 — Flag do laboratório:** env `LAB_ENABLED` (booleano, padrão `false`; `true` no `.env.example` e no Compose de dev). O `LabModule` só é importado quando `true`, então em release as rotas não existem (404 pelo filtro de D-08). A checagem de **admin** (README II.6) entra com a autenticação (FEAT-25); até lá, não é tratada. O filtro de D-08 passa a mapear `DomainError.code` → status (`LAB_CONFIG_INVALID` → 400), e corpo JSON malformado em `/lab/*` também vira `LAB_CONFIG_INVALID` (2026-11-14).
- **D-15 — Validação do ajuste no domínio (T-04):** `GameConfig.applyPatch(unknown)` faz toda a validação de REQ-06, inclusive `invalidBody` para corpo que não é objeto (o infra só converte JSON malformado). Ordem de `details.fields`: erros por chave na ordem do pedido; `minAboveMax` (as duas chaves) por último, calculado sobre a config atual com as chaves válidas do pedido. Valor que não é `number` inteiro (string, `null`, booleano, fração) → `notInteger`; `outOfRange` só se aplica a inteiros (2026-11-14).

## 4. Tarefas

### FEAT-01 — Esqueleto técnico

Contrato necessário: CONTRATO v0.4, seção FEAT-01 (`acordado`) — `GET /health`, `NOT_FOUND`, `INTERNAL_ERROR`. Nada falta no contrato.

- [x] **T-01 — Ferramentas e esqueleto NestJS.** Instalar as bibliotecas de D-05 (fixar e registrar versões); `tsconfig.json`/`tsconfig.build.json` com `@/*` → `src/*`; `nest-cli.json` (entryFile `infra/main`); `vitest.config.ts` (unitários) e `vitest.config.e2e.ts` (e2e, `setupFiles: test/setup-e2e.ts`); Prettier (sem ponto e vírgula, aspas simples, vírgula final es5); ESLint com as regras do `domain-guard` para `src/core/` e `src/domain/`; `.gitignore`; `src/infra/main.ts` + `app.module.ts` mínimos subindo na porta do env; scripts npm de CLAUDE.md (menos `validate:content`, que nasce com o validador na FEAT-04). **Verificação:** `npm run build`, `typecheck`, `lint`, `format:check` passam; `npm run start:dev` sobe.
- [x] **T-02 — Docker Compose, env e base do Drizzle.** `docker-compose.yml` (serviços `postgres` e `backend`, com Dockerfile); `.env.example` (`PORT`, `DATABASE_URL`); `src/infra/env/` (schema Zod + `EnvModule`/`EnvService`, app não sobe com env inválido); `drizzle.config.ts`; `src/infra/database/database.module.ts` com a conexão `pg` (sem tabelas ainda — o primeiro schema nasce com o primeiro agregado persistido); `test/setup-e2e.ts` com schema Postgres único por execução e limpeza (D-03). **Verificação:** `docker compose up -d` sobe banco e backend; app conecta no banco; env inválido derruba o boot com mensagem clara.
- [x] **T-03 — `GET /health` e filtro de erros (REQ-01, REQ-02, REQ-03).** TDD: e2e Supertest primeiro, um teste por REQ (`it('REQ-01: …')`), cenários com os valores exatos do CONTRATO FEAT-01. Depois: `src/infra/http/contract-version.ts` (D-06), `controllers/health/index.controller.ts` (D-07), exception filter global em `http/errors/` (D-08), `http.module.ts`, CORS liberado para a origem do frontend (env), `client.http` com os dois cenários do contrato. **Verificação:** `npm run test:e2e` verde; `curl` dos cenários responde byte a byte o contrato. Ao final: `/contrato` marca FEAT-01 `implementado (BE)` e gera o AVISO DE FRONTEND.

### FEAT-03 — Esqueleto do laboratório

Contrato necessário (seção FEAT-03, a propor pelo backend com `/contrato FEAT-03` **antes da T-04**): `GET /lab/config`, `PATCH /lab/config`, `POST /lab/config/reset`; tipo `LabConfig` (`values`, `defaults`, `limits`); glossário das chaves (`minPlayers`, `maxPlayers`, `actionPointsPerTurn`, `initialPeak`, `initialVigor`, `baseHealth`, `initialGold`, `initialHandSize`); código `LAB_CONFIG_INVALID` (400, `details.fields`); rotas só em dev (404 em release).

- [x] **T-04 — Domínio `GameConfig` (REQ-09, exceto a mescla do salvo sobre os padrões, que fica na T-05; regras de REQ-05 a REQ-07).** TDD unitário: `GameConfig` + `defaults.ts` + limites (D-11, D-12), porta `GameConfigRepository`, `test/repositories/in-memory-game-config-repository.ts`, os três casos de uso e `LabConfigInvalidError`. **Verificação:** `npx vitest related --run` verde; `domain-guard --all` limpo.
- [ ] **T-05 — Persistência da config (D-13).** Schema Drizzle `game_config`, **primeira migração**, mapper (mescla sobre os padrões, REQ-09: chave salva que não existe mais é ignorada, chave nova usa o padrão, com teste; valor salvo fora dos limites atuais também cai no padrão, porque `GameConfig.create` não revalida), `DrizzleGameConfigRepository`, provider no `DatabaseModule`. **Verificação:** e2e do repositório (salvar, ler, apagar) em schema isolado; `drizzle-kit` gera a migração sem diferença pendente.
- [ ] **T-06 — Rotas do laboratório (REQ-04 a REQ-08).** TDD e2e Supertest primeiro (um `it` por REQ, com os valores do contrato). `LAB_ENABLED` no env (D-14), `LabModule` condicional, controllers, presenter `LabConfigPresenter`, pipe do corpo, mapeamento `DomainError` → status no filtro, `client.http`. **Verificação:** `npm run test:e2e` verde; `curl` com flag ligada e desligada. Ao final: `/contrato` marca FEAT-03 `implementado (BE)` e gera o AVISO DE FRONTEND.

## 8. Histórico

| Versão | Data | Mudança |
|---|---|---|
| 0.1 | 2026-11-13 | Versão inicial (FEAT-00): visão, arquitetura e pastas, decisões D-01 a D-04. |
| 0.2 | 2026-11-14 | Planejamento da FEAT-01 (CONTRATO v0.4): REQ-01 a REQ-03, D-05 a D-08, tarefas T-01 a T-03. |
| 0.3 | 2026-11-14 | T-01 concluída: D-05 autorizado e instalado (`@nestjs/config` segue major próprio, 12.x; TypeScript fixado em 5.x — ver devlog 001). |
| 0.4 | 2026-11-14 | T-02 concluída: D-09 (env com Zod, falha cedo sem banco, schema isolado no e2e). |
| 0.5 | 2026-11-14 | T-03 concluída: REQ-01 a REQ-03 implementados; D-10 (CORS por `CORS_ORIGIN`, filtro como `APP_FILTER`). |
| 0.6 | 2026-11-14 | Planejamento da FEAT-03: REQ-04 a REQ-09, D-11 a D-14, tarefas T-04 a T-06. FEAT-02 não tem lado backend. |
| 0.7 | 2026-11-14 | T-04 concluída: domínio `GameConfig` (REQ-09; regras de REQ-04 a REQ-07); D-11 com porta assíncrona e `delete()`; D-15 (validação e ordem de `details.fields`). Core: `Either`, `DomainError`, `ValueObject`. |

## Apêndice A — Conteúdo de teste

*(criado na FEAT-04: um conjunto pequeno e original de cartas que exercita as regras; fixture dos testes em `test/fixtures/content/`)*
