# 108 — T-89 — Configuração e política da IA

- **Data** — 2026-11-26
- **Situação** — concluída
- **Spec** — v1.11, REQ-181, REQ-182, D-156
- **Contrato** — v1.08, FEAT-20 acordada
- **Horas** — a preencher pelo autor

## Objetivo e arquivos

- Retomada do devlog 107. Primeira bateria em `src/infra/http/controllers/create-party/ai-player-priorities.controller.e2e-spec.ts`.
- REQ-181 cobre publicação, substituição e reset da permutação, rejeição atômica de entradas inválidas, snapshot de campanha e leitura de save v11 sem a chave.
- REQ-182 e D-156 cobrem encerramento sem PA e recuperação de saúde com repetição a partir do mesmo save. Os cenários usam o ponto de entrada interno proposto `executeAiTurn`. A integração com os gatilhos HTTP pertence à T-90.

## Verificação e retomada

- Typecheck e `git diff --check` passaram. O resultado do E2E aguarda execução pelo autor.
- Com o PostgreSQL de teste disponível conforme `.env.test` (ou `.env`, na ausência de override), o Supertest cria a aplicação e o setup isola o schema da suíte.

```bash
cd /d/Github/Misadventure_Backend_V3 && npm run test:e2e -- src/infra/http/controllers/create-party/ai-player-priorities.controller.e2e-spec.ts
```

- Esperam-se dez falhas. O laboratório ainda omite ou rejeita a chave, os saves não expõem as prioridades, e o executor interno ainda não existe. Nos casos de entrada inválida, o erro atual é `unknownKey`, e o teste espera `invalidPriorities`.
- Após a confirmação, retomar a implementação. Ainda faltam cenários específicos de combate, disputa entre prioridades, sorteios de mentor e provação, montagem da build e medição com cinco ajudantes.

## Configuração e snapshot

- O autor confirmou dez falhas em uma suíte. GET omitia a chave, PATCH respondia com `unknownKey`, o save v11 sem a chave não restaurava o padrão e o ponto de entrada da IA estava ausente.
- `game-config/defaults.ts` e `game-config/index.ts` definem e validam a permutação. `drizzle-game-config-mapper.ts` persiste apenas ajustes. `drizzle-party-mapper.ts` lê a chave opcional no JSONB e usa os padrões em saves anteriores. A criação reutiliza o snapshot de configuração existente.
- Typecheck e `git diff --check` passaram. A verificação do REQ-181 aguarda execução pelo autor.

```bash
cd /d/Github/Misadventure_Backend_V3 && npm run test:e2e -- src/infra/http/controllers/create-party/ai-player-priorities.controller.e2e-spec.ts -t REQ-181
```

- Esperado com PostgreSQL de teste disponível: oito testes passam e dois do REQ-182 ficam fora do filtro. O caso de borda de duplicata deve retornar `invalidPriorities` e preservar a configuração inteira, inclusive o ouro inicial.
- A política do REQ-182 segue pendente nesta tarefa.

## Confirmação do REQ-181 e teste de combate

- O autor confirmou que os testes filtrados do REQ-181 passaram sem erros.
- Adicionado cenário REQ-182/D-156 em `take-party-action/index.combat.controller.e2e-spec.ts`. A fixture reaproveita um encontro revelado e preserva o ID do combatente ao torná-lo um ajudante. O teste espera vitória, entrega da recompensa e passagem da vez ao humano.
- Typecheck e `git diff --check` passaram. Falha esperada do novo teste: `executeAiTurn` ausente, depois da montagem do combate e da confirmação de que atacar é legal.

## Primeira execução interna da vez

