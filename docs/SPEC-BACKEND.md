# Misadventures — Especificação do backend

> **Versão da spec:** 0.16 · **Data:** 2026-11-14
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

### FEAT-04 — Catálogo de cartas e coleções

Regras de README 3.4, 4.3, 5.1, 5.2, 14.1, 18.1, 18.2, 18.3, 24.3 (raridade) e 27. Modelo e escopo: D-18 a D-22. Formatos exatos: CONTRATO v0.11, seção FEAT-04 (`acordado`).

- **REQ-10 — Carregar o catálogo:** Dado um diretório de conteúdo válido (`CONTENT_DIR`, D-21), quando o backend sobe, então todas as coleções e cartas ficam disponíveis pela porta `CardCatalog`, sem ler disco depois do boot.
- **REQ-11 — Conteúdo inválido não sobe:** Dado um arquivo de conteúdo que viola o schema ou a integridade (REQ-15), quando o backend sobe, então o boot falha listando cada problema com `arquivo`, `id da carta` (se houver), `campo` e motivo; o mesmo relatório sai de `npm run validate:content -- <arquivo|dir>` (código de saída ≠ 0).
- **REQ-12 — Listar coleções:** Dado o catálogo carregado, quando `GET /catalog/collections`, então `200` com cada coleção (`id`, `name`, total de cartas por tipo), em ordem de `id`.
- **REQ-13 — Cartas de uma coleção:** Dado uma coleção existente, quando `GET /catalog/collections/:id/cards` (filtro opcional `?type=` com um `CardType`: `zone|attribute|equipment|item|randomEvent|combatEvent`), então `200` com as cartas no formato do contrato, ordenadas por `id`; tipo de filtro desconhecido → `400 CATALOG_QUERY_INVALID`; coleção inexistente → `404 COLLECTION_NOT_FOUND`.
- **REQ-14 — Uma carta:** Dado uma carta existente, quando `GET /catalog/cards/:id`, então `200` com a carta; inexistente → `404 CARD_NOT_FOUND`.
- **REQ-15 — Integridade do conteúdo** (cada item gera um problema em REQ-11):
  - `id` de carta único em todo o catálogo; `id` de coleção único e em `kebab-case` (sem `.`, D-22); toda carta pertence a uma coleção existente.
  - **Zona (3.4):** `title` único na coleção; `zoneType` entre os 16 tipos de 3.3; 1 a 4 setas; zona `urban` com exatamente 4 setas; ações incluem `startEvent`; zona `urban` inclui `useVault` e `saveRespawnPoint`; só zonas `urban` têm `saveRespawnPoint`.
  - **Atributo (4.3):** `basic` e `enhanced` com 1 atributo valendo 1; `basic` e `synergy` sem efeitos; `enhanced` com pelo menos 1 efeito; `synergy` com 2 a 4 atributos **diferentes**, cada um valendo 1.
  - **Equipamento (5.1):** `slot` entre as 8 categorias; `blocksShield` só em `weapon`; ajuste de preço entre ×0,8 e ×1,5; refino máx. ≤ +10 e, se refinável, materiais de refino presentes.
  - **Item (5.2):** `itemCategory` entre as 8 categorias.
  - **Evento (14.1, 18.1):** `randomEvent` com pelo menos 1 requisito; `combatEvent` com pelo menos 1 inimigo; cada inimigo com `count` ≥ 1, 1 ou mais `enemyTypes` (18.2) sem repetição, `enemyCategory` `common|elite|boss` (o chefe final é da Carta de Dimensão), elemento 0 ou 1 (16.2), vida ≥ 1, os 7 modificadores inteiros ≥ 0 e `vigor` nulo ou inteiro ≥ 0.
  - **Toda carta com raridade** tem exatamente uma, entre as 5 de 24.3; etiquetas (`tags`) sem repetição.

### FEAT-05 — Campanha solo (grupo de 1 e saves)

Regras de README 28.1 (partida e save, salvamento automático, grupos e saves, host, abandonar, encerrar sessão) e 1.3 (número de jogadores). Modelo e escopo: D-26 a D-31. Formatos exatos: CONTRATO, seção FEAT-05 (a propor pelo backend). Ajudantes de IA (FEAT-20), classe/deck/mapa/dimensão (FEAT-06), a vez (FEAT-08), combate (FEAT-13), save congelado (FEAT-19), host com vários humanos e início de sessão com todos conectados (FEAT-26) ficam fora.

