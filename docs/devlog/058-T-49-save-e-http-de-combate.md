# 058 — T-49 — Save e HTTP de combate

- Data — 2026-11-20
- Status — concluída
- Spec — v0.63
- Contrato — v0.65, implementado (BE)
- Horas — a preencher pelo autor

## Objetivo

Retomar do devlog 057. Aplicar REQ-123 e D-110 ao save e à interface HTTP da FEAT-13.

## Decisões

- O mapper grava o snapshot v9 e lê as versões v2–v8. O snapshot inclui as escolhas disparadas e seus dados de continuação. O lote de transições é produzido para cada ação aceita e entregue pelo POST.
- Na primeira inicialização elegível, a composição da dimensão fornece as ocorrências de combate em ordem. O v8 podia guardar cartas inelegíveis no fim da pilha. A atualização reaproveita essa reserva e aplica a composição sem duplicá-la. A marca por tipo de zona é gravada com a ação aceita.

## Arquivos

- `src/infra/database/drizzle/mappers/drizzle-party-mapper.ts` e `drizzle-party-mapper.test.ts` — formato v9, leitura legada e round-trips de combate e desfecho.
- `src/domain/campaign/enterprise/entities/party/index.ts`, `combat/index.ts`, `available-actions/index.ts` e `src/domain/campaign/application/use-cases/take-party-action/index.ts` — estado, inicialização de decks legados, elegibilidade e transições do combate.
- `src/infra/http/campaign.module.ts`, `presenters/party-presenter/index.ts` e `controllers/take-party-action/index.controller.ts` — habilitação do combate e projeção do snapshot e das transições.
- `src/infra/http/controllers/take-party-action/index.combat.controller.e2e-spec.ts` — recarga por HTTP, recusa sem gravação, Reflexão fatal, recompensa e deck v8 vazio com descarte. Os e2e afetados também foram atualizados para esperar o save v9 e conferir o lote vazio em ações comuns.

## Como verificar

### Antes da implementação

```powershell
node ./node_modules/vitest/vitest.mjs run src/infra/database/drizzle/mappers/drizzle-party-mapper.test.ts -t REQ-123
```

O autor executou o Vitest 5.1.0. Foram 2 falhas e 25 casos filtrados. A recarga do combate retornou `null`. A gravação da recompensa falhou na validação de `source.type` em `toDrizzle` com `ZodError`.

### Depois da implementação

```powershell
node ./node_modules/vitest/vitest.mjs run src/infra/database/drizzle/mappers/drizzle-party-mapper.test.ts src/domain/campaign/application/use-cases/take-party-action src/domain/campaign/enterprise/combat src/domain/campaign/enterprise/available-actions
```

Esperam-se as suítes verdes. Em seguida, o autor disponibiliza o PostgreSQL indicado por `.env.test` e roda os e2e abaixo. A suíte cria o schema isolado, aplica as migrações e inicia o app de teste.

```powershell
npm.cmd run test:e2e -- src/infra/http/controllers/take-party-action src/infra/http/controllers/create-party src/infra/http/content-in-use.e2e-spec.ts src/infra/database/drizzle/repositories/drizzle-parties-repository.e2e-spec.ts
```

### Roteiro HTTP após a implementação

Use uma campanha solo com carta executável de dois inimigos de 1 PV, Reflexão 1 no último, uma recompensa da zona e inventário cheio. Configure o jogador com 1 PV e a primeira vez. Use RNG fixo com dois acertos. Se o inimigo restante agir entre os ataques, use o ID de turno retornado na recarga.

