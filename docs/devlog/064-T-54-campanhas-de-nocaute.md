# 064 — T-54 — Campanhas determinísticas de nocaute

- Data — 2026-11-21
- Status — em andamento
- Spec — T-54, REQ-124 a REQ-130
- Contrato — v0.69, FEAT-14 acordada
- Horas — a preencher pelo autor

## Preparação

- Retomada do devlog 063, com as verificações da T-53 confirmadas pelo autor.
- `test/prepare-feat-14.cjs` usa o padrão do devlog 058. O modo `content` copia as fixtures para uma pasta temporária, inclui a Vila do Retorno e as cartas da T-68. O modo `campaigns` cria campanhas pela API e grava os pontos de partida no PostgreSQL de teste com RNG fixo. Imprime uma linha JSON por campanha com URL, ID e IDs de ação disponíveis. O modo `snapshot <id>` consulta a linha diretamente, sem disparar a retomada legada do GET.
- As derrotas legadas são preparadas em sessão inativa. A vitória legada começa em sessão ativa, com recompensa pendente e 0 PA. Os saves usam v9 sem o resumo novo, como no devlog 063. A variante sem ponto salvo também omite as cinco chaves novas do snapshot de configuração.
- O catálogo temporário passou no validador depois de ajustar as Urbanas para quatro setas e manter a ação editorial obrigatória `startEvent`. São 30 cartas em uma coleção. `node --check` e `git diff --check` passaram. Falta confirmar o ambiente antes de criar os saves e verificar as projeções iniciais pela API.

## Roteiro para a T-68

No Chrome, configure o frontend para a API real em `http://localhost:3334` e desligue o MSW. Use a lista de URLs e IDs emitida pelo preparador. Em cada cenário, use os IDs atuais da resposta para fazer a ação. Use o painel de rede para conferir os envelopes de POST e GET e para enviar as intenções de recusa quando a UI ocultar a ação. Ações vão para `POST /parties/:id/actions`. Para reabrir, faça `POST /parties/:id/session/end` e `POST /parties/:id/session`.

As quedas partem da rodada 6 com 2 PA, Pico 10, Vigor 9, PV 2/22, bolsa 37 e cofre 80, salvo os pontos de partida legados. O respawn padrão na Vila do Retorno abre a rodada 8 com 3 PA, PV 2/21, `down: false`, Pico 9, Vigor 4, bolsa 34, cofre 80 e `skipNextTurn: false`. Confira a estabilidade do ID de `lastKnockout` e dos saldos em GET e reabertura. O GET omite `combatUpdates`.

