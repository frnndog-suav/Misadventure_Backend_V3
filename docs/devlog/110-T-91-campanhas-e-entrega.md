# 110 — T-91 — Campanhas e entrega para a T-104

- **Data** — 2026-11-26
- **Situação** — T-91 concluída, validação integrada da T-104 pendente
- **Spec** — v1.14, REQ-178 a REQ-185, D-158
- **Contrato** — v1.09, FEAT-20 implementada no backend
- **Horas** — a preencher pelo autor

## Ambiente e evidências

- Retomada do devlog 109. O autor confirmou 202 testes E2E passando na T-90. A migração `0003_party_action_receipts` foi exercitada no schema isolado dos testes.
- Disponibilizar PostgreSQL, aplicar as migrações em banco dedicado à T-91 e iniciar o backend com uma cópia dedicada de `content/`. Registrar a URL efetiva. Guardar a configuração do laboratório antes dos cenários e restaurá-la ao final, inclusive se houver interrupção.
- Os E2E existentes fornecem referência para a semente, o encontro de Lobos Uivantes com desfechos executáveis e os estados pré-transição. Os cortes devem ocorrer depois do commit humano e depois do commit de uma vez automática, respectivamente. Os resultados da T-104 dependem da reprodução pela API com persistência real.
- Em 2026-11-27, o autor confirmou as tabelas `game_config`, `parties` e `party_action_receipts` no banco `misadventures_t91` e iniciou a API com catálogo temporário. `GET http://localhost:3391/health` retornou 200, `status: ok` e `contractVersion: 1.04`. O valor de versão vem da constante atual do backend e diverge do documento de contrato v1.08. O cabeçalho `Keep-Alive: timeout=5` refere-se à conexão ociosa e não mede o prazo de uma ação em andamento.
- O autor guardou a resposta inicial do laboratório em `/tmp/misadventures-t91-lab.ECZkqE`, antes de alterar a configuração.

| Cenário | Evidência a capturar |
|---|---|
| 1. Opções, criação e legado | Respostas com laboratório desligado, IDs para omissão, zero, máximo e legado, erros de validação e limites antes, durante e após a alteração. Comparar o humano e seu progresso no save legado. |
| 2. Empate e IA em primeiro | Semente, D20 inicial, rerrolagens dos empatados, ordem no save em `idle` e resposta da sessão já na vez humana. |
| 3. Virada de rodada | Ordem com humano entre ajudantes, rodada e estados públicos antes e depois, sequência de checkpoints e retorno ao humano. |
| 4. Interrupção e repetição | Controle contínuo e variantes com a mesma semente e condições equivalentes. Registrar corpos, chaves, checkpoints, estado, RNG, jogadas, resposta original e lote de combate ordenado. Exercitar as duas formas de retomada, perda da resposta, concorrência e replay após uma jogada posterior. |
| 5. Sucessora e congelamento | Sementes, estados à beira da conclusão, rolagens da sucessora, ordem, rodada, cidade, respawn e progressão individual. Registrar congelamento e `409 PARTY_FROZEN` ao reabrir a última dimensão. |
| 6. Prioridades | Respostas do laboratório antes do PATCH, após permutação, para lista inválida e após reset. Comparar os snapshots das campanhas antiga e nova e registrar a restauração. |

## Resultados parciais do cenário 1

- O POST de criação com `{ "name": "T-91 omitido", "characterName": "Lia", "playerClass": "warrior" }` retornou 201 e um membro no save `a1a70b62-e418-4606-9d2d-4e3ff22fa065`. Com nome `T-91 zero` e `aiHelperCount: 0`, retornou 201 e um membro no save `90316142-3e81-45fd-bcdd-a6a0b8b3e994`.
- Com `aiHelperCount` igual a 1.5, null, -1 e 6, o POST retornou 400 `PARTY_INVALID` nesse campo, respectivamente com `notInteger`, `notInteger`, `outOfRange` e `aboveMaxPlayers`.
- O GET retornou 1–6. Após `PATCH /lab/config` com `{ "minPlayers": 2 }` retornar 200, o POST com `aiHelperCount: 0` retornou 400 `PARTY_INVALID` com `belowMinPlayers`. Após restaurar o mínimo para 1, o GET voltou a retornar 1–6.
- `test/prepare-t91-legacy.cjs` confirmou a abertura do controle v11 `cdc32d07-b090-428e-b831-c9a8b726591a` preservando a identidade humana, a vez, os 37 de ouro e o RNG da semente 42. O save v11 `7c9578c1-3352-49f3-9272-812ede34fdac`, com humano `b84e7ef6-7587-4e88-a396-76431317ed3e`, ficou preparado para a T-104 com o mesmo progresso e a mesma semente.
- O autor subiu uma instância temporária com `LAB_ENABLED=false`. `GET /lab/config` respondeu 404 e `GET /parties/creation-options` respondeu 200 com `{ "minPlayers": 1, "maxPlayers": 6 }`. A checagem encerrou a instância temporária.
- Para reprodução com semente 42, os saves em `idle` são `28b0fa97-5e01-498d-ac24-e825e70c83ac` (omitido), `6372cb44-1c96-4c07-bf04-840637080b82` (zero) e `fa4d6736-6a83-42b4-a700-3ab6888b3e3b` (cinco ajudantes). Na API local de preparação, usar `X-T91-Seed: 42` no POST de criação para reproduzir as condições iniciais.

