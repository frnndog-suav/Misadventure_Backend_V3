# 056 — T-47 — Habilidades, efeitos e IA

- Data — 2026-11-20
- Status — aguardando revisão
- Spec — v0.62
- Contrato — v0.62, acordado
- Horas — a preencher pelo autor

## Objetivo

Implementar habilidades, efeitos e IA de REQ-119 e REQ-121 a partir do estado de combate entregue no devlog 055, com a execução fora de combate prevista em D-109.

## Decisões

- A resolução usa o RNG do save para acerto, seleção aleatória de custos e quebra. O cálculo e o pagamento operam sobre cópias até a aceitação da ação.
- O pagamento distribui as escolhas da mão, dos slots e do inventário pelos custos na ordem da carta. Cópias de atributo mantêm a identidade no lote e vão ao descarte sem reposição.
- O dano básico e o de habilidade compartilham o cálculo de combate. A IA usa as prioridades configuradas, respeita a ordem impressa e faz o ataque básico se ainda puder.
- A T-48 trata desfechos e fuga, inclusive o momento do gatilho de tentativa de fuga. A T-49 habilita a composição HTTP e persiste o estado.

## Arquivos

- `src/domain/campaign/application/use-cases/take-party-action/random-event.test.ts` — quatro casos pelo fluxo do caso de uso, com catálogo e repositório em memória.
- `src/domain/campaign/enterprise/combat/` — execução de habilidades e IA, condições da origem, pagamentos e opções.
- `src/domain/campaign/enterprise/entities/party/`, `party-member/`, `player-status/` e `available-actions/` — janelas, gatilhos, recargas, duração e projeção de opções.
- `src/domain/campaign/enterprise/party-action/` e `src/domain/campaign/application/use-cases/take-party-action/` — leitura e despacho das três intenções de habilidade e efeito.
- `src/domain/campaign/enterprise/effect-payment/`, `effective-modifiers/` e `random-event/` — reaproveitamento de cálculo de custo, Precisão de Projétil e critérios de recursos.
- `src/infra/http/presenters/party-presenter/index.ts` — apresentação das ações coerente com a habilitação adiada para T-49.

## Como verificar

```powershell
npm.cmd exec -- vitest run src/domain/campaign/application/use-cases/take-party-action src/domain/campaign/enterprise/combat src/domain/campaign/enterprise/effective-modifiers src/domain/campaign/enterprise/available-actions src/domain/campaign/enterprise/activatable-effects
```

| Cenário | Falha observada antes da implementação | Resultado esperado na nova execução |
| --- | --- | --- |
| Canalizada, golpe de 4 ou 5 PV, começando com 20 PV | Ambos os casos param no primeiro `useAbility`, recusado com `ACTION_INVALID`. | 4 PV preservam a carga e o segundo uso causa 11 PV de dano. 5 PV interrompem a canalização e o segundo uso só recarrega. |
| Preparar na antecipação com pagamento inválido | A operação retorna `ACTION_INVALID` em vez de `ACTION_NOT_ALLOWED` com `paymentInvalid`. | A recusa preserva mão, ouro, vida, RNG e save. O lote válido consome 2 de ouro e uma cópia sem reposição. Dimensão, zona e jogador resolvem os gatilhos nessa ordem, deixando 18 PV. |
| Suporte com três aliados feridos | O primeiro aliado empatado fica com 7 PV em vez de 8 PV, pois só ocorre o ataque básico. | Suporte cura o primeiro aliado dentre os dois empatados com menor vida, faz o ataque básico e devolve o controle ao jogador com 16 PV. |

## Checks e pendências

- Após a implementação, `npm.cmd run typecheck`, ESLint nos arquivos de código alterados e `git diff --check` passaram.
- O autor executou o Vitest e confirmou as quatro falhas esperadas, com 22 testes passando. Os dois usos de Canalizada retornaram `unknownAction`, Preparar retornou `unknownOperation` e o aliado de Suporte ficou com 7 PV em vez de 8 PV.
- Pendente o retorno do autor sobre as suítes afetadas. A suíte de encontro deve ter 26 testes passando. As demais devem passar sem regressões.
- A cobertura de gatilhos adiados declarados dentro das próprias habilidades ainda precisa ser completada para D-109.

## Commit sugerido

`feat/resolve combat abilities and enemy ai (t-47)`
