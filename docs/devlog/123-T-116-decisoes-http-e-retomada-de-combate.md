# T-116 — Decisões HTTP e retomada de combate em grupo

- **Data** — 2026-11-27
- **Status** — concluída
- **Spec e contrato** — SPEC-BACKEND v1.17, REQ-187 e REQ-191, CONTRATO v1.19, cenários 2 e 7
- **Horas** — a preencher pelo autor

`GET /parties/:id`, a abertura de sessão e os recibos de ação projetam a decisão persistida. As intenções de elenco, convite e ordem entram pelo POST de ações. O turno e a recompensa reutilizam os identificadores e as ações existentes. O host do save é o humano local usado para verificar o responsável. A autenticação de identidade por requisição pertence à FEAT-25.

Uma pausa encerra o recibo atual. O mesmo dono, rodada e dimensão da vez automática continuam após a resposta humana. O serviço usa o bloqueio transacional do save para gravar as respostas e associar a continuação e o recibo ao checkpoint. A ativação mantém o ID da decisão se o turno continuar. O replay devolve o lote original, enquanto GET e uma nova abertura sem recuperação projetam a decisão mais recente.

O mapper grava elenco, estado dos participantes, reações em área, resumo coletivo e continuação no JSON do save. Os campos de persistência são opcionais para leitura dos saves anteriores.

## Arquivos

- `party-action/index.ts`, `take-party-action/index.ts`, `available-actions/index.ts` e `entities/party/index.ts` — intenções, precedência, decisões e execução dos atores.
- `enterprise/ai-turn/index.ts`, `party-advance.service.ts` e `party-presenter/index.ts` — escolhas da IA, execução e retomada automáticas, recibos e projeção.
- `drizzle-party-mapper.ts` e `drizzle-party-mapper.test.ts` — persistência e recarga do convite e do combate.
- `ai-advance.controller.e2e-spec.ts`, `index.combat.controller.e2e-spec.ts`, `create-party/index.controller.e2e-spec.ts` e os testes unitários de ações, recrutamento e eventos — regressões pela API e no domínio.

## Como verificar

No Git Bash do backend, com o PostgreSQL disponível e `DATABASE_URL` configurada em `.env.test` ou `.env`. O runner sobe a API em processo e cria o schema isolado.

```bash
cd /d/Github/Misadventure_Backend_V3
npm run test:e2e -- ai-advance.controller.e2e-spec.ts index.combat.controller.e2e-spec.ts dimension-completion.controller.e2e-spec.ts index.random-event.controller.e2e-spec.ts create-party/index.controller.e2e-spec.ts
```

Espere 48 testes aprovados nos cinco arquivos.

- **Cenário 2** — Compare os saves equivalentes de aceite e recusa. Confira convite e turno no GET e na sessão. A ativação consome a opção e conserva o ID da decisão. O lote mantém o dono da vez automática. As recusas preservam o save, inclusive a revisão e o RNG.
- **Cenário 7** — A interrupção injetada retorna 500. Antes da recuperação, uma chave nova retorna `ACTION_ADVANCE_PENDING`; o corpo diferente sob a chave original retorna `ACTION_IDEMPOTENCY_CONFLICT`. Depois do consumo, a chave concorrente retorna `combatDecisionExpired`. O reenvio em paralelo mantém o 200 original. Compare o estado, o RNG e as atualizações de combate com a execução de controle.
- **Casos das etapas anteriores** — Confira custo único, rejeição de candidato duplicado e desempate antes do primeiro turno. Após a fuga do iniciador, a IA termina o chefe e a dimensão conclui. Na fixture com inventário cheio e saque de combate, a escolha mantém o save na dimensão de origem até a entrega. A entrega encerra o combate uma vez e o recibo continua recuperável após o congelamento.

## Verificações executadas

- Os três testes novos do parser falharam com `unknownAction` antes da implementação e passaram depois.
- As suítes foram executadas com uma configuração local temporária usando a transformação do TypeScript, devido à falha do cache nativo do SWC no ambiente do Codex.
- API com PostgreSQL: 48 testes aprovados nas cinco suítes afetadas. A suíte E2E completa teve 383 aprovações e três falhas de catálogo (REQ-28, REQ-101 e REQ-98/REQ-101). As mesmas falhas foram reproduzidas em `e599e1b`, com expectativas desatualizadas para campos de item e dimensão.
- Suíte unitária: 1.894 testes passaram. A falha da REQ-56 sobre o ator da vez permanece registrada no devlog 121.
- Typecheck, Prettier nos arquivos TypeScript alterados e `git diff --check` aprovados. O ESLint global apontou ocorrências preexistentes nos roteiros `test/prepare-feat-*.cjs` e em uma desestruturação na heurística de missões da IA.

## Retomada

A T-117 verifica a matriz completa da FEAT-22, prepara saves independentes e reúne os dados para a T-112 do frontend. A validação integrada continua pendente.

## Commit sugerido

`feat/persist and resume group combat decisions (t-116)`