## Duração com cinco ajudantes

- Medir o tempo HTTP até receber a resposta completa de uma ação que execute cinco vezes automáticas, confirmando a sequência persistida. Registrar URL, ação, save, semente e duração observada. Conferir também o fluxo de sessão quando o humano vier depois dos cinco ajudantes.
- O frontend confirmou que `requestJson` em `src/api/http.ts` usa `fetch` sem prazo explícito para a sessão e a ação. A T-104 usa acesso direto a `http://127.0.0.1:3391`, com `VITE_USE_MOCKS=false`, sem proxy. Os máximos observados de 435 ms e 488 ms ficam dentro desse percurso sem prazo explícito de resposta.
- Em 2026-11-27, o autor mediu no backend local `http://localhost:3391`, incluindo a leitura completa dos corpos HTTP. No save `41a7b14b-bd7d-45b7-9f9c-f22015ff5e1a`, o humano `459343e7-7cc0-4840-82c7-8e2983b230d2` ficou em sexto na ordem. A sessão levou **435 ms** e devolveu a vez humana na rodada 1, com 3 PA. O `endTurn` levou **488 ms**, devolveu 80 entradas em `combatUpdates` e, no GET posterior, o mesmo humano estava na rodada 2, com 3 PA. A criação levou 40 ms e o GET posterior 9 ms. O GET de opções, com laboratório ligado, respondeu 1–6.
- Evidências HTTP dessa execução em `C:/Users/meu-o/AppData/Local/Temp/misadventures-t91-AMUgrr`. A coleta usou 60 s como limite próprio. O save medido foi criado pelo fluxo normal com semente aleatória.
- A API de preparação escuta diretamente em loopback. No Node local v26.13.1, o servidor HTTP padrão reporta `timeout: 0` para inatividade do socket, `requestTimeout: 300000` para receber a requisição, `headersTimeout: 60000` para os cabeçalhos e `keepAliveTimeout: 5000` para a conexão ociosa após a resposta. Esses valores não impõem prazo de resposta ao processamento de `endTurn`.
- O controle determinístico `6fc49f5c-8b83-41e2-bc12-08494e527b30` (semente 42) mediu 221 ms na sessão e 485 ms no `endTurn` com cinco vezes automáticas e 70 atualizações de combate. Ao fim do conjunto de verificações, `GET /lab/config` devolveu exatamente o JSON guardado antes do primeiro cenário. Evidências das execuções com semente 42 em `C:/Users/meu-o/AppData/Local/Temp/misadventures-t91-seed42-FGcqxs`.

## Cenário 6 — Prioridades

- O GET confirmou a ordem padrão em `values` e `defaults` e a ausência da chave em `limits`. O PATCH colocou `gold` em primeiro, seguido de `avoidKnockout`, `dimensionCompletion`, `quests` e `peak`. O PATCH com item duplicado retornou 400 `LAB_CONFIG_INVALID` com `invalidPriorities` em `aiPlayerPriorities`.
- Depois do reset, o GET confirmou a restauração integral de `values`. O save anterior `9121c4ea-b6f2-47d4-ae51-8d38495b54fe` manteve a ordem padrão. O save posterior `2d3615fc-3def-4a2b-a0ba-5f5716f8df31` manteve a permutação com `gold` em primeiro. Ambos foram gerados pelo fluxo normal com sementes aleatórias.
- Para a T-104, os saves determinísticos com semente 42 são `043ee90d-aaa1-4ab0-9089-6d5663934652` (ordem padrão) e `5562f4e5-3a75-4a5d-8b37-73a3c5779ba2` (`gold` em primeiro). A leitura direta dos dois snapshots no PostgreSQL confirmou as ordens após o reset.

## Preparação determinística