| Cenário | Ação | Resultado esperado |
| --- | --- | --- |
| Combate ativo | Inicie e revele o evento por POST em `/parties/:id/actions`. Ataque o primeiro inimigo e consulte `GET /parties/:id`. | POST traz `combatUpdates` em ordem. GET preserva combate, ordem, turno e janela, mostra o primeiro inimigo com 0 PV e oferece apenas alvos vivos. GET omite o lote. |
| Recusa após recarga | Envie ataque com turno obsoleto e alvo indisponível. Compare o save antes e depois. | HTTP 409 com `staleCombatTurn`. O snapshot persistido, o RNG e `savedAt` permanecem iguais. |
| Reflexão fatal | Ataque o último inimigo usando os IDs da recarga e consulte novamente. | Vitória com `combat: null`, `lastCombatResult.playerDown: true`, jogador com 0 PV e `down: true`. A recompensa tem origem de fluxo `source.type: combatEvent`. A carta segue reservada e `availableActions` contém apenas `resolveReward`. |
| Recompensa e sessão | Encerre com `POST /parties/:id/session/end`, reabra com `POST /parties/:id/session`, consulte e resolva a recompensa mantendo-a e descartando o item anterior. | A escolha conserva o ID após reabrir. A resolução entrega o item, fecha o desfecho e descarta a carta de combate uma vez. Nova consulta preserva a queda e mostra `availableActions: []`. |
| Deck legado | Recarregue um save v8 com descarte, um encontro aberto e cartas de combate executáveis repetidas na composição. Compare a linha após GET, após recusa, após fechar a escolha e após a próxima inicialização elegível. Repita com pilha de compra vazia. | GET e recusa preservam a linha. A inclusão aguarda o fechamento da escolha e acrescenta cada ocorrência ao fundo na ordem configurada, uma vez por tipo de zona, sem alterar o RNG. Com pilha vazia, as ocorrências ficam disponíveis antes da reciclagem. |

## Checks

- Falhas iniciais do REQ-123 confirmadas pelo autor.
- Após a implementação, passaram `npm.cmd run typecheck`, ESLint nos arquivos alterados e `git diff --check`. A inspeção dos arquivos de domínio alterados confirmou o uso das portas e do RNG semeado já existentes.
- Na primeira rodada após a implementação, o autor obteve 135 testes aprovados e 7 falhas em 9 arquivos. Os dois casos REQ-123 passaram. As falhas vieram de fixtures v2–v6 montadas com configurações atuais de combate, rejeitadas pelos schemas legados.
- O helper `test/factories/remove-combat-config.ts` remove essas chaves nas fixtures unitárias e nos e2e que usam o mesmo padrão. A validação dos saves legados continua estrita. `npm.cmd run typecheck` e `git diff --check` passaram após o ajuste.
- A rodada e2e enviada pelo autor falhou na conexão com o PostgreSQL, com `ECONNREFUSED` em `::1:5432` e `127.0.0.1:5432`. Os 12 arquivos falharam no setup e os 102 testes foram pulados. Para repetir, o autor inicia o serviço `postgres` com `docker compose up -d --wait postgres` antes do comando e2e.
- Com o PostgreSQL disponível, o autor obteve 98 testes aprovados e 4 falhas em 12 arquivos. Os dois cenários HTTP da T-49 passaram. Foram corrigidas as expectativas do repositório (v9), da criação de campanha (`triggeredEffectChoice`) e da recarga após resolução concorrente (`combatUpdates` apenas no POST). O payload de substituição da coleção foi ajustado para a validação editorial aceitar seu deck e chegar à proteção de conteúdo em uso.
- O autor confirmou que a repetição dos e2e passou após as correções. A contagem final não foi informada.
- O autor confirmou a aprovação dos unitários após o ajuste das fixtures. A contagem final não foi informada.

## Ponte com o frontend