- **REQ-16 — Criar grupo de 1:** Dado a configuração atual com `minPlayers ≤ 1`, quando `POST /parties` com `{ "name": "Os Teimosos", "characterName": "Lia" }`, então `201` com o grupo: `id`, `name`, `status: "idle"`, `members` com **1** membro humano (`id`, `characterName: "Lia"`, `isHost: true`), `createdAt` e `savedAt` iguais ao instante do `Clock`; o save fica gravado (um `GET` seguinte o encontra) com a cópia da `GameConfig` (REQ-23) e o estado inicial do RNG (REQ-22); o agregado registra `PartyCreated` (README 28.1: o jogador sozinho é um "grupo de 1"; quem cria é o host).
- **REQ-17 — Criação inválida:** Dado qualquer estado, quando `POST /parties` com corpo que não é objeto, `name` ausente/não texto/vazio após `trim`/mais de 40 caracteres, ou `characterName` igual com limite de 24, então `400` `PARTY_INVALID` com `details.fields` (`{ field, reason }`, razões `invalidBody|required|notString|blank|tooLong`, na ordem `name`, `characterName`); e, com `minPlayers > 1` na configuração, `fields` traz `{ field: "members", reason: "belowMinPlayers" }` (README 1.3, Apêndice A). **Nada** é gravado. Nomes são gravados sem espaços nas pontas.
- **REQ-18 — Listar saves:** Dado N saves, quando `GET /parties`, então `200` com o resumo de cada um (`id`, `name`, `status`, `characterNames`, `createdAt`, `savedAt`), do `savedAt` mais recente para o mais antigo (empate: `id` crescente); sem saves → `[]`. A lista é global até a FEAT-25 (D-28).
- **REQ-19 — Um save:** Dado um save existente, quando `GET /parties/:id`, então `200` com o grupo no formato de REQ-16; inexistente → `404` `PARTY_NOT_FOUND`.
- **REQ-20 — Continuar (iniciar sessão):** Dado um save `idle`, quando `POST /parties/:id/session`, então `200` com `status: "inSession"`, gravado, e `SessionStarted` registrado. Dado um save já `inSession` (ex.: a aba foi fechada sem encerrar), então `200` com o grupo **inalterado** e nenhum evento (D-29). Inexistente → `404` `PARTY_NOT_FOUND` (README 28.1: "a sessão seguinte começa de onde parou").
- **REQ-21 — Encerrar sessão:** Dado um save `inSession`, quando `POST /parties/:id/session/end`, então `200` com `status: "idle"`, `savedAt` = instante do `Clock`, gravado, e `SessionEnded` registrado (README 28.1). Dado um save `idle` → `409` `PARTY_SESSION_NOT_ACTIVE`, nada muda. A restrição "fora de combates" entra com a FEAT-13; "vale no fim da vez de outro jogador", com a FEAT-26.
- **REQ-22 — Save completo e sorteio definitivo:** Dado um grupo com RNG já usado (N sorteios), quando ele é gravado e lido de novo (repositório em memória **e** Drizzle), então o agregado lido é igual ao gravado (mesmos membros, status, datas, config e estado do RNG) e o próximo sorteio do lido é **igual** ao próximo sorteio do original (README 28.1: "voltar a um salvamento nunca gera um resultado diferente para o mesmo sorteio"). A gravação de um save é atômica (tudo ou nada).
- **REQ-23 — Configuração congelada no save:** Dado um grupo criado com `actionPointsPerTurn = 3`, quando o laboratório muda para `4` (ou é restaurado), então o grupo continua com `3` na cópia gravada (D-11); grupos criados depois usam `4`.
- **REQ-24 — Abandonar a partida:** Dado um save existente (em qualquer `status`), quando `DELETE /parties/:id`, então `204`, o save é apagado do banco e `GET /parties/:id` passa a responder `404` (README 28.1: "o save inteiro é perdido"); inexistente → `404` `PARTY_NOT_FOUND`. No solo, o único membro é sempre o host; a checagem de quem pede entra com a FEAT-26 (D-28).
- **REQ-25 — Salvamento automático (mecanismo):** Dado um caso de uso que muda um grupo, quando ele termina com sucesso, então chama `PartiesRepository.save` uma vez com o agregado inteiro e atualiza `savedAt` pelo `Clock`; quando termina com erro, nada é gravado. O gatilho "fim de cada vez" (README 28.1) é ligado na FEAT-08 sobre este mecanismo (D-30).

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
- **D-16 — Detalhes da persistência (T-05):** o `save` grava em `values` só as chaves que **diferem do padrão** (padrão mudado depois vale para quem não ajustou aquela chave). Na leitura, valor salvo que não é inteiro ou está fora dos limites atuais cai no padrão; `values` que não é objeto equivale a `{}`. Tokens `PG_POOL`/`DRIZZLE`/`Database` em `database.tokens.ts` (evita import circular entre módulo e repositórios). Migrações: `npm run db:generate` / `npm run db:migrate` (drizzle-kit); no e2e, `test/setup-e2e.ts` aplica as migrações dentro do schema da execução, com a tabela de controle do Drizzle no mesmo schema (`migrationsSchema`). Limite conhecido: `minPlayers > maxPlayers` vindo do banco (só possível se padrões/limites mudarem) não é corrigido na leitura (2026-11-14).
- **D-17 — Detalhes das rotas do laboratório (T-06):** `LAB_ENABLED` aceita só `'true'`/`'false'` (outro valor derruba o boot); `LabModule` (`src/infra/http/lab.module.ts`) entra por `ConditionalModule.registerWhen` do `@nestjs/config`, que avalia a flag **uma vez, na importação do `app.module`** (no e2e, `test/lab-app.ts` define a flag antes do import dinâmico; um valor por arquivo). Um controller por rota; o corpo do `PATCH` vai cru (`unknown`) ao caso de uso, sem pipe, porque toda a validação é do domínio (D-15). O controller converte o `left` em `DomainErrorException` (`http/errors/`), e o filtro responde com o status da tabela `DOMAIN_ERROR_STATUS`. JSON malformado chega ao filtro como `BadRequestException` sem a causa original (o Nest a descarta); por isso qualquer `HttpException` 400 em `/lab/*` vira `LAB_CONFIG_INVALID`/`invalidBody` — nenhum controller lança 400 por conta própria. Fora de `/lab/*`, 400 de transporte segue D-10 (500). `LAB_ENABLED: 'true'` no serviço `backend` do Compose (2026-11-14).

