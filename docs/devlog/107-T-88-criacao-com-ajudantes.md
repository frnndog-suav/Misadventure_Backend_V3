# 107 — T-88 — Criação com ajudantes

- **Data** — 2026-11-26
- **Situação** — concluída
- **Spec** — v1.10, REQ-178 a REQ-180, D-155
- **Contrato** — v1.08, FEAT-20 acordada
- **Horas** — a preencher pelo autor

## Objetivo e arquivos

- `src/infra/http/controllers/create-party/ai-helpers.controller.e2e-spec.ts` cobre quantidade, limites vigentes, estado público, persistência, semente fixa, leitura solo v11 e bloqueio de intenção HTTP na vez da IA.
- `src/infra/http/controllers/list-parties/index.controller.e2e-spec.ts` cobre a consulta de opções com laboratório desligado.

## Verificação e retomada

- PostgreSQL deve estar pronto antes dos testes. O Supertest cria a aplicação durante a suíte, com schema isolado pelo setup E2E.
- Espera-se falha na consulta das opções e nas expectativas que dependem da validação e preparação dos ajudantes. A criação solo legada continua como verificação de compatibilidade.
- Conferência estática e `git diff --check` realizados. Resultado dos testes pendente de execução pelo autor.
- Após a confirmação, implementar T-88. A ponte para a T-104 segue na T-91.

## Implementação e verificações — 2026-11-26

- O autor confirmou 10 falhas esperadas e 5 testes passando. A consulta de opções retornava 404, entradas inválidas eram aceitas e os ajudantes não eram criados. O teste de leitura solo v11 passou.
- O agregado reutiliza a preparação individual e o D20 existente. O catálogo publicado fornece as opções em ordem estável, e o sorteio usa o RNG da campanha. Os ajudantes recebem nomes sequenciais `Ajudante 1`, `Ajudante 2` e assim por diante.
- Arquivos de implementação — caso de uso `create-party`, agregados em `entities/party` e `entities/party-member`, caso de uso `take-party-action`, controller `create-party`, `PartyPresenter` e `DrizzlePartyMapper`. O formato v11 do save passa a aceitar o novo valor de `kind`. O bloqueio HTTP na vez de um ajudante usa o erro existente `409 ACTION_NOT_ALLOWED` com `zoneActionUnavailable`.
- Ajustadas as expectativas de mínimo nos testes existentes de criação para o campo `aiHelperCount`, conforme o contrato. Typecheck e `git diff --check` passaram. A suíte de regressão aguarda execução pelo autor.
- Roteiro — verificar GET das opções com laboratório desligado, criar com cinco ajudantes, reabrir o save e comparar a projeção. Caso de borda — após consultar limites, aumentar o mínimo e enviar criação omitindo `aiHelperCount`; esperar `400 PARTY_INVALID` com `belowMinPlayers`.
- **Commit sugerido após verificação** — `feat/create parties with ai helpers (t-88)`.

## Ajuste após o primeiro E2E

- O autor retornou 25 testes passando e 2 falhando. A projeção antes da gravação considerava `mount: undefined` como uma montaria e incluía rotas de duas travessias. A leitura do save normalizava esse campo para `null`.
- A preparação individual agora inicializa `mount: null`. O teste de criação solo verifica apenas rotas diretas e inclui os campos públicos já existentes `moveRoutes`, `completionItems` e `lastDimensionCompletion`. A comparação entre POST e GET continua integral nos dois cenários de criação.
- Arquivos do ajuste — `starting-player/index.ts`, `starting-player/index.test.ts` e o E2E de `create-party`. Typecheck e `git diff --check` passaram. Nova execução pelo autor pendente.

## Conclusão

- O autor confirmou que a suíte unitária de preparação e os 27 testes E2E selecionados passaram sem erros após o ajuste.
- A SPEC-BACKEND v1.11 registra a conclusão da T-88. Retomada na T-89, REQ-181 e REQ-182, após autorização do autor.
