# T-39 — Efeitos e status de ponta a ponta

- Data: 2026-11-19
- Status: aguardando revisão
- SPEC-BACKEND: v0.56
- CONTRATO: v0.52

## Objetivo

Entregar a FEAT-11 pelas rotas existentes e verificar os REQ-97 a REQ-107 com Supertest e PostgreSQL.

## Decisões

- D-107 registra o save v7, a consulta das cartas da mão na projeção de custos e a referência de origem de cada status ativo na consulta de conteúdo em uso.
- O cenário do amuleto usa `initialGold: 0` para reproduzir os saldos do contrato. O laboratório inicia com 10 por padrão. O roteiro manual verifica os acréscimos de ouro em cima do saldo inicial.
- Os e2e de descarte usam uma mão inicial de 32 cartas de um deck com 30 cartas de cada atributo. Assim a mão sempre permite escolher Força e testar a recusa de Resistência sem depender do sorteio.

## Passos e comandos

1. Escrever os testes de retrocompatibilidade do mapper e os cenários Supertest da FEAT-11. Atualizar as fixtures de versões legadas para excluir os campos que elas ainda não gravavam.
2. Registrar `IdGenerator` no caso de uso do Nest. Persistir e validar status no JSONB. Projetar status, efeitos ativáveis e as ações disponíveis.
3. Rodar `node node_modules/vitest/vitest.mjs run` e `node node_modules/vitest/vitest.mjs run --config vitest.config.e2e.ts --maxWorkers 4`.
4. Rodar `node node_modules/drizzle-kit/bin.cjs generate` e conferir que não produziu migração SQL.
5. Com o servidor do autor em `CONTENT_DIR=test/fixtures/content` e `LAB_ENABLED=true`, executar o bloco FEAT-11 de `client.http` com `curl.exe`.

## Arquivos

- `drizzle-party-mapper.ts`, `campaign.module.ts`, `party-presenter/index.ts` e `party/index.ts`: integração e persistência.
- `index.effects.controller.e2e-spec.ts`: 11 testes, um por requisito. Os e2e de criação, editor, Preparar, deck, cofre e repositório verificam os novos campos e a compatibilidade.
- `client.http`: roteiro do catálogo, doação, pagamentos, passivo, recusas, gravação e expiração.

## Como verificar

No `client.http`, execute em ordem o bloco FEAT-11. A ativação do tônico retorna 200, Ataque efetivo 9 e `remaining: 2`. O GET devolve o mesmo status. Depois de dois `endTurn`, `statuses` está vazio e o Ataque efetivo volta a 6. O índice negativo retorna 400 com `ACTION_INVALID` e `effectIndex / notNonNegativeInteger`. Gastar Vigor pela terceira vez retorna 409 com `notEnoughVigor`.

## Problemas

- O primeiro e2e de projeção mostrou que faltavam as cartas da mão no catálogo recebido pelo domínio. O presenter passou a carregar os IDs da mão do membro da vez.
- O cache nativo do SWC fica fora do workspace no Windows. Os comandos Vitest rodaram com a execução aprovada e chamando os binários locais pelo Node.

## Checks

- 1.192 testes unitários e 222 e2e passaram.
- Guarda do domínio, tipos, lint, Prettier, build e validação de `content/` e da fixture passaram.
- Drizzle informou `No schema changes, nothing to migrate`.
- As 27 chamadas manuais retornaram os códigos esperados. O grupo de teste criado foi `2020cc69-b5d5-4084-b2b1-175f67074140`.

## Ponte com o frontend

CONTRATO v0.52 marca FEAT-11 como `implementado (BE)`. ROADMAP v0.54 marca a coluna BE como `pronto`. O autor leva ambos os arquivos inteiros para validar a FEAT-11 contra o backend real.

## Commit sugerido

`feat/persist and expose player effects`

<!-- tempo: a preencher pelo autor -->