- Levar CONTRATO v0.65, ROADMAP v0.63 e o roteiro de recarga da FEAT-13 ao frontend. Registrar o retorno da integração antes de fechar a FEAT.
- Em 2026-11-21, o frontend confirmou o recebimento dos documentos para a T-67. O script `test/prepare-feat-13.cjs` prepara uma cópia temporária do catálogo com `content` e cria duas campanhas no banco de teste com `campaigns`, após o autor iniciar o backend com esse catálogo. O comando `validate:content` aprovou a cópia com 25 cartas. A criação das campanhas pela API aguarda o ambiente. O script imprime o endereço de cada campanha.
- A API respondeu `200` no health, mas o catálogo servido retornou `404` para `fixture.fire-ambush`. O preparador interrompeu antes de criar as campanhas. A versão anunciada pelo health foi atualizada para v0.65 no código. A preparação aguarda a instância iniciada com o catálogo temporário.
- Após iniciar com o catálogo temporário, o preparador criou os saves `f60efee9-246d-4213-af48-5f0fca71379f` (efeito disparado) e `f497a845-0b2a-4c9b-a8f5-172a37634539` (Reflexão fatal) em `http://localhost:3333`. As consultas retornaram 200, com ambos em sessão e oferecendo `startEvent`. A execução dos cenários aguarda o frontend.
- Retorno parcial da T-67 (devlog 086 do frontend, 2026-11-21) — Chrome contra a API real, com MSW desligado. Passaram a recarga durante o turno inimigo com preservação dos IDs e retomada após pagar 1 ouro, a recarga após o primeiro lobo com recusa `staleCombatTurn` sem mudar snapshot público nem `savedAt`, e a entrega do minério após a reabertura da sessão com a jogadora caída. Os lobos tinham o mesmo rótulo; a ordem dos botões e os IDs distinguiram os alvos.
- O e2e REQ-123 aprovado no backend compara a linha completa do PostgreSQL antes e depois da recusa, incluindo `state.rngState` e `savedAt`. Essa evidência cobre a invariância no save do e2e. A execução integrada não capturou o RNG da campanha antes da recusa.
- A T-67 permanece aberta para os demais cenários determinísticos e para a checagem do RNG na campanha integrada, caso exigida. A FEAT-13 segue `implementado (BE)`.
- Para a próxima rodada, `node test/prepare-feat-13.cjs stale` cria um save de Reflexão fatal, derrota o primeiro lobo e imprime o ID e o payload do ataque anterior. A tentativa parou antes de gravar porque a API na porta 3333 serve outro catálogo. Após o autor iniciar a instância com o catálogo da T-67, combinar o momento da recusa com o frontend. Usar `node test/prepare-feat-13.cjs snapshot <id>` imediatamente antes de autorizar o reenvio e imediatamente depois do 409, antes de qualquer outra ação. Comparar o hash da linha inteira, `rng` e `savedAt`.
- Com o catálogo da T-67 novamente disponível, foi preparada a campanha `cf2d7906-0fb3-4879-97cb-328f75021de5`. O combate `51d9afb1-abbd-49e2-89e5-24cf89bdf356` está no turno `51d9afb1-abbd-49e2-89e5-24cf89bdf356:turn:2:0`, com apenas o segundo lobo elegível. O primeiro ataque usou o turno `51d9afb1-abbd-49e2-89e5-24cf89bdf356:turn:1:0` e o alvo `51d9afb1-abbd-49e2-89e5-24cf89bdf356:enemy:0:0`. Aguardando o frontend para sincronizar a leitura do banco e o reenvio.

- Leitura inicial no PostgreSQL da campanha `cf2d7906-0fb3-4879-97cb-328f75021de5`, antes do reenvio confirmado pelo frontend. `rngState=[0,90,20971531,12]`, `savedAt=2026-11-21T17:10:01.091Z`, SHA-256 da linha `e9dfb0fe4a232ffa49223a05fff8b9cc187d9ba39d5385610dd7e67f9e2f5a44`. Aguardando resultado do reenvio para a segunda leitura.
- O frontend reenviou o ataque obsoleto uma vez e recebeu HTTP 409 `ACTION_NOT_ALLOWED` com motivo `staleCombatTurn`. Sem outra ação na campanha, a segunda leitura no PostgreSQL retornou o mesmo SHA-256 da linha completa, o mesmo `rngState` e o mesmo `savedAt`. O cenário integrado de recusa foi aprovado. A T-67 segue aberta para os demais cenários da matriz.
- O frontend confirmou o registro da aprovação no devlog 086 e a liberação da campanha. O próximo ponto da T-67 é preparar os saves para os demais cenários da matriz do CONTRATO v0.65.

### Preparação da próxima rodada da T-67