- **D-18 — Contexto `catalog` (aprovado pelo autor em 2026-11-14):** `Card` é uma união discriminada por `type` (`zone`, `attribute`, `equipment`, `item`, `randomEvent`, `combatEvent`; inimigos embutidos no `combatEvent`, README 18.1; nomes do CONTRATO §2.7 e seção FEAT-04). Cartas são **value objects imutáveis** (não são agregados: não mudam nem emitem `domainEvent`). Porta `CardCatalog` (assíncrona, sem ordem garantida: `listCollections`, `findCollection`, `listCards(collectionId)`, `findCard`; filtro e ordem ficam nos casos de uso, D-23) em `src/domain/catalog/application/repositories/`; adaptador em memória em `test/fakes/` e adaptador de arquivo em `src/infra/content/`. Casos de uso `ListCollectionsUseCase`, `ListCollectionCardsUseCase`, `GetCardUseCase`; erros `CollectionNotFoundError`, `CardNotFoundError`, `CatalogQueryInvalidError` (2026-11-14).
- **D-19 — Fora desta FEAT (aprovado pelo autor em 2026-11-14):** Carta de Dimensão (FEAT-06/19), missões (FEAT-15), montarias (FEAT-18), boosters como conteúdo (FEAT-16), limite de cópias no deck e trava (FEAT-09), estado de partida da carta (quebrado, "Reparado ×N", nível de refino atual — FEAT-17). Ofertas de serviço da zona (3.4: estoque do mercado, montarias do estábulo, encantamentos do ferreiro) também ficam fora; entram com as FEATs 16 a 18.
- **D-20 — Efeitos, requisitos, coisa boa/ruim e habilidades como texto (aprovado pelo autor em 2026-11-14):** o modelo estruturado de efeitos é da FEAT-11 (README 13, III.3). Nesta FEAT, esses campos são `{ text: string }` (pt-BR, para exibição); a estrutura troca o tipo depois sem mudar o resto da carta. Requisitos de atributo do evento aleatório também são texto até a FEAT-12.
- **D-21 — Leitura do conteúdo (aprovado pelo autor em 2026-11-14):** `content/<coleção>/collection.json` + `content/<coleção>/<tipo>.json`, validados por schema Zod em `src/infra/content/` e pelas regras de REQ-15 (as de integridade em função pura do domínio, testável sem disco). Diretório pelo env `CONTENT_DIR` (padrão `content`); o e2e aponta para `test/fixtures/content/`. Catálogo carregado uma vez no boot (conteúdo só muda com novo deploy, README 27). Script `npm run validate:content -- <caminho>` reusa o mesmo validador.
- **D-22 — Ids e nomes:** `id` de coleção em `kebab-case` (sem `.`, para o prefixo das cartas não ficar ambíguo; decisão do autor, 2026-11-14); `id` de carta em `kebab-case` com prefixo da coleção (`<coleção>.<slug>`), estável entre versões (saves vão referenciá-lo a partir da FEAT-05). Valores de enum em inglês `camelCase` no JSON (glossário do CONTRATO §2); textos de exibição em pt-BR.
- **D-23 — Detalhes do domínio do catálogo (T-07):** cartas são **tipos `readonly`** (uniões discriminadas em `enterprise/value-objects/card/`, espelhando o contrato), sem classes `ValueObject`: são dados sem comportamento. Os enums são `const` arrays no mesmo arquivo (fonte única para o schema Zod da T-08). A integridade de REQ-15 é a função pura `checkCatalogIntegrity` em `enterprise/catalog-integrity/`: cobre o que o tipo não expressa (unicidade, faixas, inteiros, regras entre campos, forma do `id` de D-22); a pertinência aos enums é garantida pelo tipo e conferida pelo schema no infra. Cada problema é `{ collectionId, cardId, field, reason }` (`field` é um caminho, ex.: `enemies[0].health`; `reason` é um código em inglês), na ordem das coleções e das cartas recebidas; o infra acrescenta o arquivo e o texto em pt-BR (REQ-11). `urbanZoneRequiresFourArrows` só é conferida quando as setas já estão entre 1 e 4 (`outOfRange` tem precedência). Ordem por `id` = comparação por código de caractere. Em `ListCollectionCards`, o filtro `type` é conferido **antes** da existência da coleção (pedido malformado → 400 mesmo com coleção inexistente) (2026-11-14).
- **D-24 — Formato e leitura do conteúdo (T-08):** a pasta é o `id` da coleção; `collection.json` = `{ "name" }`; cada `<tipo>.json` (`zone`, `attribute`, `equipment`, `item`, `randomEvent`, `combatEvent`) é um array de cartas no formato do contrato **sem** `type` e `collectionId`, que o leitor deriva do caminho (decisão do autor). Objetos estritos (campo desconhecido é problema); tipo sem arquivo = 0 cartas; arquivo desconhecido na pasta da coleção ou solto na raiz é problema. Schemas em `src/infra/content/card-schemas.ts` (enums de D-23), mensagens do Zod em pt-BR (locale `ptBR`). `loadContent(caminho)` aceita a raiz, a pasta de uma coleção ou um arquivo dela (valida a coleção inteira) e junta todos os problemas: arquivo/schema primeiro (raiz, depois cada coleção em ordem de nome) e por fim a integridade (REQ-15) das cartas que passaram no schema; `id` repetido aponta todos os arquivos em que aparece. Relatório: uma linha `- <arquivo> | carta <id> | campo <campo>: <motivo>`. `ContentModule` (global) entrega a porta `CardCatalog` (`ContentCardCatalog`, em memória) e derruba o boot com `InvalidContentError`. `npm run validate:content -- <caminho>` = `nest build` + `node dist/infra/content/validate-content.cli.js` (sem lib nova; saída ≠ 0 com problemas). O caminho é resolvido para absoluto antes de derivar ids. Com `collection.json` ausente ou inválido, a coleção entra com `name: ''` só para não gerar `unknownCollection` em cascata (o problema do arquivo já reprova o conteúdo). O e2e usa `CONTENT_DIR=test/fixtures/content` (`test/setup-e2e.ts`); `CONTENT_DIR` é lido na importação do `app.module`, então um valor por arquivo de teste; a imagem Docker copia `content/`. `content/base` é uma coleção provisória escrita pelo agente (1 carta por tipo, 2 zonas), a ser trocada pelo autor (2026-11-14).
- **D-25 — Rotas do catálogo (T-09):** as rotas `/catalog/*` ficam no `HttpModule` (sempre ligadas, ao contrário do laboratório), com os três casos de uso injetados com a porta `CardCatalog` do `ContentModule`. Um controller por rota. O `?type=` vai cru (`unknown`) ao caso de uso, sem pipe (D-23): `?type=` vazio ou repetido também vira `CATALOG_QUERY_INVALID`. `CardPresenter` devolve a carta como está, porque os tipos do domínio espelham o contrato campo a campo (D-23); `CollectionPresenter` copia `id`, `name` e `cardCounts`. A ordem das chaves no JSON não faz parte do contrato. `DOMAIN_ERROR_STATUS` ganha `CATALOG_QUERY_INVALID` → 400, `COLLECTION_NOT_FOUND` e `CARD_NOT_FOUND` → 404 (2026-11-14).

