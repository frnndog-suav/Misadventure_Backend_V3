# 057 — T-48 — Desfechos e retorno à vez

- Data — 2026-11-20
- Status — aguardando revisão
- Spec — v0.62
- Contrato — v0.64, acordado
- Horas — a preencher pelo autor

## Objetivo

Implementar REQ-122 e D-108 a partir do devlog 056. A verificação pelo save persistido e pela API pertence à T-49.

## Decisões

- O desfecho congela a resolução ao sair do combate. A carta continua reservada enquanto houver uma escolha de recompensa. O cursor reaproveita a execução de passos e a entrega da FEAT-12.
- A tentativa voluntária usa as regras de Vigor, limiar e rolagem do teste de fuga e resolve o gatilho antes da rolagem. Na falha, o ataque básico extra usa a ordem circular dos inimigos vivos e deixa o turno normal do atacante na ordem.
- O limite desconta o Pico de fuga mesmo com Sem fuga. A Reflexão que derruba o jogador após seu golpe fatal preserva a vitória. A sessão pode ser reaberta com o membro caído, com acesso à recompensa pendente quando aplicável.

## Arquivos

- `src/domain/campaign/enterprise/entities/party/index.ts` fecha o combate, guarda o resultado e o cursor de recompensa e controla o retorno à vez.
- `src/domain/campaign/enterprise/combat/index.ts` resolve o ataque livre e preserva a ordem do dano e da Reflexão.
- `src/domain/campaign/enterprise/party-action/index.ts` e `src/domain/campaign/application/use-cases/take-party-action/index.ts` leem e despacham a fuga e carregam as cartas de desfecho.
- `src/domain/campaign/enterprise/entities/party-member/index.ts`, `available-actions/index.ts` e `rewards/index.ts` incluem a queda, as ações do membro e a origem da recompensa.
- `src/domain/campaign/application/use-cases/take-party-action/random-event.test.ts` cobre os desfechos pelo caso de uso com repositório em memória, incluindo reabertura de sessão no agregado.

## Como verificar

```powershell
node ./node_modules/vitest/vitest.mjs run src/domain/campaign/application/use-cases/take-party-action/random-event.test.ts -t REQ-122
```

| Cenário | Falha esperada antes da implementação | Resultado esperado após a implementação |
| --- | --- | --- |
| Fuga bem-sucedida | A intenção é recusada. | Paga 2 de Vigor, perde 2 de Pico, descarta a carta uma vez e volta à vez. |
| Fuga malsucedida | A intenção é recusada. | O inimigo faz um ataque extra e conserva seu ataque normal. O jogador volta com 14 PV. |
| Limite em Sem fuga | Falta o resultado e o descarte. | Perde 2 de Pico sem pagar Vigor, avançar o RNG ou executar a coisa ruim. |
| Último inimigo com Reflexão fatal e inventário cheio | Falta o resultado ou a escolha de recompensa. | Vitória com o jogador caído. Escolher manter a recompensa e descartar o item anterior entrega o novo item e conclui o descarte da carta de combate. O jogador continua sem ações de aventura ao reabrir a sessão. |
| Derrota | Falta o resultado e a coisa ruim. | Marca o jogador caído, perde 5 de ouro e descarta a carta uma vez. |

Verificação pós-implementação, também com repositórios em memória:

```powershell
node ./node_modules/vitest/vitest.mjs run src/domain/campaign/application/use-cases/take-party-action src/domain/campaign/application/use-cases/end-session src/domain/campaign/enterprise/combat src/domain/campaign/enterprise/available-actions
```

## Checks

- Antes da implementação, o autor executou o Vitest 5.1.0. Resultado de 5 falhas e 36 casos filtrados. As duas fugas retornaram `ACTION_INVALID` com `unknownAction`. Nos cenários de limite, vitória e derrota, o matcher encontrou propriedades com getter no agregado e lançou `TypeError`. As asserções passaram a comparar uma projeção simples desses valores.
- Após a implementação, `npm.cmd run typecheck`, ESLint nos arquivos TypeScript alterados e `git diff --check` passaram.
- Aguardando o resultado pós-implementação do Vitest pelo autor.

## Commit sugerido

`feat/resolve combat outcomes and resume adventure (t-48)`