- `test/prepare-feat-13.cjs` ganhou o modo `legacy`. Prepara duas campanhas v8 com o Viajante Ferido revelado, um evento no descarte e duas ocorrências de Lobos Uivantes na composição urbana. Uma variante começa com `fixture.t67-traveler-reserve` na pilha e a outra com a pilha vazia.
- O validador de conteúdo aceitou o catálogo temporário com 26 cartas. `node --check` e `git diff --check` passaram. A criação e a leitura dos saves pela API aguardam a confirmação do PostgreSQL de teste e do backend com o catálogo atualizado.
- Após fechar a escolha antiga, a próxima inicialização elegível deve acrescentar as duas ocorrências de Lobos Uivantes no fundo da pilha. Na variante vazia, os lobos devem aparecer antes da reciclagem do descarte. Os demais grupos da matriz ainda precisam de fixtures e saves próprios.
- Após a confirmação do ambiente, `node test/prepare-feat-13.cjs legacy` criou o deck misto `f739c4d8-18e9-4090-89f1-968623044dd3` e a pilha vazia `6a2e39f1-940a-4631-95a2-1134be32e2a0`. Em `http://localhost:3333`, `GET /parties/:id` retornou HTTP 200, fase `encounter` e carta `fixture.wounded-traveler` nos dois saves. A resolução fica para a validação integrada.

- O frontend confirmou a recarga e a primeira revelação de ambas as variantes. A consulta ao PostgreSQL após a revelação confirmou snapshot v9 nos dois saves. No deck misto, a carta revelada foi `fixture.t67-traveler-reserve` e a pilha ficou com dois `fixture.howling-wolves`. Na variante vazia, a API confirmou combate com `fixture.howling-wolves` e a pilha ficou com um lobo. O descarte urbano em ambos, em ordem, foi `fixture.t67-traveler-reserve`, `fixture.wounded-traveler`. O RNG persistido permaneceu `[0,0,0,10]`, a mesma semente da preparação. A compra foi da primeira carta elegível, sem reciclagem, e o save de combate ficou na janela `prepare`. Cenário v8 aprovado. Os demais cenários da T-67 seguem pendentes.

## Commit sugerido

`feat/persist and expose combat state (t-49)`

### Habilidades com 0 PA na T-67

- O modo `abilities` de `test/prepare-feat-13.cjs` prepara duas campanhas e revela o evento depois de gastar o último PA. Golpe Pago custa 2 de ouro e uma carta escolhida da mão, com recarga de dois ciclos. Socorro de Campo custa 1 de ouro, recupera 1 PV e é a única operação de Preparar no encontro. O encontro permanece aberto após pagar 2 de ouro na primeira parte, com 3 de Vigor por pagar.
- `node --check` e `git diff --check` passaram. O validador de catálogo aprovou as 30 cartas. A criação dos saves e a confirmação das opções pela API aguardam o PostgreSQL de teste e o backend iniciado com o catálogo temporário.
- Na validação integrada, conferir o ataque básico após pagar Golpe Pago, o descarte e a recarga. No encontro, usar Socorro de Campo, pagar apenas a parte de ouro e repetir a intenção. Esperado: `usableAbilities: []`, sem `prepare` e HTTP 409 `eventPaymentStarted` sem nova cobrança.
- Após a confirmação do ambiente, foram criadas as campanhas Golpe Pago (`6ca3ea6f-682b-4d8b-8230-1ee46f71a54c`) e Socorro de Campo (`538dec1d-59f2-48cc-ac13-db68cdcd6d74`) em `http://localhost:3333`. O GET de ambas retornou 0 PA, 10 de ouro e a habilidade pagável com os custos esperados. No primeiro save, `combatAttack` está disponível. No segundo, `prepare` está disponível com uma única habilidade e `activatableEffects: []`, e as duas exigências estão pendentes. Os saves aguardam a execução no Chrome com MSW desligado e o retorno do devlog 086 do frontend.
### Empate e mudança de Celeridade na T-67

- O modo `initiative` de `test/prepare-feat-13.cjs` cria duas campanhas com Celeridade 10 para o jogador e para as duas cópias do mesmo lobo. A campanha de mudança equipa a arma com Acelerar, habilidade gratuita que concede +5 de Celeridade por dois ciclos.
- `node --check test/prepare-feat-13.cjs` e `git diff --check` passaram. `npm.cmd run validate:content` aprovou o catálogo temporário com 27 cartas.
- A criação das campanhas aguarda a confirmação do PostgreSQL de teste e do backend iniciado com esse catálogo. Na revelação, conferir os IDs distintos na ordem impressa e cruzá-los com `combatTurnStarted`. Depois de Acelerar, conferir que `combat.order` permanece igual no ciclo 1 e que o jogador abre o ciclo 2 após `endCombatTurn`. A campanha de controle deve manter os lobos na frente no ciclo 2.
- Com o ambiente confirmado pelo autor, o preparador criou as campanhas e verificou que ambas retornam HTTP 200 em `GET /parties/:id` na API `http://localhost:3333`. Empate: `d4f56370-404a-4411-80c0-a2c1faf30b81`. Mudança de Celeridade: `323dfc31-8eda-4faa-be87-9ce7954e193b`. Aguardando a execução dos cenários pelo frontend.
### Reset de recarga na entrada em combate na T-67