- **D-26 — Core do agregado e das portas (proposta, FEAT-05):** nascem em `src/core/`: `UniqueEntityID` (recebe o valor, não gera), `Entity<Props>`, `AggregateRoot<Props>` (`addDomainEvent` em ordem, `pullDomainEvents()` devolve e limpa), interface `DomainEvent` (`type`, `occurredAt`, `aggregateId`), portas `Clock` (`now(): Date`), `IdGenerator` (`next(): UniqueEntityID`) e `SeedGenerator` (`next(): number`, a única fonte de entropia, só no infra com `node:crypto`). **RNG:** `SeededRng` puro em `src/core/rng/`, algoritmo **sfc32** (estado = 4 inteiros de 32 bits, serializável como `RngState`), métodos `nextUint32()`, `nextInt(min, max)` (inclusivo, sem viés por rejeição) e `state()`; `SeededRng.fromSeed(seed)` e `SeededRng.fromState(state)`. Prós: sem biblioteca nova, estado pequeno, determinístico entre plataformas. Contra: não é criptográfico (irrelevante para jogo). Fakes: `fixedClock`, `sequentialIds`, `fixedSeed` em `test/fakes/`; adaptadores `SystemClock`, `UuidIdGenerator` (`randomUUID`), `CryptoSeedGenerator` em `src/infra/{clock,ids,rng}/`.
- **D-27 — Contexto `campaign` e agregado `Party` (proposta):** `Party` é o save (README 28.1: o grupo **é** o save). Props: `name`, `members: PartyMember[]` (entidade com `characterName`, `kind: 'human'`; `'ai'` entra na FEAT-20), `hostMemberId`, `status` (máquina de estados por união discriminada: `idle` ↔ `inSession`; `frozen` entra na FEAT-19), `config` (cópia dos valores da `GameConfig` na criação, D-11), `rngState`, `createdAt`, `savedAt`. Membros só entram em `Party.create` (README 28.1: o grupo não aceita jogadores depois de criado; não há método para adicionar). Eventos: `PartyCreated`, `SessionStarted`, `SessionEnded`, `PartyAbandoned` (este último registrado antes de apagar, para o despacho). Porta `PartiesRepository` (`create`, `save`, `findById`, `findAll`, `delete`). Casos de uso `CreateParty`, `ListParties`, `GetParty`, `StartSession`, `EndSession`, `AbandonParty`; erros `PartyInvalidError` (`PARTY_INVALID`, 400), `PartyNotFoundError` (`PARTY_NOT_FOUND`, 404), `PartySessionNotActiveError` (`PARTY_SESSION_NOT_ACTIVE`, 409). O `CreateParty` lê a config por `GetGameConfigUseCase`/`GameConfigRepository` (REQ-09).
- **D-28 — Sem dono até a autenticação (decisão do autor, 2026-11-14):** a lista de saves é **global** no servidor; não há identidade de jogador nos pedidos. O host é o único membro (solo). Nada sobre autenticação é proposto aqui (README II.1, F29).
- **D-29 — Continuar é idempotente:** `POST /parties/:id/session` num save já `inSession` devolve o grupo sem mudar nada. Motivo: no solo, fechar a aba sem "Encerrar sessão" deixaria o save preso em `inSession` sem forma de voltar; a regra "a sessão só começa com todos conectados" é da FEAT-26. Alternativa recusada: 409 (travaria o jogador).
- **D-30 — Salvamento automático (decisão do autor, 2026-11-14):** a FEAT-05 entrega o **mecanismo** (save completo, atômico, com estado do RNG e config copiada; cada caso de uso que muda o grupo grava ao terminar com sucesso). O gatilho do README ("no fim de cada vez") é ligado na FEAT-08. Os campos de nome são: `name` do grupo (1–40) e `characterName` (1–24), ambos obrigatórios (decisão do autor, 2026-11-14). Abandonar **apaga** o save (decisão do autor, 2026-11-14).
- **D-31 — Persistência do save (proposta):** tabela `parties` com colunas consultáveis (`id` uuid, `name`, `status`, `created_at`, `saved_at`) e `state jsonb` (membros, host, config, `rngState`) com `schemaVersion: 1`. Prós: as FEATs 06 a 19 acrescentam estado (mapa, decks, mercados…) sem migração de tabela a cada uma; o save é gravado numa única linha (atômico sem transação extra). Contra: o conteúdo do `jsonb` não é validado pelo banco — o mapper valida com Zod na leitura e a evolução do formato passa por `schemaVersion` + função de atualização no mapper. Alternativa recusada: tabelas normalizadas por parte do estado (muitas migrações e junções para ler um save inteiro).
- **D-32 — Detalhes do core (T-10):** pastas `src/core/entities/{unique-entity-id,entity}/`, `events/domain-event/`, `pattern/aggregate-root/`, `ports/{clock,id-generator,seed-generator}/`, `rng/seeded-rng/`. `AggregateRoot<Props, Event extends DomainEvent = DomainEvent>`: o segundo parâmetro é a união de eventos do contexto. `Entity.equals` compara só o `id`. **sfc32:** semeadura do PractRand (`a=0, b=seed, c=0, contador=1`, descarta 12 saídas); semente inteira em [0, 2^32−1]; `nextInt` aceita inteiros seguros com faixa de até 2^32 valores. Argumentos inválidos de `fromSeed`/`fromState`/`nextInt` lançam `RangeError`: são erro de programação, não regra do jogo (exceção explícita à Constituição 5); por isso o mapper da T-12 valida o `rngState` com Zod **antes** de `fromState`. Os valores de referência dos testes vieram de uma implementação independente em Go. Fakes `fixedClock`, `sequentialIds`, `fixedSeed` são fábricas que devolvem subclasses das portas. Ambiente: no Windows, rodar o Vitest pelo PowerShell (`D:`); no Git Bash o caminho `d:` minúsculo carrega o Vitest duas vezes ("failed to find the current suite") (2026-11-14).

