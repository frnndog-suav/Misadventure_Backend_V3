# Misadventures — Backend

Motor de regras **autoritativo** do Misadventures, um TCG/RPG cooperativo jogado em vezes alternadas. Toda regra (sorteios, cálculos, validação de ações, estado da partida) roda aqui; o frontend só exibe o estado e envia intenções (README II.1). Expõe HTTP + JSON nos momentos 1 e 2 e Socket.IO no momento 3.

## Fontes da verdade

| Documento | O que guarda | Onde vive |
|---|---|---|
| [`docs/README.md`](docs/README.md) | **Regras do jogo** e requisitos técnicos. Decisões do autor no Apêndice B. | Compartilhado (cópia idêntica no frontend) |
| [`docs/SPEC-BACKEND.md`](docs/SPEC-BACKEND.md) | **Comportamento do backend**: arquitetura, REQ, decisões D, tarefas T. Spec-anchored. | Só no backend |
| [`docs/CONTRATO.md`](docs/CONTRATO.md) | **Contrato com o frontend**: convenções, glossário, endpoints, tipos, códigos de erro. | Compartilhado |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | **Fases e features** (FEAT-nn) dos dois lados e o protocolo entre os repositórios (§2). | Compartilhado |
| [`docs/devlog/`](docs/devlog/README.md) | Registro de cada etapa. | Só no backend |

Toda mudança de comportamento começa na spec. Mudança de **regra do jogo** começa no README (Apêndice B). Mudança no que se troca com o frontend começa no contrato.

**Arquivos compartilhados** (`docs/README.md`, `docs/ROADMAP.md`, `docs/CONTRATO.md`): nunca altere sem avisar o autor. Ao alterar: incremente a versão, registre no histórico do arquivo e termine com um **AVISO DE FRONTEND**.

## Constituição (princípios inegociáveis)

1. **O backend decide.** Toda regra do README roda aqui, inclusive no jogo solo. O backend envia valores já calculados e as listas do que o jogador pode fazer (CONTRATO §1.3); nunca espera que o frontend calcule.
2. **O domínio é puro (hexagonal).** `src/core/` e `src/domain/` não importam `@nestjs/*`, `drizzle-orm`, `@/infra`, nem usam `process.env`, `node:fs`, `fetch` ou `console`. Casos de uso dependem só de **portas** (classes abstratas em `application/repositories/` e `core/ports/`). Adaptadores e a ligação com o Nest (providers, módulos) ficam em `src/infra/`.
3. **O domínio é determinístico.** Aleatoriedade por **RNG com semente** (estado salvo junto com o agregado; README 28.1: sorteio feito é definitivo). Relógio e geração de IDs entram por portas (`Clock`, `IdGenerator`). Proibido em `src/core/` e `src/domain/`: `Math.random`, `Date.now`, `new Date()`, `randomUUID`, `node:crypto`.
4. **Aggregate Root, Domain Events e State Machine.** Cada agregado protege suas invariantes; registra seus `domainEvent` **na ordem em que acontecem** e os entrega com `pullDomainEvents()`. Não há registro global estático de eventos no domínio; o despacho é do infra. A partida é uma máquina de estados: ação fora da fase é rejeitada com erro.
5. **Erros como valor.** Casos de uso retornam `Either<DomainError, T>`; todo `DomainError` tem um `code` listado em CONTRATO §4. Ação inválida nunca lança exceção. O infra traduz para HTTP no formato de CONTRATO §1.4 (mensagem em pt-BR).
6. **Cartas são dados.** O conteúdo fica em `content/` (JSON validado por schema) e entra pela porta `CardCatalog`. O domínio não conhece nenhuma carta específica: regra que surge de uma carta é generalizada.
7. **Valores ajustáveis vêm de configuração.** Os valores do Apêndice A do README entram por uma configuração injetada (base do laboratório, FEAT-03), nunca como número fixo espalhado no código.
8. **Contrato primeiro.** Nenhum endpoint, campo, evento ou código de erro existe fora de `docs/CONTRATO.md`. Algo novo → `/contrato` antes do código.
9. **TDD.** Todo REQ tem testes escritos a partir dos critérios Dado/Quando/Então antes da implementação: unitários no domínio (repositórios em memória, RNG/relógio/IDs fixos) e e2e com Supertest nos controllers. Ao fim de uma tarefa, rodam só os testes afetados.
10. **Tipagem estrita.** Sem `any` (use `unknown` + validação). Uniões discriminadas por `type` para ações, eventos e variantes, com `switch` exaustivo (`const _exhaustive: never = x`).
11. **Escopo fechado.** Só o que a tarefa pede. Ambiguidade real vira pergunta com uma opção recomendada.
12. **Regras do jogo: o README é a fonte.** Cite por seção (`README 19.2`), nunca copie. Leia o Apêndice B antes de apontar contradição (as decisões ali não se reabrem). Só sinalize o que **impede a implementação**; o resto segue a regra 4 do Apêndice B.
13. **Idioma.** Identificadores, rotas e contrato em **inglês**; mensagens para o jogador em **pt-BR**. O glossário de CONTRATO §2 faz a ponte.
14. **Dependências mínimas.** Toda biblioteca precisa de autorização do autor (README II.2). As autorizadas estão na spec §3.2.
15. **Avanço autorizado.** Uma tarefa por vez. Ao terminar, pare, entregue o **roteiro de testes** e espere autorização explícita para a próxima.
16. **Rastreabilidade.** Cada etapa gera uma entrada no devlog.