- O modo `cooldown` de `test/prepare-feat-13.cjs` prepara Lia com Socorro de Campo, 10 de ouro e Lobos Uivantes no topo. Deixa a campanha em antecipação e confere as opções de preparar e revelar pelo GET.
- Após usar a habilidade e antes da revelação, `node test/prepare-feat-13.cjs cooldown-state <id>` consulta o snapshot persistido. Esperado: fase `anticipation`, 9 de ouro e `usage` com um uso e recarga positiva. Antes do uso, espera-se `usage: null`. Após revelar na mesma vez, conferir `combat.abilityStates` com `cooldownRemaining: 0` e a opção disponível na janela de Preparar do primeiro turno elegível.
- A criação da campanha aguarda confirmação do PostgreSQL de teste e do backend com o catálogo temporário da T-67. Verificações locais: `node --check` e `git diff --check`.
- Em 2026-11-21, com o ambiente confirmado, o modo `cooldown` criou o save `db73046c-05bb-4cbe-a09b-7e822e9a47c9` na API v0.65. O GET confirmou Lia em antecipação com Socorro de Campo disponível, e `cooldown-state` confirmou 10 de ouro e `usage: null`. Lobos Uivantes foi colocado no topo. O uso da habilidade e a revelação aguardam a validação integrada.
- Retorno integrado da T-67 em 2026-11-21, no save `db73046c-05bb-4cbe-a09b-7e822e9a47c9`. Antes da revelação, o PostgreSQL confirmou `anticipation`, 9 de ouro, `uses: 1`, `cooldown: 3` e `savedAt: 2026-11-21T19:26:57.446Z`. Ao revelar Lobos Uivantes na mesma vez, a API v0.65 retornou HTTP 200 com `cooldownRemaining: 0` e `usesRemaining: 1`. Socorro de Campo ficou disponível na primeira janela de Preparar no Chrome. Cenário aprovado sem divergências.

### Saves para repetir os cenários de Celeridade e 0 PA na T-67

- Em 2026-11-21, os quatro saves anteriores responderam HTTP 200 na API v0.65. Os três combates estavam no ciclo 2 e o encontro de Socorro de Campo já registrava o pagamento de ouro, com Preparar indisponível. Esses estados foram preservados.
- Os modos `initiative` e `abilities` de `test/prepare-feat-13.cjs` criaram quatro saves para repetir os cenários desde o início. Empate `c7a8f174-f5be-492a-afad-925a8793db84`, mudança `aa0d4823-461d-4be9-a65a-a0fe06aaed5f`, Golpe Pago `7b9f5b13-913b-4ef1-b472-e358d6a04c0e` e Socorro de Campo `239fd7d1-3dd7-434a-819e-010cb4bcf226`.
- O GET dos quatro saves retornou HTTP 200. Os dois de Celeridade oferecem `startEvent`. Golpe Pago está disponível no ciclo 1 com 0 PA e 10 de ouro. Socorro de Campo está disponível no encontro com 0 PA, 10 de ouro e `payments: []`. Aguardando retorno da execução no frontend.

### Retorno integrado de Celeridade e habilidades com 0 PA na T-67