## 4. Tarefas

### FEAT-01 — Esqueleto técnico

Contrato necessário: CONTRATO v0.4, seção FEAT-01 (`acordado`) — `GET /health`, `NOT_FOUND`, `INTERNAL_ERROR`. Nada falta no contrato.

- [x] **T-01 — Ferramentas e esqueleto NestJS.** Instalar as bibliotecas de D-05 (fixar e registrar versões); `tsconfig.json`/`tsconfig.build.json` com `@/*` → `src/*`; `nest-cli.json` (entryFile `infra/main`); `vitest.config.ts` (unitários) e `vitest.config.e2e.ts` (e2e, `setupFiles: test/setup-e2e.ts`); Prettier (sem ponto e vírgula, aspas simples, vírgula final es5); ESLint com as regras do `domain-guard` para `src/core/` e `src/domain/`; `.gitignore`; `src/infra/main.ts` + `app.module.ts` mínimos subindo na porta do env; scripts npm de CLAUDE.md (menos `validate:content`, que nasce com o validador na FEAT-04). **Verificação:** `npm run build`, `typecheck`, `lint`, `format:check` passam; `npm run start:dev` sobe.
- [x] **T-02 — Docker Compose, env e base do Drizzle.** `docker-compose.yml` (serviços `postgres` e `backend`, com Dockerfile); `.env.example` (`PORT`, `DATABASE_URL`); `src/infra/env/` (schema Zod + `EnvModule`/`EnvService`, app não sobe com env inválido); `drizzle.config.ts`; `src/infra/database/database.module.ts` com a conexão `pg` (sem tabelas ainda — o primeiro schema nasce com o primeiro agregado persistido); `test/setup-e2e.ts` com schema Postgres único por execução e limpeza (D-03). **Verificação:** `docker compose up -d` sobe banco e backend; app conecta no banco; env inválido derruba o boot com mensagem clara.
- [x] **T-03 — `GET /health` e filtro de erros (REQ-01, REQ-02, REQ-03).** TDD: e2e Supertest primeiro, um teste por REQ (`it('REQ-01: …')`), cenários com os valores exatos do CONTRATO FEAT-01. Depois: `src/infra/http/contract-version.ts` (D-06), `controllers/health/index.controller.ts` (D-07), exception filter global em `http/errors/` (D-08), `http.module.ts`, CORS liberado para a origem do frontend (env), `client.http` com os dois cenários do contrato. **Verificação:** `npm run test:e2e` verde; `curl` dos cenários responde byte a byte o contrato. Ao final: `/contrato` marca FEAT-01 `implementado (BE)` e gera o AVISO DE FRONTEND.