| Campanha | Ação | Resultado esperado |
| --- | --- | --- |
| salvar | Do Porto Cinzento, envie `{"type":"move","zoneId":"fixture.respawn-town"}`. Salve com `{"type":"saveRespawnPoint"}`, recarregue e salve novamente. Tente uma terceira vez e tente também enviar a ação com `zoneId`. | O ponto inicial é o Porto. Mover deixa 2 PA e conserva o ponto antigo. Salvar grava a Vila e deixa 1 PA. Repetir retorna 200 e 0 PA, com a ação ausente. Terceira tentativa 409 `noActionPoints`. Campo extra retorna 400 `unknownKey` para `zoneId`. POSTs aceitos têm `combatUpdates: []`. |
| recusa-floresta | Envie `saveRespawnPoint` na Mina Velha com 2 PA. | 409 `ACTION_NOT_ALLOWED` com `zoneActionUnavailable`. A ação é ausente na UI. Compare o GET antes e depois e, se necessário, confirme RNG e `savedAt` com o modo `snapshot`. |
| doacao-tempo | Use `{"type":"prepare","operation":"useAbility","equipmentSlot":"weapon","abilityId":"fixture.t68-donate"}`. Confira Socorro de Campo e o status antes e depois. | Respawn padrão, `combatUpdates: []`, `lastKnockout.combatId: null` e perda de 3 de ouro. Na rodada 8 o status expirou e Socorro de Campo aparece em `usableAbilities`, com `prepare` disponível. |
| doacao-encontro | Com Força já paga, envie `payEventRequirement` com o ID do encontro e `requirementId: "life"`. | 200, encontro nulo, sem recompensa, revés `gaveUp`, recibos `attrs` e `life` na ordem, `peakDelta: -1`, reposição 1/1. A Destreza entra na mão, Força vai ao descarte de atributos e a carta ao descarte da floresta. Respawn com Pico 8 e bolsa 29. |
| cura-com-escolha | Envie `giveUpEvent` com o ID do encontro. Recarregue, reabra e use `resolveReward` com o ID retornado e `choice: "leave"`. | Antes da escolha, encontro em `setback`, mesma recompensa fixa, PV 0, caído, rodada 6, 2 PA e só `resolveReward`. A cura antes e a cura depois da escolha restauram 0. A picareta vai ao limbo. O POST final conclui o revés e traz respawn com Pico 8 e bolsa 34. |
| derrota | Passe o turno de combate com `endCombatTurn`, usando `combatId` e `turnId`. | Golpe inimigo fatal, `combat: null`, resultado `defeat` e causa `playerDown`. Bolsa 29 após o revés e o nocaute. O resumo referencia o combate e o lote traz as transições na ordem. |
| reflexao-automatica | Faça `combatAttack` usando `combatId`, `turnId` e `targetId` da preparação. | O lobo cai antes da Reflexão. Vitória `enemiesDefeated` com `playerDown: true`, picareta no inventário e respawn na mesma resposta. O lobo da fixture dá +1 Pico pela vitória. Após a penalidade de 1 Pico, ficam Pico 10, Vigor 5 e 2/22 PV. |
| reflexao-com-escolha | Faça o mesmo ataque com os IDs desta campanha. Recarregue, reabra e deixe a recompensa por `resolveReward`. | Vitória preservada, inventário cheio, PV 0 e apenas `resolveReward` com a mesma recompensa fixa até a conclusão. A picareta vai ao limbo. O último POST traz o mesmo respawn da entrega automática, com o ID do combate no resumo. |
| legado-vitoria | Abra o save, recarregue, reabra e deixe a recompensa. | PV 0, 0 PA e `resolveReward` com o ID gravado. O último POST avança para a rodada 8 com 3 PA e mantém a vitória. |
| legado-derrota-salvo e legado-derrota-ausente | Primeiro GET com a sessão inativa. Repita e reabra. | O primeiro GET aplica o respawn uma vez. Ponto válido leva à Vila e ponto ausente leva ao Porto. Bolsa 29, cofre 80, rodada 8 e resultado original preservado. Em `idle`, a API ainda projeta `move`, `recover`, `adjustDeck`, `useVault` e `endTurn`. A sessão precisa ser reaberta para executar ações. |
| legado-derrota-invalido | Reabra diretamente antes de consultar o save por GET. | A reabertura resolve o ponto inválido para o Porto, com 3 PA e os mesmos saldos da derrota legada. GET seguinte preserva o resumo. |
| espera-zero | Repita Doação Fatal nesta campanha. | Respawn na rodada 7 com 3 PA e mesmas penalidades. Status e recarga ainda duram uma rodada. Confirme no POST e no GET que `fixture.t68-field-aid` está ausente de `usableAbilities`. `fixture.t68-donate` pode aparecer. |

### Laboratório

Em `GET /lab/config`, confira as cinco chaves, padrões e limites inteiros da tabela da FEAT-14. Envie `PATCH /lab/config` com `{"knockoutHealthPercent":0,"soloKnockoutWaitRounds":1.5}`. Espere 400 com `outOfRange` e `notInteger` e compare todo o `values` no GET seguinte. Envie um PATCH válido com `{"soloKnockoutWaitRounds":0}` e crie uma campanha no frontend. Compare o snapshot dessa campanha com o de uma campanha de referência de espera padrão. A nova tem 0 e a anterior conserva 1. Execute o reset pelo laboratório e confira `values` igual a `defaults`. A campanha criada após o PATCH conserva 0. A campanha `espera-zero` cobre separadamente o fluxo de queda desde a rodada 6.

## Ponte com o frontend

- Em 2026-11-21, `GET http://localhost:3334/health` retornou 200 com `status: ok` e `contractVersion: "0.65"`. A versão anunciada pelo health está atrasada em relação ao contrato v0.69 usado no roteiro. O preparador confirmou o laboratório e as cartas da T-68 pela API e criou as 13 campanhas no banco dedicado.
- As projeções iniciais passaram nas verificações do preparador. As três derrotas legadas foram gravadas e reservadas para a primeira leitura ou reabertura do frontend, que também executa o respawn.
- Pendente o retorno integrado com MSW desligado. Manter o PostgreSQL e o backend da porta 3334 disponíveis.

### Campanhas disponíveis na API

Use `http://localhost:3334/parties/<id>`. Para ações, obtenha o ID do encontro em `randomEventEncounter.id`, do combate em `combat.id`, do turno em `combat.turn.id`, do alvo em `combat.attackTargetIds[0]` e da recompensa em `pendingRewards[0].id`.

| Campanha | ID |
| --- | --- |
| salvar | `cce44605-b006-4785-b8c6-bb8c24e74859` |
| recusa-floresta | `66c238fe-e4d0-47f1-8fe7-3aa09b95fd0d` |
| doacao-tempo | `322fbffe-7e09-49c6-b416-e235980d8515` |
| doacao-encontro | `f81aa2a9-6609-4498-9ad7-3020d93c9541` |
| cura-com-escolha | `03ff7adb-e837-45af-b21e-76972da75481` |
| derrota | `47cb222c-50ee-4db7-b9b1-4692232aa486` |
| reflexao-automatica | `f23b496e-f0bc-4345-89fc-5ae7cbb45000` |
| reflexao-com-escolha | `e61f7c1f-a3e9-4a5c-9cf9-6c8c9273690b` |
| legado-vitoria | `b7b81331-bc99-4dd7-9d55-6a1fe3433cf3` |
| legado-derrota-salvo | `d5e7abaf-011e-4a76-90d2-12fe2120bbce` |
| legado-derrota-ausente | `2d57381c-3ca9-47d3-a5fd-1880fc09aa41` |
| legado-derrota-invalido | `d89c7f17-75b0-4a14-a8e1-8f4214b642d9` |
| espera-zero | `07e26e25-b868-4121-9cf7-ac62b4212077` |