- Fonte: devlog 086 do frontend, `docs/devlog/086-T-67-validacao-integrada-feat-13.md`. Os quatro cenários passaram no Chrome com MSW desligado contra a API real v0.65 em `http://localhost:3333`, sem divergências.
- Empate de Celeridade (`c7a8f174-f5be-492a-afad-925a8793db84`): lobos com IDs distintos. `combat.order` e `combatTurnStarted` seguiram Lobo 1, Lobo 2 e Lia nos dois ciclos.
- Mudança de Celeridade (`aa0d4823-461d-4be9-a65a-a0fe06aaed5f`): Acelerar preservou a ordem do ciclo 1. Lia abriu o ciclo 2, seguida pelos lobos na ordem projetada.
- Golpe Pago com 0 PA (`7b9f5b13-913b-4ef1-b472-e358d6a04c0e`): uma cobrança reduziu o ouro de 10 para 8. Destreza saiu da mão, o descarte passou de 0 para 1 e o ataque básico funcionou. A recarga ficou em 2 após o uso, 2 no ciclo 2, 1 no ciclo 3 e 0 no ciclo 4, quando a habilidade voltou a ficar disponível.
- Socorro de Campo com 0 PA (`239fd7d1-3dd7-434a-819e-010cb4bcf226`): única opção de Preparar. O uso deixou 9 de ouro. Pagar só o requisito de ouro deixou 7, com 3 de Vigor por pagar, `usableAbilities: []` e sem `prepare`. Um reenvio do POST original via `fetch` retornou HTTP 409 `eventPaymentStarted`, preservando o estado inteiro. O reset já aprovado em save próprio completa esta linha da matriz.
- Situação da matriz v0.65: quatro linhas aprovadas (deck v8, Celeridade, habilidade com custo a 0 PA e habilidade fora de combate a 0 PA). Duas têm cobertura parcial (Reflexão fatal com inventário cheio e turno obsoleto). Seis aguardam retorno integrado (catálogo legado e classe restrita, lote de pagamentos, desfecho imediato, Área/Precisão zero/elemento/Reflexão, suporte e Canalizada, fuga e limite em Sem fuga).
- Próxima rodada proposta: reaproveitar o preparador para confirmar a ação com o turno atual após a recusa e as duas opções de recompensa com Lia caída, em saves separados. Preparar também uma variante de derrota para conferir a execução única do desfecho ruim. A FEAT-13 segue `implementado (BE)` e a T-67 segue aberta.

### Turno atual e desfechos na T-67

- `test/prepare-feat-13.cjs outcomes` prepara quatro saves. Turno atual, Manter e Deixar começam após a queda do primeiro lobo, com Lia a 1 PV e inventário cheio. Derrota começa no primeiro turno de Lia, com 1 PV, 10 de ouro e um lobo capaz de derrubá-la ao encerrar a vez. A carta de derrota aplica perda de 5 de ouro.
- Para Turno atual, reenviar o ataque anterior, esperar 409 `staleCombatTurn`, recarregar e atacar o alvo vivo com os IDs da recarga. Esperado HTTP 200, vitória e queda por Reflexão. Nas outras duas vitórias, resolver o minério em saves independentes. Manter descarta o peixe e entrega o minério. Deixar preserva o peixe e devolve o minério ao deck urbano. A última escolha esvazia `pendingRewards` e `availableActions`, preserva Lia caída e descarta a carta de combate uma vez.
- Em Derrota, encerrar o primeiro turno, recarregar e reabrir a sessão. Esperado `resolution: defeat`, Lia caída, 5 de ouro em todas as leituras após a derrota e uma ocorrência da carta no descarte. Reenviar o encerramento original para checar que o ouro e o descarte permanecem iguais. `node test/prepare-feat-13.cjs outcome-state <id>` mostra ouro, descarte urbano e deck de recompensas, além do hash, RNG e `savedAt`.
- `node --check`, `git diff --check` e o validador do catálogo temporário passaram. O catálogo contém 31 cartas. A criação dos saves e a verificação pela API aguardam confirmação do PostgreSQL de teste e do backend com o catálogo atualizado. Horas a preencher pelo autor.
- Após confirmação do ambiente, `outcomes` criou e conferiu por GET os saves Turno atual (`3ad72beb-b030-4dc7-b210-323525a0845c`), Manter (`0123e4f8-3905-4747-bb5f-d25433092a33`), Deixar (`dbafa5d8-8b1f-4687-891d-3b578f6936d0`) e Derrota (`1527de24-10fb-4538-8b49-f5808015b665`). A API em `http://localhost:3333` confirmou v0.65 no health. Nos três primeiros, resta apenas o segundo lobo no turno atual. No quarto, Lia tem 1 PV, 10 de ouro e pode encerrar o turno. O ataque obsoleto de Turno atual usa o combate `51b6eb5b-7fc1-4794-94a0-93adb5a54c2a`, seu turno `:turn:1:0` e seu alvo `:enemy:0:0`. A execução dos cenários aguarda o frontend.