### FEAT-03 — Esqueleto do laboratório

Contrato necessário (seção FEAT-03, a propor pelo backend com `/contrato FEAT-03` **antes da T-04**): `GET /lab/config`, `PATCH /lab/config`, `POST /lab/config/reset`; tipo `LabConfig` (`values`, `defaults`, `limits`); glossário das chaves (`minPlayers`, `maxPlayers`, `actionPointsPerTurn`, `initialPeak`, `initialVigor`, `baseHealth`, `initialGold`, `initialHandSize`); código `LAB_CONFIG_INVALID` (400, `details.fields`); rotas só em dev (404 em release).

- [x] **T-04 — Domínio `GameConfig` (REQ-09, exceto a mescla do salvo sobre os padrões, que fica na T-05; regras de REQ-05 a REQ-07).** TDD unitário: `GameConfig` + `defaults.ts` + limites (D-11, D-12), porta `GameConfigRepository`, `test/repositories/in-memory-game-config-repository.ts`, os três casos de uso e `LabConfigInvalidError`. **Verificação:** `npx vitest related --run` verde; `domain-guard --all` limpo.
- [x] **T-05 — Persistência da config (D-13, D-16).** Schema Drizzle `game_config`, **primeira migração**, mapper (mescla sobre os padrões, REQ-09: chave salva que não existe mais é ignorada, chave nova usa o padrão, com teste; valor salvo fora dos limites atuais também cai no padrão, porque `GameConfig.create` não revalida), `DrizzleGameConfigRepository`, provider no `DatabaseModule`. **Verificação:** e2e do repositório (salvar, ler, apagar) em schema isolado; `drizzle-kit` gera a migração sem diferença pendente.
- [x] **T-06 — Rotas do laboratório (REQ-04 a REQ-08, D-17).** TDD e2e Supertest primeiro (um `it` por REQ, com os valores do contrato). `LAB_ENABLED` no env (D-14), `LabModule` condicional, controllers, presenter `LabConfigPresenter`, pipe do corpo, mapeamento `DomainError` → status no filtro, `client.http`. **Verificação:** `npm run test:e2e` verde; `curl` com flag ligada e desligada. Ao final: `/contrato` marca FEAT-03 `implementado (BE)` e gera o AVISO DE FRONTEND.

