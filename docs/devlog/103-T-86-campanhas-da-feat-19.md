# 103 — T-86 — Campanhas da FEAT-19

- Data — 2026-11-26
- Status — aguardando acordo sobre o ID da sucessora e verificação local
- Spec — v1.07, REQ-164 a REQ-172
- Contrato — v0.97, FEAT-19 `acordado`
- Horas — a preencher pelo autor

## Alterações

- `test/prepare-feat-19.cjs` copia as fixtures para um diretório temporário por perfil. Cria o Fragmento, configura a conclusão na Mina Velha e acrescenta a Segunda Dimensão.
- O preparador usa criação e doação pela API. Ajusta apenas os saves recém-criados, no Postgres local da API, para posicionar o personagem e montar os pontos de partida. Imprime URL, ID do grupo, ID do membro e ações disponíveis.
- A fixture usa `fixture-next.next-dimension`. O carregador rejeitou `fixture.next-dimension` na coleção `fixture-next`, pois exige o prefixo da coleção no ID. A correção no texto compartilhado aguarda acordo.

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
- A execução das campanhas contra a API e o Postgres aguarda o autor. Depois da verificação local, registrar as mensagens do editor no contrato, atualizar a situação para `implementado (BE)` e entregar os IDs ao frontend. Fechar a T-86 após o retorno integrado.

## Commit sugerido

`test/add feat-19 campaign preparer (t-86)`