- O autor confirmou a falha esperada no cenário de combate, com cinco testes fora do filtro.
- `take-party-action/index.ts` compartilha a aplicação de ações entre a requisição humana e o executor interno. O chamador do executor recebe o agregado alterado e controla a persistência.
- `enterprise/ai-turn/index.ts` aplica a ordem lexicográfica do snapshot aos candidatos, com empate pela ordem de geração. Esta etapa cobre recuperação, fim da vez, ataques básicos, recompensas e decisões pendentes simples. O limite inicial é de 96 escolhas e até 12 alvos de ataque avaliados por escolha. Ao atingir o limite, o encerramento passa pela validação existente.
- Os E2E de criação e combate chamam o executor tipado. Typecheck e `git diff --check` passaram.
- Esperado com PostgreSQL de teste disponível: três cenários REQ-182 passam. Roteiro: encerrar com zero PA, recuperar saúde com o mesmo resultado a partir do mesmo save e concluir combate e recompensa antes da passagem de vez.
- Pendências: ampliar os candidatos das fases suportadas, cobrir a disputa entre prioridades, sorteios de mentor e provação e montagem de build, e medir com cinco ajudantes.

## Disputa entre prioridades

- O autor confirmou que os três cenários do executor passaram.
- Em `take-party-action/index.quests.controller.e2e-spec.ts`, o ajudante tem um PA e pode recuperar saúde ou aceitar a missão de mentor. O cenário usa a mesma fixture nas duas ordens de prioridades.
- Esperado antes de ampliar a política: `avoidKnockout` passa. `quests` falha na expectativa do estado do ajudante, pois ele ainda recupera saúde em vez de aceitar a missão.

## Escolhas de missão na política

- O autor confirmou um teste passando e um falhando. Com `quests` primeiro, o ajudante terminou com 4 de saúde, 200 de ouro e nenhuma missão de mentor.
- `enterprise/ai-turn/index.ts` inclui aceitação, avanço e entrega de missões a partir das escolhas legais de `Party.questState`. A avaliação usa progresso de missão e custo de ouro. `take-party-action/index.ts` fornece as cartas do quadro e as classes publicadas.
- O agregado sorteia entre as opções legais de mentor ou de provação após a política selecionar a respectiva ação. Usa o RNG do save quando há mais de uma opção e grava o estado do RNG após aplicação bem-sucedida.
- Typecheck passou. Esperado na próxima execução: cinco testes REQ-182 passam, incluindo os dois lados da disputa com um PA. A cobertura direta dos sorteios com múltiplas opções, build, ampliação das demais fases e medição com cinco ajudantes seguem pendentes.

## Ajuste da expectativa do sorteio de mentor

- O autor retornou quatro testes passando e um falhando. O ajudante aceitou a missão, pagou 150 de ouro e sorteou `rogue`. A expectativa original fixava `mage`.
- O cenário agora usa a lista de mentores elegíveis e o RNG inicial do save para calcular a classe esperada. Além da missão e do custo, confere o estado do RNG após o sorteio. Falta validar a provação com múltiplas opções.

## Provação e build

- O autor confirmou a passagem dos cinco testes do REQ-182.
- O E2E de missões agora verifica a especialização sorteada entre múltiplas opções e o estado final do RNG. Outro cenário concede Cavaleiro ao ajudante e deixa um PA para ajustar a build com as cartas disponíveis.
- Typecheck e `git diff --check` passaram. No filtro REQ-182 dos três arquivos, espera-se seis testes passando e uma falha em `deckLockMet` do Cavaleiro, pois a política ainda não ajusta a build.

## Ajuste das fixtures e primeira política de build

- O autor retornou cinco testes passando e dois falhando. As fixtures solo deixavam o ajudante abaixo da saúde máxima e ele priorizava a recuperação. Provação agora começa com saúde e vigor completos. O cenário de Cavaleiro isola a entrega e a build e dá precedência ao Pico sobre recuperação após a entrega aumentar o Pico.
- `enterprise/ai-turn/build.ts` gera intenções de ajuste para cumprir travas de classes e especializações com cartas disponíveis. Cada opção acrescenta as cópias necessárias sem retirar cartas da build existente. A ação usa a validação e o embaralhamento de `Party.adjustDeck`.
- Typecheck e `git diff --check` passaram. Esperados sete testes passando no filtro REQ-182. Ainda faltam ampliar as demais fases e medir com cinco ajudantes.

## Deslocamento para objetivo de missão