### FEAT-04 — Catálogo de cartas e coleções

Contrato: CONTRATO v0.11, seção FEAT-04 `acordado` (2026-11-14) — `GET /catalog/collections`, `GET /catalog/collections/:id/cards` (`?type=`), `GET /catalog/cards/:id`; tipos `CollectionSummary` e `Card` (união por `type`, com `ZoneCard`, `AttributeCard`, `EquipmentCard`, `ItemCard`, `EventCard`, `Enemy`); glossário dos enums (tipos de zona, ações, atributos, tipos de carta de atributo, slots de equipamento, categorias de item, raridades, tipos e categorias de inimigo, elementos, perfis de IA); códigos `COLLECTION_NOT_FOUND` (404), `CARD_NOT_FOUND` (404), `CATALOG_QUERY_INVALID` (400).

- [x] **T-07 — Domínio do catálogo (REQ-15; regras de REQ-12 a REQ-14).** TDD unitário: tipos de `Card` (D-18, D-20, D-22), função de integridade de REQ-15 (um teste por regra), porta `CardCatalog`, `test/fakes/in-memory-card-catalog.ts`, os três casos de uso e os três erros. **Verificação:** `npx vitest related --run` verde; `domain-guard --all` limpo.
- [x] **T-08 — Conteúdo e validador (REQ-10, REQ-11, D-21).** Inclui o alinhamento do domínio à regra nova de REQ-15 (`id` de coleção em `kebab-case`, D-22): teste e checagem em `checkCatalogIntegrity` (`invalidIdFormat` no `id` da coleção). Schema Zod em `src/infra/content/`, leitor de `CONTENT_DIR` (env), script `validate:content`; conteúdo de teste do Apêndice A em `test/fixtures/content/` (agente `content-author`) e uma coleção inicial em `content/`. Testes: fixture válida carrega; um arquivo inválido por regra gera o relatório esperado. **Verificação:** `npm run validate:content -- content` e `-- test/fixtures/content` limpos; backend não sobe com fixture inválida.
- [x] **T-09 — Rotas do catálogo (REQ-12 a REQ-14).** TDD e2e Supertest primeiro (um `it` por REQ, valores do contrato), controllers, `CardPresenter`/`CollectionPresenter`, mapeamento dos novos códigos no `DOMAIN_ERROR_STATUS`, `client.http`. **Verificação:** `npm run test:e2e` verde; `curl` dos cenários. Ao final: `/contrato` marca FEAT-04 `implementado (BE)` e gera o AVISO DE FRONTEND.

### FEAT-05 — Campanha solo (grupo de 1 e saves)

Contrato necessário (seção FEAT-05, a propor pelo backend com `/contrato FEAT-05` **antes da T-11**): `POST /parties`, `GET /parties`, `GET /parties/:id`, `POST /parties/:id/session`, `POST /parties/:id/session/end`, `DELETE /parties/:id`; tipos `Party`, `PartyMember`, `PartySummary`, `PartyStatus` (`idle|inSession`); corpo `CreatePartyRequest` (`name`, `characterName`); glossário (`party`, `member`, `host`, `characterName`, `session`); códigos `PARTY_INVALID` (400, `details.fields`), `PARTY_NOT_FOUND` (404), `PARTY_SESSION_NOT_ACTIVE` (409).

