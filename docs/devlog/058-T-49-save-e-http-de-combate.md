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

## Commit sugerido

`feat/persist and expose combat state (t-49)`