- O autor confirmou que os sete testes do REQ-182 passaram.
- O novo cenário no E2E de missões começa na mina com uma entrega aberta e um PA. A travessia para o Porto Cinzento deve gastar o último PA e a missão deve continuar aberta para a próxima vez.
- Espera-se uma falha no filtro do novo cenário. O ajudante passa a vez na mina porque a política ainda não considera deslocamento para objetivos.

## Deslocamento implementado

- O autor confirmou a falha esperada. A vez passou ao humano e o ajudante permaneceu em `fixture.old-mine`.
- `enterprise/ai-turn/quest-movement.ts` busca travessias que reduzem a distância até o local de uma missão aberta, com até quatro movimentos e 64 zonas na busca. Reutiliza `moveRoutes`, incluindo montaria. A política pontua o deslocamento abaixo das ações de missão disponíveis na zona.
- `take-party-action/index.ts` fornece as cartas das zonas do mapa quando há missão de zona aberta. O deslocamento usa o mesmo validador de movimento das ações humanas.
- Typecheck e `git diff --check` passaram. Esperados oito testes passando no filtro REQ-182. No novo cenário, o ajudante chega ao Porto Cinzento e passa a vez com a missão aberta.

## Medição com cinco ajudantes

- O autor confirmou os oito testes do REQ-182.
- O E2E de criação mede cinco amostras do executor, cada uma com cinco ajudantes em sequência a partir do mesmo snapshot. Cada ajudante começa com um ponto de saúde e precisa recuperar e passar a vez. A medição começa após restaurar o agregado e cobre o executor e suas consultas ao catálogo.
- Esperado: todos os ajudantes recuperam saúde, a quinta vez termina no humano e o teste imprime cinco durações em milissegundos. A medição aguarda execução pelo autor. A cobertura de outras ações das fases suportadas segue pendente.

## Início de encontro

- O autor confirmou que o cenário de medição passou. As cinco durações ainda não foram informadas.
- O E2E de combate agora verifica que o ajudante inicia um encontro disponível, vence e resolve a recompensa antes do fim da vez. Espera-se falha no resultado de combate, pois o executor atual só resolve encontros que já começaram.

## Início de encontro implementado

- O autor confirmou a falha esperada e retornou as durações da D-156. Para cinco ajudantes consecutivos em recuperação, as cinco amostras mediram 6,0, 2,9, 2,5, 3,0 e 2,5 ms.
- `enterprise/ai-turn/index.ts` e `take-party-action/index.ts` adicionam início de encontro quando há PA e o domínio confirma a disponibilidade. O candidato pontua progresso de Pico e recebe penalidade de risco abaixo de metade da saúde máxima. Revelação, combate e entrega seguem pelo executor existente.
- Esperados dez testes passando no filtro REQ-182. O cenário novo deve concluir o encontro e entregar a vez ao humano.

## Requisito de evento aleatório

- O autor confirmou a passagem dos dez testes.
- O E2E de eventos aleatórios reaproveita o encontro revelado do viajante e verifica que o ajudante paga o descarte aleatório, conclui o evento com sucesso, resolve as recompensas e passa a vez. Espera-se uma falha na resolução do encontro, pois a IA ainda não gera a intenção de pagamento.

## Pagamentos de evento

- O autor confirmou a falha esperada. O viajante terminou em `setback`.
- `enterprise/ai-turn/event-payments.ts` reutiliza o cálculo dos requisitos e mínimos para propor pagamentos simples. Para descarte aleatório, o resolvedor do evento escolhe a carta com o RNG do save. Para escolhas explícitas, a intenção usa a ordem das cartas ou slots elegíveis. A oferta de recursos com combinação de filtros continua pendente.
- Esperados onze testes passando no filtro REQ-182, incluindo o encontro do viajante com resultado `success`.
- O autor confirmou que os onze testes do filtro REQ-182 passaram sem erros.

## Oferta de recursos

- `enterprise/ai-turn/event-payments.test.ts` exercita a combinação de um filtro genérico com um filtro por tag e a exigência de recursos distintos. A intenção proposta precisa passar pelo validador de eventos.
- Esperado antes da implementação: um teste passa e um falha. O caso impossível fica sem intenção e o caso com pagamento legal ainda não gera uma oferta.

