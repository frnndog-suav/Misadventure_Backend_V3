# T-38 — Preparar: ativação de efeitos

- Data: 2026-11-19
- Status: aguardando revisão
- SPEC-BACKEND: v0.55
- CONTRATO: v0.51

## Objetivo

Ativar efeitos de recursos em Preparar, validar pagamentos e listar as ativações disponíveis. Conferir a ida e volta dos status pelo repositório em memória.

## Decisões

- D-106 registra simulação de custos em ordem, seleção aleatória compatível com os demais custos, eventos internos e arredondamento da redução percentual de Pico.
- Status de equipamento em uso fica suspenso enquanto o Pico estiver abaixo do requisito. Os custos, ativações e durações que ainda não são executados recebem `notActivatableYet`.
- A porta `IdGenerator` habilita a ativação no caso de uso em memória. O Nest passa a fornecê-la na T-39, com o save v7 e a projeção HTTP. O save v6 descartaria os status criados.

## Passos e comandos

1. Escrever os testes do parser, agregado e listagem. Confirmar as falhas esperadas com `node node_modules/vitest/vitest.mjs run activate.test`.
2. Implementar o parser e os módulos de pagamento, elegibilidade e ativação. Aplicar ao agregado o resultado de um pagamento válido e registrar os eventos em ordem.
3. Exercitar `TakePartyActionUseCase` com o catálogo e o repositório em memória. Verificar o erro de pagamento sem gravação e a volta do status gravado.
4. Com o PostgreSQL já rodando, executar `node node_modules/vitest/vitest.mjs run --config vitest.config.e2e.ts take-party-action create-party get-party list-parties start-session end-session abandon-party grant-to-member --maxWorkers=2` para cobrir regressões nas rotas existentes.

## Arquivos

- Criados em `src/domain/campaign/enterprise/`: módulos `activatable-effects`, `effect-payment` e `effect-activation`, e testes de ativação do parser e do agregado.
- Alterados em `enterprise/`: `party-action`, `available-actions`, `entities/party`, `events/party-events` e `effective-modifiers`.
- Alterados na aplicação: `take-party-action` e `action-not-allowed-error`. Criado o teste `take-party-action/activate.test.ts`.

## Como verificar

- `node node_modules/vitest/vitest.mjs run activate.test enterprise/activatable-effects enterprise/effective-modifiers` exercita as ativações e recusas, as instruções de pagamento, a ordem dos eventos, o RNG e a persistência em memória. Um pagamento com atributo incorreto devolve `ACTION_NOT_ALLOWED`, com `reason: paymentInvalid` e o ID da carta. O pagamento correto descarta a carta e grava o status.

## Problemas

- A revisão detectou que o contrato exige `invalidItem` para entradas de `handCards` que não são texto. O parser e o teste usam esse motivo.
- A busca por cartas passa a avaliar requisitos específicos antes de `any` e pula permutações equivalentes entre cópias. O teste de custos combinados prova que a escolha aleatória preserva a carta exigida pelo pagamento posterior.

## Checks

- Guarda do domínio, tipos, lint, formatação e build passaram.
- Vitest related: 496 testes em 35 arquivos. Supertest: 88 testes em 13 arquivos.

## Ponte com o frontend

FEAT-11 segue `acordado` no contrato v0.51. A T-39 habilita a ativação HTTP e entrega o save v7 e o presenter para a validação de ponta a ponta.

## Commit sugerido

`feat/activate resource effects in prepare (t-38)`

<!-- tempo: a preencher pelo autor -->