- `test/serve-t91.cjs` inicia a aplicação compilada em loopback, no banco dedicado, e recebe `X-T91-Seed` por requisição. O log registra as rolagens de D20 e a ordem. `X-T91-Cut-After-Ai-Turns: 0` interrompe antes da primeira vez automática, após o commit humano. Com valor 1, interrompe na entrada da segunda vez automática, após o commit da primeira. O corte retorna 500 e deixa o checkpoint disponível para as rotas normais de retomada.
- O autor iniciou o servidor de preparação. `GET http://127.0.0.1:3391/health` respondeu com `status: ok`. Os cenários usam o acesso local direto por essa porta.

## Cenários 2 e 3 — Ordem e virada de rodada

- Cenário 2 selecionado com a semente 1, save `4ecf36fe-4ff5-4085-a75d-30262d75b9b8` em `idle`. Na ordem da composição (Lia, Ajudante 1, Ajudante 2, Ajudante 3), as rolagens iniciais foram 2, 9, 12 e 12. Só os Ajudantes 2 e 3 rerrolaram, com 18 e 17. A ordem ficou Ajudante 2, Ajudante 3, Ajudante 1, Lia. No controle `0b947e5e-752f-4861-92d0-8e351856db1d`, o POST de sessão retornou 200 com a ordem preservada e a vez de Lia na rodada 1, com 3 PA. O GET devolveu o mesmo estado.
- No cenário 3, a semente 3 deu ordem de jogo Ajudante 3, Lia, Ajudante 1, Ajudante 2. O controle `a60ac282-f1c0-42b2-bd78-b12309c8b329` começou na vez de Lia na rodada 1, com 3 PA. O POST com `{ "type": "endTurn" }` e chave UUID devolveu 54 atualizações de combate. O GET confirmou a mesma ordem e a vez de Lia na rodada 2, com 3 PA.
- A campanha equivalente `70e0a329-6a9a-49c0-b4b3-4d39d19ecc03` está pronta na vez humana da rodada 1, com 3 PA. A sequência após a ação foi confirmada em três controles separados com semente 3. Após o commit humano, Ajudante 1 na rodada 1 (save `84fcb1df-fa97-463f-bfdf-c9707ce90f44`, lote acumulado de 0 atualizações). Após a primeira vez automática, Ajudante 2 na rodada 1 (save `4577dfde-8aa0-4cdb-871e-bcf55c06a7e6`, 18 atualizações). Após a segunda, Ajudante 3 na rodada 2 (save `9254b73b-c1e8-4f65-bfe0-7e50e697a672`, 36 atualizações). Os três controles retomaram até Lia na rodada 2. Respostas iniciais em `C:/Users/meu-o/AppData/Local/Temp/misadventures-t91-ordem-qZNosR` e estados públicos e persistidos dos checkpoints em `C:/Users/meu-o/AppData/Local/Temp/misadventures-t91-checkpoints-fxsVYn/virada.json`.

## Cenário 4 — Interrupção e reenvio

- `test/prepare-t91-replay.cjs` cria um controle e duas variantes pela API com semente 3 e executa `endTurn`. Consulta o banco dedicado entre as etapas para guardar estados, RNG e recibos. Compara os resultados entre campanhas equivalentes por posição dos membros e correspondência dos IDs gerados. Na comparação do mesmo save antes e depois do replay, compara a linha integral e os recibos.
- Prettier, sintaxe, ESLint e `git diff --check` passaram. O autor confirmou a execução integrada. O controle `ee4daf61-dc27-438a-975e-d388d08a76c4` gerou 54 atualizações de combate. Os cortes em `7e77170a-cde4-46a2-a2e3-c598b4a51491` e `9330165d-c380-4df5-a5f2-39f1a90028f4` mantiveram o checkpoint, retomaram pela chave original e pelo POST de sessão, respectivamente, e chegaram ao estado, RNG e lote equivalentes ao controle. Os reenvios simultâneos após a ação posterior devolveram a resposta original e preservaram a linha do save e seus recibos. Evidências em `C:/Users/meu-o/AppData/Local/Temp/misadventures-t91-replay-pFUHcn`.
- Perda de resposta após o commit confirmada no save `dcf208a2-224b-455d-86d1-c02f7d9e5a7c`, semente 3, chave `c7a918ee-9e3f-4f21-bfa8-a8845bbc8a30`. O cliente de verificação fechou a conexão ao receber os cabeçalhos de 200, antes de consumir o corpo. O reenvio retornou exatamente o recibo persistido, com 54 atualizações de combate, e preservou o estado e o recibo. Evidência em `C:/Users/meu-o/AppData/Local/Temp/misadventures-t91-checkpoints-fxsVYn/perda.json`.