### Retorno integrado e nova rodada

- O frontend executou os 13 cenários e o laboratório em Chrome com MSW desligado. O devlog 088 do frontend registra o resultado por cenário. A reflexão com escolha, os GETs legados inativos e a recarga com espera zero foram os pontos levantados para revisão.
- Nos dois saves de Reflexão, a vitória deu +1 Pico e o resumo gravou perda de 1 Pico no nocaute. O exemplo do contrato supõe ausência de outros ajustes no saldo. Com o lobo desta fixture, 10 + 1 − 1 deixa Pico 10, teto de Vigor 5 e vida 2/22. Corrigida a expectativa do roteiro para esta carta.
- A lista genérica de ações em `idle` segue a projeção já usada na criação de campanhas pelas FEATs 07–09. A exigência de lista vazia veio do roteiro. Mantêm-se a projeção existente e o bloqueio de POSTs de ação em sessão inativa.
- Na espera zero original, o PostgreSQL registrou Socorro de Campo com `uses: 0` e `cooldown: 1`. O GET da campanha mostrou apenas Doação Fatal entre as habilidades. Um POST novo em `1fcd7fc8-df5a-4646-a633-4bcfb7df51cb` também abriu a rodada 7, manteve o status com `remaining: 1` e mostrou somente Doação Fatal. A aparição de Socorro de Campo relatada no frontend não se reproduziu na API.
- Após o reset do laboratório, o snapshot de `794e0de3-ab3b-4e52-9c23-857093b25f26` conservou `soloKnockoutWaitRounds: 0`. O de `322fbffe-7e09-49c6-b416-e235980d8515` conservou 1.
- O snapshot de `f81aa2a9-6609-4498-9ad7-3020d93c9541` confirmou `discard: ["fixture.strength-basic"]` e `eventDecks[zoneType=forest].discard: ["fixture.t68-fatal-payment"]`.
- O preparador aceita nomes de cenário após `campaigns` para emitir somente os saves necessários. Os IDs abaixo estão intactos para revalidação.

| Campanha | Novo ID |
| --- | --- |
| reflexao-com-escolha | `6f4486a5-b67a-4b07-b2c1-02f5a9f46a2f` |
| legado-vitoria | `2f2a88c2-43d2-4fcf-8c21-ee159389f124` |
| legado-derrota-salvo | `873e49ac-fd5d-473d-8d32-6698d19e7398` |
| legado-derrota-ausente | `a37e89a4-7322-404b-b773-afd0ecff59a6` |
| legado-derrota-invalido | `57ca49e9-f1a1-4561-ba6d-a33775dcdd86` |
| espera-zero | `c7354898-2483-4ac7-83d6-c6d3469790f7` |

### Revalidação bloqueada em 2026-11-22

- O frontend relatou HTTP 500 nos seis saves novos, em `/lab/config` e em um save da rodada anterior. O health da instância respondeu 200. O controller de health devolve estado e versão sem consultar o banco.
- Na verificação seguinte, a porta 3334 recusou conexão e o PostgreSQL aceitou a conexão direta ao banco `misadventures_t54`. Ainda falta a exceção da instância que devolveu os 500 para confirmar a causa. A configuração de conexão dessa instância é uma hipótese, dada a falha em rotas de leitura de tabelas diferentes.
- A consulta SQL direta confirmou os seis IDs na rodada 6, todos sem resumo de nocaute. As três derrotas legadas seguem caídas e em `idle`, com o ponto salvo, ausente ou inválido conforme o cenário. A vitória legada ainda tem a recompensa pendente e a Reflexão com escolha ainda tem o combate ativo. Os mesmos IDs podem ser usados após o backend voltar.
- Após a inicialização pelo autor na porta 3334 com o catálogo temporário e o banco dedicado, o health, o laboratório, a carta de Reflexão e os GETs de espera zero, Reflexão com escolha e vitória legada responderam 200 com CORS para `http://localhost:5173`. Os três saves consultados estão na rodada 6. A Reflexão conserva o combate ativo e a vitória legada conserva a recompensa com 0 PA. As três derrotas legadas ficaram reservadas para a primeira operação do frontend. Revalidação liberada com os mesmos IDs.

## Commit sugerido

`test/prepare knockout reference campaigns (t-54)`
