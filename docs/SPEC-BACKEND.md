# Misadventures — Especificação do backend

> **Versão da spec:** 0.1 · **Data:** 2026-11-13
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

**Bibliotecas autorizadas e instaladas:** nenhuma ainda. A FEAT-01 propõe a lista (com versões) e pede autorização. Candidatas, herdadas da organização de referência: `@nestjs/*` (core, common, platform-express, config, testing, cli), `drizzle-orm` + `drizzle-kit` + `pg`, `zod` (env, pipes, validação de conteúdo), `vitest` + `unplugin-swc` + `@swc/core` + `vite-tsconfig-paths`, `supertest`, `@faker-js/faker` (só em testes, nunca para sorteio de regra), `prettier`, `eslint`, `dotenv`.

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

## Requisitos

*(nenhum ainda; nascem no planejamento de cada FEAT via `/mudar-spec`)*

## Decisões

- **D-01 — Códigos de erro:** a lista única é CONTRATO §4. Todo `DomainError` usa um código de lá; código novo entra pelo `/contrato` antes do código.
- **D-02 — Estilo do domínio:** classes `Entity`/`AggregateRoot` com portas (organização de referência), mas sem estado global e sem fontes não determinísticas (decidido pelo autor em 2026-11-13).
- **D-03 — Banco:** PostgreSQL via Drizzle; e2e com schema isolado por execução (2026-11-13).
- **D-04 — Conteúdo:** todas as cartas são versionadas em `content/` (JSON validado por schema); não há conteúdo privado (2026-11-13).

## 4. Tarefas

*(as tarefas da FEAT-01 são escritas no planejamento dela, com `/mudar-spec FEAT-01`)*

## 8. Histórico

| Versão | Data | Mudança |
|---|---|---|
| 0.1 | 2026-11-13 | Versão inicial (FEAT-00): visão, arquitetura e pastas, decisões D-01 a D-04. |

## Apêndice A — Conteúdo de teste

*(criado na FEAT-04: um conjunto pequeno e original de cartas que exercita as regras; fixture dos testes em `test/fixtures/content/`)*