| Campanha para a T-104 | Save | Chave do `endTurn` |
|---|---|---|
| Controle contínuo | `e7a31810-ac77-4021-a478-a274dfc020c2` | `fa5ffc2c-84cd-4e2b-9f24-634b30c0edf0` |
| Corte após commit humano | `62cca321-7cd9-4352-996b-51a79b6e5d09` | `42c22ae2-466c-49a0-92bc-339b7cd4be6c` |
| Corte após a primeira vez automática | `92cea73c-eb9d-46be-938f-23aa8d6cd0a6` | `e31336c2-30b6-4385-b74d-2aaebc0d9998` |

## Cenário 5 — Sucessora e congelamento

- `test/prepare-t91-catalog.cjs` gera uma cópia temporária do catálogo com condições de conclusão na Costa Velha e na Costa da Aurora, a sucessora. Ambas usam um Fragmento da T-91 na cidade inicial e concedem 10 de ouro. A Costa da Aurora é a última dimensão da cópia.
- O carregador real do catálogo validou a cópia após incluir as três ações obrigatórias da cidade urbana sucessora. O autor iniciou o backend com essa cópia. Os scripts de catálogo e de dimensão passaram em sintaxe, ESLint e `git diff --check`.
- `test/prepare-t91-dimensions.cjs` criou as campanhas pela API com a semente 3, doou o Fragmento pelo laboratório e usou a semente 0 no RNG persistido imediatamente antes da primeira conclusão. No controle `76bd8566-82f8-44d4-b920-203fe4467d76`, o corte após o commit da transição mostrou a primeira vez em uma IA, na rodada 1, e ordem preservada até a retomada para Lia na mesma rodada. Todos mantiveram IDs e classes, receberam +25 Pico e +10 ouro e passaram a ter `t91-next.harbor` como cidade e respawn.
- No controle final `e3823539-bed6-4eaa-bcc6-49011d849193`, a ação concluiu em `frozen` com lote vazio, concedeu a progressão e manteve o recibo no reenvio. Reabrir devolveu 409 `PARTY_FROZEN`. O autor confirmou os dois controles. Evidências em `C:/Users/meu-o/AppData/Local/Temp/misadventures-t91-dimensions-muFF8n`.
- Para a T-104, o save `a52a309c-0f1d-49c4-a07d-b3c1d2693299` está na Costa Velha e o save `a41a24d0-8231-4e6c-a29a-83ce286438d5` está na Costa da Aurora. Ambos estão na vez humana com `completeDimension` disponível. Usar `POST /parties/:partyId/actions` com UUID no cabeçalho `Idempotency-Key` e corpo `{ "type": "completeDimension" }`. A reprodução em memória a partir do save preparado e do mesmo catálogo registrou D20 de 10, 4, 9 e 13 na ordem da composição, resultando em Ajudante 3, Lia, Ajudante 2, Ajudante 1. Evidência em `sucessora-d20-reproducao.json` na pasta do cenário.

## Disponibilidade para a T-104 — 2026-11-27

- Com Docker e backend ligados pelo autor, a API em `http://127.0.0.1:3391` respondeu a `GET /health`, `GET /lab/config` e `GET /parties/creation-options`. O laboratório estava habilitado e as opções retornaram 1 a 6 participantes.
- A listagem HTTP confirmou os 31 saves citados neste registro. Consultas somente de leitura em `misadventures_t91` confirmaram que as três campanhas de replay da T-104 estão na rodada 1, com 3 PA e sem recibos de ação. Os checkpoints dos controles já retomados estão documentados em `virada.json`; `perda.json` também está disponível. Os cortes da T-104 são gerados durante o cenário.
- Consultas HTTP por ID confirmaram o save de iniciativa em `idle`, o save de virada na rodada 1 e os dois saves de conclusão com `completeDimension` disponível. A validação integrada segue pendente do frontend.

## Retorno da T-104 — versão de saúde

- O autor confirmou os seis cenários funcionais com a API de preparação, conforme devlog frontend 136. A instância em 3391 respondeu HTTP 200 com `contractVersion: "1.04"` em `GET /health`.
- `src/infra/http/contract-version.ts` passou a anunciar 1.09. O E2E de REQ-01 em `src/infra/http/controllers/health/index.controller.e2e-spec.ts` passou a verificar o valor explícito da entrega.
- O build passou. O E2E padrão foi bloqueado na inicialização pelo cache do módulo nativo do SWC no Windows. Uma verificação HTTP com Supertest e o controlador compilado retornou 200 com `{"status":"ok","contractVersion":"1.09"}`.
- Após o reinício pelo autor, `GET http://127.0.0.1:3391/health` retornou HTTP 200 com `{"status":"ok","contractVersion":"1.09"}`. O backend aguarda o registro da resolução da divergência no frontend para fechar a FEAT-20.