### Retorno integrado de turno atual e desfechos na T-67

- O autor confirmou os quatro cenários do devlog 086 no Chrome com MSW desligado contra a API v0.65. Turno atual retornou 409 `staleCombatTurn` e, usando os IDs da recarga, 200 com vitória e Lia caída por Reflexão. Manter e Deixar retornaram 200 no ataque e na escolha, com `kept` e `returnedToDeck`, respectivamente. Após recarga, ambos mantiveram Lia caída com `pendingRewards: []` e `availableActions: []`. Em Derrota, o encerramento retornou 200 e o ouro passou de 10 a 5. Após recarga e reabertura, o reenvio retornou 409 `staleCombat` e o ouro permaneceu em 5.
- A consulta somente leitura com `outcome-state` confirmou, nos saves listados acima, uma ocorrência de `fixture.howling-wolves` no descarte urbano de Manter e uma no de Deixar. O deck urbano de Manter ficou vazio. O de Deixar contém uma cópia de `fixture.iron-ore`. Em Derrota, o descarte urbano contém uma ocorrência de `fixture.t67-defeat` e Lia tem 5 de ouro. Sem divergências.
- As linhas de turno obsoleto e Reflexão fatal com inventário cheio estão aprovadas. A T-67 segue aberta com seis linhas pendentes no CONTRATO v0.65. A FEAT-13 permanece `implementado (BE)`.

### Catálogo legado e habilidade restrita na T-67

- `test/prepare-feat-13.cjs catalog` prepara três campanhas com Lia Guerreira e a Lâmina de Classe equipada no primeiro turno de combate. A arma permite Golpe Livre e restringe Golpe do Ladino à classe Ladino. O GET após a criação deve projetar só Golpe Livre entre essas habilidades e os limiares 13, 13 e 0, respectivamente para campo ausente, nulo e zero. O valor de laboratório gravado na configuração de cada save é 13.
- A cópia temporária também inclui `fixture.t67-legacy-combat` com habilidade e desfechos textuais. No editor, submeter separadamente uma cópia executável sem o `form` de uma habilidade com `id` e outra com `badOutcome.steps: null`. Esperado HTTP 400 `CONTENT_INVALID` com os campos correspondentes. Em jogo, conferir a restrição da arma, a recusa `combatAbilityUnavailable` e a vitória com desfecho `steps: []`.
- `node --check`, `git diff --check` e o validador do catálogo temporário passaram. O catálogo contém 36 cartas. A criação dos saves aguarda confirmação do PostgreSQL de teste e da API v0.65 iniciada com o catálogo e `LAB_ENABLED=true` para o editor. Horas a preencher pelo autor.
- Retorno parcial do devlog 086 no Chrome com MSW desligado. O catálogo legado retornou 200 com Uivo e os desfechos textuais legíveis. O envio via `fetch` de cada corpo inválido retornou 400 `CONTENT_INVALID`, com os caminhos `enemies.0.abilities.0.form` e `badOutcome.steps`.
- Com a API disponível e a criação solicitada, o modo `catalog` criou e conferiu por GET Limiar ausente (`a53e8f3f-8766-4615-a289-ea37038ffbdb`), Limiar nulo (`a85c2df2-c12a-4d73-b021-5de173459580`) e Limiar zero (`2aaa723c-4410-48ce-bb88-c9f1fee66924`). Os limiares projetados foram 13, 13 e 0. A Lâmina de Classe ficou equipada e, entre suas duas habilidades, só Golpe Livre foi projetado. A linha aguarda a validação em jogo pelo frontend.
- Retorno final do devlog 086 (linha 150) no Chrome com MSW desligado e API real v0.65. Os três GETs retornaram 200, com limiares 13, 13 e 0. Em Limiar ausente, a Lâmina de Classe estava equipada, Golpe Livre estava disponível e Golpe do Ladino não constava de `combat.abilities`. A tentativa com os IDs atuais retornou 409 `ACTION_NOT_ALLOWED` com `combatAbilityUnavailable`. O GET seguinte preservou o turno e `savedAt`. O ataque básico retornou 200, `combat: null`, vitória e `pendingRewards: []`.
- Linha Catálogo legado e habilidade restrita aprovada sem divergências. A T-67 segue aberta com cinco linhas pendentes. A próxima linha na matriz é Pagamento automático e escolha de mão, slot e recursos. A FEAT-13 permanece `implementado (BE)`.

