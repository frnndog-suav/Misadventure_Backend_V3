# AGENTS.md — Misadventures Backend

Mapa enxuto para agentes de IA que trabalham neste repositório. **Não duplica regras:**
a fonte da verdade é `CLAUDE.md` (constituição deste lado) e os documentos de `docs/`.
Leia este mapa primeiro e abra os documentos apontados quando a tarefa exigir.

Este arquivo é próprio do backend; o frontend tem o seu. Não é compartilhado.

## O projeto

Motor de regras **autoritativo** do Misadventures, um TCG/RPG cooperativo jogado em
vezes alternadas. Toda regra (sorteios, cálculos, validação de ações, estado da
partida) roda aqui; o frontend só exibe o estado e envia intenções (README II.1).
Backend em TypeScript com **NestJS** e **Drizzle ORM** sobre **PostgreSQL**
(Docker Compose), arquitetura **hexagonal/DDD** (domínio puro em `src/core/` e
`src/domain/`; Nest, Drizzle e adaptadores em `src/infra/`). Hoje expõe **HTTP + JSON**
(momentos 1 e 2 do roadmap); **Socket.IO** só no momento 3 (FEAT-26). Conteúdo de
cartas como dados em `content/` (JSON validado por schema). Testes com Vitest +
Supertest, TDD.

## Mapa (onde o quê)

| Caminho                     | O que guarda                                                                                                                                              | Quando leio                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `CLAUDE.md`                 | Constituição deste lado: 16 princípios inegociáveis, fluxos de trabalho (`/tarefa`, `/contrato`…), AVISO DE FRONTEND, convenções, comandos, guardas       | Sempre; é a autoridade final                                                                 |
| `docs/SPEC-BACKEND.md`      | Comportamento do backend: arquitetura, REQs, decisões D, tarefas T (spec-anchored)                                                                        | Antes e durante qualquer implementação                                                       |
| `docs/README.md`            | Regras do jogo (Parte I) e requisitos técnicos (II). **Apêndice B = decisões registradas: não se reabre**                                                 | Para entender a regra por trás de um REQ; citar por seção (ex.: `README 19.2`), nunca copiar |
| `docs/CONTRATO.md`          | Contrato com o frontend: §1 convenções, §2 glossário, §4 códigos de erro, seções por FEAT com situação (§0)                                               | Antes de criar/alterar endpoint, campo, evento ou erro; `/contrato`                          |
| `docs/ROADMAP.md`           | Fases e features (FEAT-nn) dos dois lados; **§2 = protocolo da ponte entre repositórios**                                                                 | Para situar a FEAT; para regras de sincronização entre os lados                              |
| `docs/devlog/`              | Registro de cada etapa (formato em `docs/devlog/README.md`)                                                                                               | Antes de alterar funcionalidade: índice + entradas da área + `git log`                       |
| `.claude/skills/*/SKILL.md` | Workflows pedidos por nome (`/tarefa T-xx`, `/contrato`, `/mudar-spec`, `/retorno-frontend`, `/checar`, `/testar`, `/registrar-etapa`, `/validar-cartas`) | Quando o autor pedir o fluxo correspondente                                                  |
| `.claude/agents/*.md`       | Papéis: `test-writer`, `domain-dev`, `infra-dev`, `spec-reviewer`, `content-author`                                                                       | Para delegar ou assumir um papel do fluxo                                                    |
| `.claude/hooks/`            | Guardas: `domain-guard.mjs` (violações dos princípios 2/3/10) e `tempo.mjs` (registro de tempo)                                                           | `domain-guard.mjs --all` roda manualmente; o resto é automático no Claude Code               |

## Invariantes (resumo — autoridade: `CLAUDE.md`)

1. **O backend decide.** Toda regra roda aqui; envia valores já calculados e as listas do que o jogador pode fazer (CONTRATO §1.3). Nunca espera que o frontend calcule.
2. **Domínio puro e determinístico.** `src/core/` e `src/domain/` não importam Nest/Drizzle/infra e proibem `Math.random`, `Date.now`, `randomUUID` etc.; aleatoriedade por RNG com semente, relógio e IDs por portas.
3. **Aggregate Root + Domain Events + State Machine.** Invariantes protegidas no agregado; eventos na ordem em que acontecem, entregues por `pullDomainEvents()`.
4. **Erros como valor.** `Either<DomainError, T>`; ação inválida nunca lança exceção; todo `code` está em CONTRATO §4; infra traduz para o formato §1.4 (pt-BR).
5. **Cartas são dados e valores vêm de configuração.** Conteúdo em `content/` pela porta `CardCatalog`; valores do Apêndice A injetados, nunca fixos no código.
6. **Contrato primeiro e TDD.** Nada existe fora de `CONTRATO.md` (`/contrato` antes do código); testes Dado/Quando/Então antes da implementação; escopo fechado, uma tarefa por vez, avanço autorizado.
7. **Arquivos compartilhados nunca mudam sem aviso.** Versão incrementada, histórico registrado e **AVISO DE FRONTEND** no fim da resposta.

## Coordenação usuário ↔ IA ↔ Claude

O **autor orquestra manualmente** entre os dois repositórios: nenhum agente fala com o
frontend nem lê o outro repositório. O agente deste lado trabalha só aqui; quando o
trabalho depender do outro lado, para e mostra o aviso (seção abaixo). Os commits são
feitos pelo autor — o agente apenas sugere a mensagem (inglês, `type/short description`).

## Ponte backend ↔ frontend

- **Arquivos compartilhados** (cópias idênticas nos dois repos): `docs/README.md`,
  `docs/ROADMAP.md`, `docs/CONTRATO.md`. Quem altera incrementa a versão, registra no
  histórico e avisa; quem copia o arquivo inteiro para o outro lado é o autor.
- **Ciclo de vida da seção do contrato** (CONTRATO §0): `proposto (FE)` / `proposto (BE)`
  → `acordado` → `implementado (BE)` → `validado`. O frontend propõe; **este lado confirma**
  (`acordado`), implementa e marca `implementado (BE)` — tudo via skill `/contrato`.
- **Só um lado altera o contrato por vez.** Se os dois mexerem, vale a versão maior e
  o autor junta (ROADMAP §2).
- **Uma FEAT só fecha em `validado`**, e a validação roda no frontend, contra o backend
  real (o autor sobe o backend).
- **Mudança de regra do jogo** chega daqui para lá via README novo (Apêndice B) que o
  frontend propõe e o autor carrega.
- **AVISO DE FRONTEND**: quando o trabalho depender do frontend, a resposta termina com
  o aviso, no formato da constituição (`CLAUDE.md` → "AVISO DE FRONTEND"): por quê,
  o que levar (arquivos e versões), o que rodar lá, o que trazer de volta e o que fica
  bloqueado aqui.

## Fluxos e tempo

- Fluxos pedidos por nome ("faz a /tarefa T-xx", "/contrato FEAT-nn"…) seguem o
  `SKILL.md` correspondente em `.claude/skills/`; o sumário acima não os substitui.
- **Registro de tempo** é automático via hook (`.claude/hooks/tempo.mjs`) **no Claude
  Code**. Em outras IAs, que não executam esses hooks, as horas do devlog ficam
  **a preencher** pelo autor.