## Instruções obrigatórias (README III.1)

Valem para o agente principal e para todos os agentes de desenvolvimento:

- "Não disfarce suas dúvidas. Explicite as vantagens e desvantagens de cada escolha."
- "Implemente apenas o necessário para resolver o problema. Não acrescente nada baseado em suposições."
- "Modifique apenas o que for indispensável. Corrija ou limpe tudo aquilo que suas próprias alterações deixarem para trás."
- "Estabeleça critérios claros para considerar a tarefa concluída. Continue iterando até confirmar que eles foram atendidos."

## AVISO DE FRONTEND (quando o autor precisa agir no outro repositório)

O frontend fica em outro repositório e **o autor leva as informações de um lado para o outro** (README III.2, ROADMAP §2). Sempre que o trabalho depender do frontend, **pare e mostre**, no fim da resposta:

```
AVISO DE FRONTEND — FEAT-nn
Por quê: <o que depende do frontend>
Leve para o frontend: <arquivos e versões, ex.: docs/CONTRATO.md v0.3 (seção FEAT-05)>
Rode lá: <o que pedir na sessão do frontend, ex.: "/retorno-backend <resposta>">
Traga de volta: <o que colar aqui depois>
Enquanto isso, aqui: <o que segue / o que fica bloqueado>
```

Mostre o aviso quando:
1. o contrato for criado, confirmado ou alterado (`/contrato`);
2. o lado backend de uma FEAT ficar `implementado (BE)` e faltar o frontend validar contra o backend real (inclui como subir o backend);
3. o README ou o ROADMAP mudarem (o frontend precisa da cópia nova);
4. uma tarefa precisar de algo que o contrato ainda não tem (não contorne: pare e avise).

Junto do aviso, diga ao autor, em lista, **o que ele faz agora**: commit (com a mensagem), reiniciar a sessão se `.claude/` mudou, e se deve ir ao frontend antes de continuar aqui.

## Fluxo de trabalho

| Quero… | Use |
|---|---|
| Implementar uma tarefa | `/tarefa T-xx` |
| Mudar um comportamento, ou planejar uma FEAT do roadmap em REQs e tarefas | `/mudar-spec <descrição>` |
| Confirmar, pedir mudança ou propor o contrato de uma FEAT; marcar `implementado (BE)` | `/contrato <FEAT-nn ou resposta do frontend>` |
| Aplicar o que veio do frontend (resultado de validação, README/ROADMAP novos) | `/retorno-frontend <conteúdo colado>` |
| Conferir a definição de pronto | `/checar` |
| Rodar os testes afetados (ou `tudo`) | `/testar` |
| Registrar uma etapa no devlog | `/registrar-etapa` (a `/tarefa` já chama) |
| Validar um arquivo de cartas | `/validar-cartas <arquivo>` |

