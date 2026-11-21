# 056 — T-47 — Habilidades, efeitos e IA

- Data — 2026-11-20
- Status — concluída
- Spec — v0.62
- Contrato — v0.64, acordado
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
- O autor confirmou que as suítes afetadas passaram sem erros e registrou a implementação no commit `a21895f`.
- A cobertura de gatilhos adiados declarados dentro das próprias habilidades ainda precisa ser completada para D-109.

## Retomada a partir de `a21895f`

- REQ-119 e D-109 — adicionado em `random-event.test.ts` um cenário em que o uso de uma habilidade de arma, na antecipação, dispara um efeito declarado em uma habilidade passiva equipada. O cenário verifica que o efeito custa 1 de ouro e recupera 2 PV somente após o uso.
- O autor confirmou a falha esperada com o código de `a21895f` (1 falha, 26 testes filtrados). O uso foi aceito e o jogador permaneceu com 15 PV e 10 de ouro.
- O agregado `Party` inclui habilidades passivas e contínuas ativas com alvo próprio nas fontes dos gatilhos já resolvidos. A elegibilidade reaproveita as regras de origem, classe e momento. O pagamento reaproveita o RNG do save e recebe a contagem de inimigos vivos em combate.
- TypeScript e ESLint passaram. O autor confirmou que o teste isolado e as suítes afetadas passaram sem erros após a primeira correção.
- REQ-119 — adicionados dois cenários em `random-event.test.ts` para a passiva inimiga com gatilho `onElementAbilityUsed`. Após doar 4 PV e recuperar 1 PV com o efeito imediato, o inimigo deve recuperar mais 2 PV somente se a habilidade usada for de Fogo. O TypeScript passou. A confirmação dos cenários pelo autor precede a mudança no executor.
- O autor confirmou 1 falha esperada, 1 caso passando e 27 filtrados. O inimigo ficou com 9 PV após usar Fogo, contra 11 PV esperados.
- `combat/index.ts` despacha `onElementAbilityUsed` para passivas e contínuas ativas do inimigo com alvo próprio, após o uso, com pagamento pelo próprio inimigo. Efeitos passivos condicionais deixam de entrar como modificadores permanentes. O autor confirmou que os casos isolados e as suítes afetadas passaram.
- REQ-119 — adicionados dois casos em `random-event.test.ts` para `onElementalAdvantageHit` declarado na própria habilidade ofensiva. Contra Fogo, a habilidade de Água deve deixar o alvo com 12 PV. Contra um alvo sem elemento, deve deixar 19 PV. TypeScript passou. Aguardando o autor confirmar a falha esperada de 17 PV no primeiro caso e a aprovação do segundo.
- O autor confirmou 1 falha esperada, 1 caso passando e 29 filtrados. Contra Fogo, o alvo ficou com 17 PV em vez de 12 PV.
- `party/index.ts` encaminha os efeitos automáticos de vantagem elemental da habilidade ofensiva. `combat/index.ts` avalia a vantagem no acerto de cada alvo e aplica o efeito secundário naquele alvo. O autor confirmou a aprovação dos testes pós-correção.
- REQ-119 — acrescentado caso para `onElementDamageTaken` numa passiva inimiga. Um inimigo sem elemento recebe 11 PV de dano de Água e recupera 2 PV. Aguardando confirmação de que o executor atual deixa 19 PV em vez dos 21 PV esperados.
- O autor confirmou 1 falha esperada, 2 aprovações e 29 casos filtrados. `combat/index.ts` agora reutiliza o resolvedor de gatilhos inimigos após dano elemental positivo do ataque ou do efeito da habilidade. Só inimigos vivos resolvem a reação. O autor confirmou que o comando isolado e as suítes afetadas passaram após a correção.
- REQ-119 — acrescentado caso de `whileEnemyCount` em passiva inimiga. Com exatamente um inimigo vivo, a passiva fornece +4 de Defesa. O ataque de Água em área deve deixar o alvo com 21 PV. TypeScript passou. Aguardando confirmação de que o caso falha com 19 PV no executor atual.
- O autor confirmou 1 falha esperada e 32 casos filtrados. `combat/index.ts` calcula os modificadores de passivas sem custo que dependem da contagem de inimigos vivos. A contagem entra no cálculo inicial e os modificadores são recalculados após derrotas por dano ou por efeito da habilidade do jogador. O autor confirmou que o caso isolado e as suítes afetadas passaram após a correção.
- REQ-119 — ampliados os casos de uso de Fogo pelo inimigo para verificar `whileUsedAbilitiesSameElement` na passiva. Após usar Fogo, a Defesa base de 0 deve passar a 4. Com uso sem elemento, fica em 0. O TypeScript passou e a implementação aguarda a confirmação da falha esperada no primeiro caso.
- O autor confirmou 1 falha esperada, 5 aprovações e 27 casos filtrados. `combat/index.ts` agora avalia a condição pelo histórico de usos do próprio inimigo, incluindo o uso recém-registrado. A Defesa esperada após Fogo é 4, e sem elemento é 0. O autor confirmou que o comando isolado e as suítes afetadas passaram após a correção.
- O README §13 exige uma escolha para efeitos do jogador com gatilho e custo. O contrato v0.62 da FEAT-13 define pagamentos em ações voluntárias, mas ainda não define como expor uma escolha iniciada por gatilho nem retomar a sequência após pagar ou recusar. O primeiro cenário de antecipação desta retomada verifica cobrança automática de 1 ouro e precisa ser atualizado quando o fluxo for acordado. Proposta para revisão via autor: projetar uma escolha pendente com origem e opções de pagamento, aceitar pagamento ou recusa e retomar a resolução em ordem. Manter gatilhos sem custo automáticos. Aguardando acordo antes de alterar o contrato e essa parte da implementação.
- Ainda é preciso verificar a cobertura dos demais gatilhos adiados, incluindo os efeitos opcionais com custo e as reações inimigas fora do uso elemental.