### Pagamento automático e escolha de mão, slot e recursos na T-67

- `test/prepare-feat-13.cjs payments` prepara Lia no primeiro turno, na janela `prepare`, com a habilidade Pagamento em Lote. O GET confere dois custos automáticos (2 de ouro e descarte aleatório de uma Destreza), duas entradas de uma Força com os mesmos dois IDs de cópia elegíveis, uma escolha de equipamento no slot `head` e duas entradas de um recurso com os mesmos candidatos, Minério de Ferro e Peixe Prateado, cada qual limitado a uma cópia por entrada.
- Roteiro: abrir e recarregar a campanha no Chrome com MSW desligado. Conferir a projeção e montar o lote pelas quantidades da API. No mesmo turno, enviar separadamente um lote que repete a mesma Força e um que agrega duas cópias de Minério de Ferro. Cada recusa deve retornar 409 `ACTION_NOT_ALLOWED` com `paymentInvalid` e preservar a projeção pública. Sincronizar cada POST com leituras `snapshot <id>` antes e depois, sem outra ação entre elas. O hash da linha inteira, `rng` e `savedAt` devem coincidir. Depois, enviar duas Forças distintas, `head` e uma cópia de cada recurso. Esperado 200, 2 de ouro pagos, duas Forças e uma das duas Destrezas descartadas, elmo removido, inventário sem os dois recursos, 1 PV recuperado e RNG persistido diferente da leitura anterior. Recarregar para confirmar a persistência.
- `node --check`, `git diff --check` e o validador do catálogo temporário passaram (37 cartas). A criação do save e a conferência do GET aguardam confirmação do PostgreSQL de teste e da API v0.65 com o catálogo atualizado. Horas a preencher pelo autor.
- Em 2026-11-21, após confirmação do ambiente, `/health` retornou `ok` com contrato v0.65 e `payments` criou a campanha `c083f419-aeca-4ca3-a5b6-7ce048ef1617`. O GET confirmou a janela `prepare` e as sete entradas esperadas, com `hand-1` e `hand-2` para ambas as escolhas de Força. A primeira recusa aguarda a conferência do frontend e a leitura do save pelo backend.
- No Chrome com MSW desligado, a recarga confirmou `canPay: true` e as sete entradas. A interface bloqueou a Força repetida e permitiu escolher Minério de Ferro nas duas entradas, embora o inventário tenha uma cópia. O único POST via `fetch` com `hand-1` repetido retornou 409 `ACTION_NOT_ALLOWED` com `paymentInvalid`. Antes e depois da recusa, o SHA-256 da linha inteira foi `b1009610f96a394c5eab9884133b61e44d5f5290e1528a24d98a4c3813a00e49`, o RNG foi `[0,0,0,10]` e `savedAt` foi `2026-11-21T20:09:13.954Z`. A leitura pós-recusa é a referência para o segundo POST, com duas cópias de Minério de Ferro.
- O botão Usar habilidade enviou um único lote com `hand-1`, `hand-2`, `head` e `resources: [{ cardId: 'fixture.iron-ore', copies: 2 }]`. A API retornou 409 `ACTION_NOT_ALLOWED` com `paymentInvalid`. A leitura após o POST confirmou o mesmo hash, RNG e `savedAt`. Lote válido liberado para a próxima verificação.
- O lote válido enviado pela interface retornou 200. A recarga confirmou 8 de ouro, 20/20 PV, somente a Destreza `hand-3` na mão, três descartes, `head` vazio e inventário vazio. O PostgreSQL confirmou RNG `[0,0,10,11]`, `savedAt` `2026-11-21T20:16:46.917Z` e SHA-256 `f4f8748ed6c69bbc7da1a53f69634b30905436560c9ac9eb710847c625388dd0`.
- Linha de pagamento aprovada conforme o CONTRATO v0.65. A interface permite enviar o total acima do saldo compartilhado e a API o recusa conforme previsto. Restam quatro linhas na T-67. A próxima é Revelação com vitória ou derrota imediata. A FEAT-13 permanece `implementado (BE)`.