**Antes de alterar qualquer funcionalidade**, consulte o índice do devlog e as entradas da área, e rode `git log --oneline -- <arquivos>`, para entender por que o código está como está.

Agentes (`.claude/agents/`):
- `test-writer`: escreve os testes (unitários e e2e Supertest) a partir dos critérios, antes da implementação.
- `domain-dev`: implementa `src/core/` e `src/domain/` (entidades, agregados, casos de uso, portas) até os testes passarem.
- `infra-dev`: implementa `src/infra/` (Nest, controllers, presenters, Drizzle, Docker, adaptadores de conteúdo/RNG/relógio).
- `spec-reviewer`: revisão somente leitura contra a spec, o contrato e esta constituição.
- `content-author`: escreve e corrige cartas em `content/` no formato da spec.

## Stack (autorizada)

TypeScript, NestJS, Drizzle ORM, PostgreSQL, Docker Compose, Vitest, Supertest; Socket.IO só no momento 3 (FEAT-26). Ferramentas de apoio (Prettier, ESLint, SWC, paths, Zod, faker…) são propostas e autorizadas na FEAT-01 (spec §3.2). Hoje **nada está instalado**. Qualquer outra lib: pergunte.

## Convenções

- **Arquitetura e pastas:** spec §3.2 (árvore completa). Alias `@/*` → `src/*`. Uma pasta por unidade com `index.ts` (`use-cases/create-party/index.ts`).
- **Testes:** unitários ao lado (`index.ts` → `index.test.ts`), com repositórios em memória (`test/repositories/`), factories (`test/factories/make-<x>/`) e fakes determinísticos (`test/fakes/`: `fixedRng`, `fixedClock`, `sequentialIds`). E2E de controller ao lado (`index.controller.e2e-spec.ts`), com Supertest e banco isolado por execução. O nome de cada teste cita o requisito: `it('REQ-12: …')`.
- **Erros:** classes de `DomainError` em `application/use-cases/_errors/`, cada uma com `code` do CONTRATO §4.
- **Estilo:** Prettier (sem ponto e vírgula, aspas simples, vírgula final es5) a partir da FEAT-01. Rode `npm run format` antes de terminar.
- **Verificação:** cada tarefa é verificada pelos testes, por comando (`curl`/`client.http`) e pelo roteiro de testes. Nenhum endpoint de depuração fora do laboratório.
- **Commits:** o autor faz. O agente só sugere a mensagem, sempre **em inglês**, no formato `type/short description in lowercase` (ex.: `chore/backend foundation`).
- **Docker (manual, só o autor):** o agente **nunca** abre ou fecha o Docker Desktop nem roda/para containers (`docker compose up/down/start/stop/restart/build`, `docker run/stop`). Quando algo precisar do Docker (e2e, migração, roteiro de testes), **pare e peça ao autor**: abrir o Docker Desktop e qual comando rodar (ex.: `docker compose up -d postgres`); ao terminar, diga o que ele pode derrubar. Comandos só de leitura (`docker compose ps`, `docker compose logs`) são permitidos para conferir o estado.
- **Datas** absolutas (AAAA-MM-DD) em tudo o que é registrado.

## Guardas automáticas

- Hook `.claude/hooks/domain-guard.mjs`: roda após cada edição em `src/core/` e `src/domain/` e bloqueia as violações dos princípios 2, 3 e 10. Também roda manualmente com `--all`.
- As mesmas regras vão para o ESLint quando ele for instalado (FEAT-01).

## Comandos (existem a partir da FEAT-01)

```
docker compose up -d        # o autor roda (ver "Docker" acima)
npm run start:dev
npm test
npx vitest related --run <arquivos>
npm run test:e2e
npm run typecheck
npm run lint
npm run format
npm run format:check
npm run build
npm run validate:content -- <arquivo>
node .claude/hooks/domain-guard.mjs --all     # já funciona
```