## Revisão do contrato da escolha

- O frontend concordou com o fluxo de escolha e pediu os tipos, a regra de ordenação e as recusas. O `CONTRATO.md` v0.63 registra a extensão da FEAT-13 como `proposto (BE)`.
- Efeitos automáticos entram na ordem escolhida pelo jogador junto com os opcionais. A ação usa `resolve` para o automático, `pay` ou `decline` para o opcional. O backend consome o ID a cada decisão aceita e persiste a escolha atual para o GET.
- Retomada após o acordo: corrigir a expectativa de cobrança automática na antecipação, escrever os cenários de REQ-119 para escolha, retomada, ordem e recusas e pedir ao autor a confirmação das falhas esperadas.
- O frontend confirmou a v0.63. A v0.64 registra a extensão como `acordado`.
- Em `random-event.test.ts`, os quatro cenários de REQ-119 verificam pagamento, recusa, seleção do automático primeiro com recálculo da disponibilidade de pagamento, recusas sem gravação nem avanço do RNG, e pausa e retomada no turno inimigo pelo caso de uso. A recarga por GET com persistência real depende do mapper e da composição HTTP da T-49.
- TypeScript passou. Aguardando o autor executar `node ./node_modules/vitest/vitest.mjs run src/domain/campaign/application/use-cases/take-party-action/random-event.test.ts -t disparado` e confirmar a ausência da pausa na antecipação e no turno inimigo antes da implementação.
- O autor confirmou as quatro falhas esperadas (32 casos filtrados). Na antecipação, o executor cobrou o efeito opcional automaticamente ou concedeu o ouro do efeito automático sem abrir a escolha. No combate, voltou ao turno do jogador sem pausar o turno inimigo. Com o contrato acordado e as falhas confirmadas, o próximo passo é implementar a escolha e sua retomada na T-47.

## Implementação da escolha de efeitos disparados

- O agregado guarda a escolha, as origens pendentes e o ponto de retomada. Dimensão e zona resolvem antes do grupo do jogador. Efeitos opcionais abrem decisão mesmo quando o pagamento está indisponível. Um automático remanescente resolve sozinho. Cada decisão aceita renova o ID da escolha e revalida origem, alvos e pagamento das opções restantes.
- `entities/party`, `combat` e `combat/payment.ts` aplicam os efeitos e interrompem a sequência inimiga depois da transição que disparou a escolha. A retomada preserva a fase, as habilidades já executadas e os ataques pendentes. Os custos continuam a usar o RNG do save.
- `party-action`, o caso de uso `take-party-action` e `action-not-allowed-error.ts` validam e despacham a decisão, gravando somente ações aceitas. `available-actions` restringe as ações ao dono na pausa. `party-presenter` projeta a escolha.
- TypeScript, ESLint nos arquivos de implementação e `git diff --check` passaram. Aguardando a execução do Vitest pelo autor.
- Na antecipação, pagar deve terminar com 17 PV e 9 de ouro. Recusar deve terminar com 15 PV e 10 de ouro. Escolher o automático primeiro deve liberar o pagamento de 11 de ouro e terminar com 17 PV e 1 de ouro. Uma tentativa de pagar acima do saldo ou com o ID anterior deve preservar escolha, save e RNG.
- No combate, a primeira habilidade inimiga deve pausar com 18 PV e 10 de ouro. Pagar deve aplicar a cura, executar o ataque básico pendente e devolver o turno ao jogador com 17 PV e 9 de ouro.
- A T-49 cobre a persistência no mapper, o GET após recarga e o lote `combatUpdates` do POST na integração HTTP. O contrato segue acordado até a validação do backend.

## Conferência pós-implementação em `eafdaae`

- A saída inicial do Vitest disponível na retomada registrava 13 falhas em um arquivo, incluindo casos de fuga de REQ-114. Os quatro casos de escolha de efeito disparado de REQ-119 estavam ausentes e as linhas da pilha divergiam do arquivo no commit `eafdaae`.
- Conferência em `random-event.test.ts`: `pay` espera 17 PV e 9 de ouro; `decline` espera 15 PV e 10 de ouro; `automaticFirst` espera 17 PV e 1 de ouro após recalcular `canPay`, com recusas por pagamento inválido e ID anterior sem gravação nem avanço do RNG. O quarto caso espera a pausa do turno inimigo com 18 PV e 10 de ouro e o retorno ao turno do jogador com 17 PV e 9 de ouro após o pagamento e o ataque pendente.
- O autor confirmou que a execução de verificação passou sem erros. O retorno foi verbal, sem a contagem de suítes e testes. A revisão da T-47 foi concluída e a próxima tarefa prevista é a T-48 (REQ-122).

## Commit sugerido

`feat/resolve triggered effect choices (t-47)`