- O autor confirmou a falha esperada da oferta viável e a passagem do caso impossível.
- `event-payments.ts` agora reserva primeiro os recursos dos filtros com menos opções e respeita o estoque e as restrições de recursos iguais ou distintos. A busca cobre até 12 cópias e 256 tentativas. O validador de eventos continua responsável por aplicar o pagamento.
- Esperado na repetição: dois testes unitários passando, incluindo a remoção dos dois recursos pelo validador.

## Efeito de cura durante o combate

- O autor confirmou a passagem dos dois testes unitários de oferta.
- O E2E de combate agora verifica que o ajudante ferido consome uma poção disponível na preparação do combate, sobrevive e entrega a vez. Espera-se falha no saldo de saúde, pois a política ainda não considera efeitos ativáveis de combate.

- O autor confirmou a falha esperada. O ajudante venceu e terminou com 9 de saúde.
- A política considera efeitos de cura em si mesmo com custo automático de consumo ou vigor, a partir das opções do agregado. A pontuação de segurança usa a cura efetiva limitada pela saúde que falta. O formato HTTP segue conforme o contrato.
- Esperados 12 testes E2E passando no filtro REQ-182. Efeitos ofensivos e habilidades de combate seguem pendentes.

## Efeito ofensivo e reflexão

- O autor confirmou que os 12 testes E2E passaram.
- O E2E de combate oferece um efeito ofensivo com dois alvos. O ajudante deve atingir com o efeito o inimigo que reflete ataque básico, ganhar o combate sem perder saúde e passar a vez.
- Espera-se uma falha na saúde final. Hoje o ajudante usa ataques básicos nos dois inimigos e termina com 9 de saúde.

- O autor confirmou a falha esperada. O ajudante venceu com 9 de saúde.
- A política agora avalia dano de efeito com pagamento automático de consumo ou vigor. Ao estimar que o efeito derrota o alvo, pontua a reflexão que o ataque básico causaria. A resolução de dano continua no domínio.
- Esperados 13 E2E passando no filtro REQ-182. O novo cenário deve terminar com 10 de saúde. Habilidades de combate seguem pendentes.

## Habilidade de combate

- O autor confirmou os 13 E2E do REQ-182.
- O E2E de combate acrescenta um ajudante cuja montaria tem uma habilidade legal de cura. A expectativa é terminar com 12 de saúde após a cura de 3 e a reflexão de 1. Espera-se falha com 9 de saúde antes de incluir habilidades na política.

- O autor confirmou a falha esperada com 9 de saúde.
- A política avalia habilidades imediatas de cura em si mesmo, gratuitas ou com custo automático de vigor. Usa as opções legais e a definição obtida pelo domínio para equipamento ou montaria. O resolvedor atual controla a frequência de uso e aplica a cura.
- Esperados 14 E2E passando no filtro REQ-182. O caso da montaria deve terminar com 12 de saúde. Habilidades ofensivas e outros efeitos de habilidade continuam sem avaliação específica.

- Na execução seguinte, 13 testes passaram e o cenário de montaria terminou com 15 de saúde. O domínio renova o limite de uso quando o combatente inicia outra vez de combate. A fixture permite duas curas de 3 e sofre 1 de reflexão. A expectativa foi corrigida de 12 para 15.
- Medição com cinco ajudantes nessa execução, em ms por sequência: 4,3, 3,1, 3,6, 2,6 e 2,7.

## Habilidade ofensiva

- O autor confirmou a passagem dos 14 E2E do REQ-182.
- O cenário de montaria agora exercita também uma habilidade de dano que pode atingir o inimigo com reflexão. Espera-se que o caso de cura passe e o de dano falhe na saúde final, com 9 observados e 10 esperados.

- O autor confirmou um teste passando e a falha esperada da habilidade de dano com 9 de saúde.
- A política avalia habilidades imediatas de dano de efeito contra um oponente, gratuitas ou com pagamento automático de vigor. Habilidades e efeitos compartilham a pontuação por alvo. A resolução real continua no domínio.
- Esperados 15 testes E2E passando no filtro REQ-182.