- [x] **T-10 — Core: agregado, eventos, portas e RNG com semente (D-26; parte RNG de REQ-22).** TDD unitário: `UniqueEntityID`, `Entity`, `AggregateRoot` (eventos em ordem, `pullDomainEvents` limpa), `DomainEvent`, portas `Clock`/`IdGenerator`/`SeedGenerator`, `SeededRng` (mesma semente → mesma sequência; `fromState(state())` continua igual; `nextInt` dentro da faixa e com valores de referência fixos do sfc32), fakes em `test/fakes/`. **Verificação:** `npx vitest related --run` verde; `domain-guard --all` limpo.
- [ ] **T-11 — Domínio `campaign` (regras de REQ-16 a REQ-21, REQ-23 a REQ-25; REQ-22 no repositório em memória).** TDD unitário: `Party` + `PartyMember` + máquina de estados + eventos (D-27), porta `PartiesRepository`, `test/repositories/in-memory-parties-repository.ts`, factory `make-party`, os seis casos de uso e os três erros. **Verificação:** `npx vitest related --run` verde; `domain-guard --all` limpo.
- [ ] **T-12 — Persistência do save e adaptadores (REQ-22 no Drizzle, D-31).** Schema Drizzle `parties` + **migração**, `DrizzlePartyMapper` (Zod no `state`, `schemaVersion`), `DrizzlePartiesRepository`, providers no `DatabaseModule`; adaptadores `SystemClock`, `UuidIdGenerator`, `CryptoSeedGenerator`. **Verificação:** e2e do repositório (criar, salvar, ler com RNG idêntico, listar ordenado, apagar) em schema isolado; `drizzle-kit` sem diferença pendente.
- [ ] **T-13 — Rotas da campanha (REQ-16 a REQ-21, REQ-23, REQ-24).** TDD e2e Supertest primeiro (um `it` por REQ, valores do contrato), controllers, `PartyPresenter`/`PartySummaryPresenter`, códigos novos no `DOMAIN_ERROR_STATUS` (corpo JSON malformado em `/parties` → `PARTY_INVALID`/`invalidBody`, como D-17), `client.http`. **Verificação:** `npm run test:e2e` verde; `curl` dos cenários. Ao final: `/contrato` marca FEAT-05 `implementado (BE)` e gera o AVISO DE FRONTEND.

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
| 0.8 | 2026-11-14 | T-05 concluída: tabela `game_config`, primeira migração, mapper com a mescla de REQ-09, `DrizzleGameConfigRepository`; D-16. |
| 0.9 | 2026-11-14 | T-06 concluída: rotas `/lab/config` (REQ-04 a REQ-08), `LAB_ENABLED`, mapeamento `DomainError` → status; D-17. Lado BE da FEAT-03 completo. |
| 0.10 | 2026-11-14 | Planejamento da FEAT-04: REQ-10 a REQ-15, D-18 a D-22 (aprovadas pelo autor), tarefas T-07 a T-09; nomes alinhados ao CONTRATO v0.10 (`randomEvent`/`combatEvent`, `synergy`, `saveRespawnPoint`; ofertas de serviço fora). |
| 0.11 | 2026-11-14 | T-07 concluída: domínio `catalog` (tipos das cartas, `checkCatalogIntegrity`, porta `CardCatalog`, três casos de uso e três erros); D-18 com a assinatura final da porta; D-23. |
| 0.12 | 2026-11-14 | REQ-15 e D-22: `id` de coleção em `kebab-case`, sem `.` (decisão do autor); implementação entra na T-08. |
| 0.13 | 2026-11-14 | T-08 concluída: `invalidIdFormat` no `id` de coleção; leitor/validador de conteúdo, `ContentModule`, `CONTENT_DIR`, `validate:content`, fixture e coleção `base`; D-24. |
| 0.14 | 2026-11-14 | T-09 concluída: rotas `/catalog/*`, `CardPresenter`/`CollectionPresenter`, códigos do catálogo no `DOMAIN_ERROR_STATUS`; D-25. |
| 0.15 | 2026-11-14 | Planejamento da FEAT-05: REQ-16 a REQ-25, D-26 a D-31 (D-28 e D-30 decididas pelo autor; D-26, D-27, D-29 e D-31 propostas), tarefas T-10 a T-13. |
| 0.16 | 2026-11-14 | T-10 concluída: core (`UniqueEntityID`, `Entity`, `AggregateRoot`, `DomainEvent`, portas `Clock`/`IdGenerator`/`SeedGenerator`, `SeededRng` sfc32) e fakes; D-32. |

## Apêndice A — Conteúdo de teste

*(criado na FEAT-04: um conjunto pequeno e original de cartas que exercita as regras; fixture dos testes em `test/fixtures/content/`)*
