# 103 — T-86 — Campanhas da FEAT-19

- Data — 2026-11-26
- Status — concluída
- Spec — v1.08, REQ-164 a REQ-172
- Contrato — v1.00, FEAT-19 `validado` (validação integrada executada com a v0.99)
- Horas — a preencher pelo autor

## Alterações

- `test/prepare-feat-19.cjs` copia as fixtures para um diretório temporário por perfil. Cria o Fragmento, configura a conclusão na Mina Velha e acrescenta a Segunda Dimensão.
- O preparador usa criação e doação pela API. Ajusta apenas os saves recém-criados, no Postgres local da API, para posicionar o personagem e montar os pontos de partida. Imprime URL, ID do grupo, ID do membro e ações disponíveis.
- A fixture usa `fixture-next.next-dimension`. O carregador rejeitou `fixture.next-dimension` na coleção `fixture-next`, pois exige o prefixo da coleção no ID. O frontend confirmou a correção, aplicada em `docs/CONTRATO.md` v0.98. A conferência estática confirmou os três IDs e `git diff --check` passou. O frontend recebeu a cópia integral da v0.98, confirmou o ID no contrato e no preparador e já usa esse ID com MSW.

## Roteiro e resultados esperados

Em cada perfil, preparar o conteúdo com `node test/prepare-feat-19.cjs content <perfil>` e iniciar o backend com esse caminho em `CONTENT_DIR`, com laboratório habilitado, conectado ao Postgres local migrado. Em outro terminal, o preparador `node test/prepare-feat-19.cjs campaigns <perfil>` usa `FEAT19_API_URL` (padrão `http://localhost:3333`) e o mesmo `DATABASE_URL` da aplicação. Gerar uma cópia nova do perfil base para repetir a publicação posterior.

| Perfil e campanha | Verificação |
| --- | --- |
| base / todas | Conferir Fragmento e conclusão no catálogo. A doação agrega Fragmentos sem alterar os slots, inclusive no grupo `sem-espaco`. |
| base / porto, dois-fragmentos, zero-pa | POST `completeDimension` retorna 409 com `notCompletionZone`, `completionRequirementNotMet` e `noActionPoints`, respectivamente. Conferir que o estado permanece igual. |
| base / congelar | Concluir antes de publicar. Conferir status e resumo `frozen` e POST de sessão 409 `PARTY_FROZEN`. Publicar pela rota `POST /lab/content/cards/fixture-next.next-dimension/publish`. Listagem e detalhe mostram `idle` com o resumo original. Reabrir a sessão e conferir sucessora e prêmio concedido uma única vez. |
| base / passagem | Concluir após publicar. Conferir mudança no mesmo POST, Pico +25, ouro +100, Lâmina no inventário, Fragmentos removidos e mão de sete cartas. Cidade atual e respawn em `fixture-next.city`. Conferir persistência do resumo por GET. |
| base / sem-espaco | Concluir após publicar. Conferir prêmio pendente de fonte `grandPrize` com ID da dimensão original, recibo sem cópias entregues e ação `resolveReward`. Usar `leave` e conferir destino no limbo. |
| chefe / vitoria | Abrir combate e conferir `finalBoss`, título Guardião da Mina Velha e fuga indisponível. Vencer e conferir `lastCombatResult.finalBoss`, `finalBossDefeated` e Pico +40 no recibo. |
| chefe / sem-vitoria | Atingir o limite de um ciclo sem derrotar o Guardião. Conferir que os três Fragmentos continuam e que o resumo segue vazio. |
| montaria / slot-vazio e slot-ocupado | Concluir com duas cópias do Pônei de Guerra no prêmio. Conferir uma no recibo com `destination: 'mount'` e outra no limbo quando o slot estiver vazio. Com Cavalo de Arado equipado, conferir a preservação da montaria e duas cópias no limbo. |
| base / editor | Tentar salvar o requisito com `fixture.healing-potion` e, em outra tentativa, usar zona `Nenhuma`. Esperar `400 CONTENT_INVALID` com `completion.requirement.0.cardId` e `completion.zoneTitle`. |

## Verificações e pendências

- Build, sintaxe, ESLint e `git diff --check` passaram. O validador de conteúdo aceitou os três perfis com duas coleções e 33 cartas cada.
- No perfil base, o autor preparou os seis grupos em http://localhost:3333. O preparador confirmou a configuração de conclusão e a doação de Fragmentos sem alteração dos slots. Os três POSTs recusados retornaram 409 com os motivos previstos e o GET mostrou estado idêntico antes e depois.
- O grupo congelar passou por frozen, reabertura bloqueada com PARTY_FROZEN, publicação da sucessora, idle com recibo preservado e reabertura na Segunda Dimensão. O segundo POST de sessão devolveu o mesmo estado. Passagem confirmou transição imediata, prêmio, remoção dos Fragmentos, mão, cidade, respawn e recibo persistido. Sem-espaco confirmou a pendência grandPrize e o envio ao limbo com leave.
- No editor, os dois PUTs retornaram 400 CONTENT_INVALID. Mensagens observadas: `completion.requirement.0.cardId` — “A carta precisa ser um item de conclusão.” e `completion.zoneTitle` — “O título precisa identificar uma zona da coleção.”. Ambas as respostas também apontaram `eventDecks.0.cards.1.cardId.goodOutcome` e `eventDecks.0.cards.1.cardId.badOutcome` com “Informe regras executáveis para o evento de combate.”.
- No perfil chefe, vitória confirmou Guardião da Mina Velha, fuga indisponível, 15 de Pico no resultado do combate e 40 no recibo da conclusão. Sem vitória confirmou pelo GET encerramento com resolution: escaped e causa cycleLimit, três Fragmentos preservados e recibo vazio.
- No perfil montaria, as quatro requisições retornaram 200. Com slot vazio, o recibo registrou um Pônei de Guerra equipado. Com slot ocupado, o Cavalo de Arado permaneceu equipado e o recibo ficou sem cartas entregues. Em ambos os grupos, a última entrega do Pônei foi ao limbo e não houve recompensa pendente. A API expõe a última entrega, sem totalizar as cópias enviadas ao limbo.
- Novo perfil base preparado em `http://localhost:3333` com a Segunda Dimensão em rascunho. A T-95 começa pelo congelamento antes de `POST /lab/content/cards/fixture-next.next-dimension/publish`. A T-95 confirmou os seis cenários do perfil base contra a API real, sem MSW e sem divergências (devlog FE 125). Antes do fechamento, as cópias integrais do contrato v0.99 tiveram o mesmo SHA-256. Chefe, montaria e editor foram verificados localmente conforme os resultados acima.

| Cenário | Grupo |
|---|---|
| congelar | `dc49f082-bc02-4498-8390-1d2c1ba33eba` |
| passagem | `df15d299-1bc2-4f98-a6d7-4c6b93991257` |
| sem-espaco | `9cb4f3d4-5e42-4654-aee8-08da399fedeb` |
| dois-fragmentos | `4a415f51-230d-42e4-9535-2594b39d7c17` |
| porto | `320bde54-16ed-40eb-9f78-41f4adbedb38` |
| zero-pa | `ff04fb81-8368-4124-bd42-1555eccb4598` |

## Registro do fechamento

- Atualizados `docs/CONTRATO.md`, `docs/ROADMAP.md`, `docs/SPEC-BACKEND.md`, este registro e o índice do devlog. A sincronização dos documentos compartilhados cabe ao autor.

## Commit sugerido

`docs/close feat-19 validation (t-86)`