## Ouro no mercado

- O autor confirmou a passagem dos 15 E2E do REQ-182.
- O E2E de mercado agora verifica que, com ouro em primeiro lugar e um PA, o ajudante vende um tesouro por 25 de ouro e passa a vez. Hoje a política não oferece ações de mercado, portanto espera-se uma falha no ouro final.

- O autor confirmou a falha esperada. O ajudante passou a vez com zero ouro.
- A política reaproveita as ofertas de venda do domínio para negociar um lote de tesouro por visita. A pontuação considera o ganho que cabe na bolsa e a ação usa a resolução normal de mercado.
- Typecheck e `git diff --check` passaram. Esperados 16 testes passando no filtro REQ-182, com 25 de ouro e o tesouro vendido no cenário de mercado.

## Deslocamento para conclusão da dimensão

- O autor confirmou os 16 E2E do REQ-182.
- O cenário de deslocamento agora distingue um ajudante que já possui o item de conclusão de outro que ainda precisa obtê-lo. Com um PA, espera-se que apenas o primeiro se mova ao Porto Cinzento, preservando o item para a próxima vez.
- Antes da implementação, o caso sem item deve passar e o caso com item deve falhar na comparação de zona.

- O autor confirmou a passagem do caso sem item e a falha esperada do caso com item.
- O executor carrega as zonas do mapa quando a dimensão tem conclusão. A política consulta a validação normal de conclusão para a zona do objetivo e reaproveita a busca limitada de rotas quando a travessia aproxima o ajudante.
- Esperados 18 testes passando no filtro REQ-182. Os novos cenários conferem a zona final e a preservação do item.

## Conserto no ferreiro

- O autor confirmou os 18 E2E do REQ-182.
- O E2E de ferreiro acrescenta dois casos de arma equipada e quebrada com um PA. Com ouro suficiente, o ajudante deve reparar, pagar o custo e passar a vez. Com zero ouro, deve continuar com a arma quebrada e passar a vez.
- Espera-se que o caso com zero ouro passe e o caso com 50 falhe na verificação da arma quebrada, pois a política ainda não gera a intenção de conserto.

- O autor confirmou a passagem do caso sem ouro e a falha esperada com 50 de ouro.
- A política usa os serviços descritos pelo domínio para oferecer o conserto de equipamento em uso quando o ajudante pode pagar. A escolha pondera segurança, Pico e custo em ouro. O caso de uso existente executa o reparo, consome os PA restantes e aplica a marca de reparo.
- Typecheck e `git diff --check` passaram. Esperados 20 testes passando no filtro REQ-182 dos seis arquivos.

## Regressão da T-89

- O autor confirmou a passagem dos 20 E2E do REQ-182. Já havia confirmado os oito E2E filtrados do REQ-181 e os dois testes unitários de oferta de recursos.
- Próxima verificação: executar sem filtro os arquivos E2E afetados e a suíte de criação com ajudantes da T-88. Isso verifica também ações humanas, leituras legadas e a autorização na vez do ajudante. Espera-se que todos os testes passem.
- O avanço automático pelos gatilhos HTTP, os checkpoints e a retomada idempotente estão planejados na T-90. A política da T-89 é heurística e oferece um subconjunto de operações em cada fase coberta, como venda de tesouros e conserto de equipamento em uso.

## Conclusão

- O autor confirmou que a regressão sem filtro dos sete arquivos E2E passou sem erros. O log dessa execução não informou a contagem por suíte.
- Próxima etapa na SPEC-BACKEND v1.11: T-90, REQ-183 a REQ-185 e D-157. Retomar pelo executor interno `TakePartyActionUseCase.executeAiTurn`. Os gatilhos HTTP, o lote ordenado de atualizações de combate, a persistência por vez, os recibos e a retomada são da próxima etapa.
- A marcação da T-89 na spec aguarda autorização do autor.
- **Commit sugerido** — `feat/add ai helper turn policy (t-89)`.
