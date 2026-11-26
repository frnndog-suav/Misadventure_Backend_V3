# 104 — T-87 — Coleções estendidas e reprint

- Data — 2026-11-26
- Status — implementado no backend, validação integrada pendente
- Spec — v1.09, REQ-173 a REQ-177
- Contrato — v1.03, FEAT-33 `implementado (BE)`
- Horas — a preencher pelo autor

## Alterações e verificações

- O autor aprovou a atualização da spec e confirmou as duas falhas iniciais da REQ-173. O parser omitia as listas no conteúdo legado e devolvia `unknownField` para as listas configuradas.
- `src/infra/content/card-schemas.ts`, `src/domain/catalog/enterprise/value-objects/card/index.ts` e `test/factories/make-card/index.ts` declaram as duas listas e os padrões de leitura.
- O autor confirmou 2 testes de leitura passando e 6 falhas esperadas em `src/infra/content/dimension-commercial-collections.test.ts`. Os seis casos publicavam referências inválidas.
- `src/domain/catalog/enterprise/commercial-collections/index.ts` valida a ordem de lançamento, a referência à própria coleção, as duplicações e a sobreposição. `publish-card`, `replace-card` e `import-collection` aplicam a validação ao conteúdo publicado. O autor confirmou os oito testes de leitura e publicação.
- `git diff --check` passou.
- O autor confirmou as duas falhas de proteção por referência, além de oito testes passando. O editor excluía a coleção e aceitava mudar a ordem do lançamento referenciado.
- `delete-card`, `delete-collection`, `replace-card` e `import-collection` agora verificam se a operação elimina o lançamento anterior exigido por uma extensão ou reprint. A exclusão e a importação mantêm a verificação de uso antes da verificação de referência.

## Retomada

- O autor confirmou os dez testes da REQ-173.
- O autor confirmou dois testes de mercado passando e a falha esperada da renovação, que excluía os singles da extensão e do reprint gravados.
- Criação e passagem gravam a vigência no JSON do save. Mercado e renovação consultam essa vigência e usam apenas a coleção própria quando o campo está ausente. Repositórios protegem as coleções gravadas. A abertura de boosters mantém a resolução pelo ID da coleção do booster.
- A suíte do agregado cobre a recusa de booster fora da oferta depois de um single, com comparação de pool, estoques, vitrine, RNG e jogador. A checagem TypeScript sem emissão e `git diff --check` passaram.
- O autor confirmou a suíte unitária completa, incluindo renovação e recusa atômica.
- `test/prepare-feat-33.cjs` gera conteúdo descartável e cria as campanhas pela API. Avança pelas dimensões com a ação normal e ajusta somente os saves que acabou de criar. O modo `verify` cria campanhas independentes para produzir os resultados observados sem consumir as campanhas de entrega do modo `campaigns`.
- Build, sintaxe e validação estática passaram. O preparador gerou cinco coleções e 55 cartas. O autor executou a verificação e a preparação na API e no Postgres locais.

## Roteiro da T-99

| Cenário | Estado inicial | Resultado esperado |
| --- | --- | --- |
| Catálogo e editor | `fixture.test-dimension` sem listas no arquivo e `current.dimension` com extensão `fixture` e reprint `reprint` | Catálogo e editor retornam as listas. Import inválido devolve 400 no caminho indexado. As proteções de referência e de uso são verificadas no editor. |
| Oferta e compra | `current.city`, 3 PA, 150 ouro e inventário vazio | Oferta ordenada com `current.booster`, `fixture.booster` e `reprint.booster`, todos comuns. O lote compra os três. |
| Recusa atômica | `current.city`, slot 0 `reprint.single` comum, reposição possível por `fixture.strength-basic` comum e RNG `[0,0,0,10]` | Comprar o slot 0 seguido de `archive.booster` comum devolve 409 `notMarketBooster` no índice 1. GET, pool, estoque e RNG permanecem idênticos. |
| Singles | Mesmo slot e reposição do caso atômico | O ID original vai para a pasta de TCG. A segunda compra esgota o pool controlado e provoca renovação. O roteiro imprime pool inicial sorteado, pool controlado e pool posterior. |
| Aberturas | `reprint.booster` no inventário e `archive.booster` fora da oferta no cofre, em campanhas separadas | `prepare` registra IDs de `reprint` e seus destinos. `useVault` registra IDs de `archive` com destino `vault`. O roteiro consulta raridades por ID. |
| Legado | `current.dimension` sem vigência gravada, pool e vitrine preservados | Só `current.booster` é ofertado inicialmente. Passar para `next.dimension` grava `next` e `archive`. |
| Passagem e vigência persistida | `current.dimension` com vigência `current`, `fixture` e `reprint` | A sucessora usa `next.city` e oferece `archive.booster` e `next.booster`. Editar as listas da dimensão de um save existente preserva sua oferta e os candidatos ao pool renovado. |

## Resultados observados na API local

API ativa em `http://localhost:3333`. O autor executou o modo `verify` no Postgres local. As campanhas abaixo foram usadas na verificação. Os grupos novos para o frontend estão na tabela de entrega.

| Cenário | Campanha | Membro | Observado |
| --- | --- | --- | --- |
| Catálogo e editor | — | — | `fixture.test-dimension` retornou duas listas vazias. `current.dimension` retornou `[fixture]` e `[reprint]`. O import recusou coleção inexistente, posterior, própria, duplicada e sobreposta. Os caminhos foram `cards.2.card.extendedCollectionIds.0`, `cards.2.card.extendedCollectionIds.1` e `cards.2.card.reprintCollectionIds.0`. |
| Oferta | `607050b2-59c4-4389-847f-23f4929dcee9` | `6ce3ecd2-7a1c-4720-9b98-b3b9e605862c` | Os três boosters comuns foram ofertados por 30 ouro cada e entregues ao inventário na ordem esperada. |
| Recusa atômica | `2e26e697-7973-45b0-92db-16680140b464` | `33b7b090-acf0-42a7-85a8-1072c98b5103` | HTTP 409 `ACTION_NOT_ALLOWED`, `notMarketBooster`, `archive.booster`, índice 1. Os GETs foram idênticos. |
| Singles | `19f64d92-8c57-4565-a45c-a95e86db5d6f` | `c6acbea0-0da4-422a-9d88-4cbae07b7495` | Duas compras no slot 0 entregaram `reprint.single` e `fixture.strength-basic`, comuns, à pasta de TCG por 5 ouro cada. O pool sorteado inicial e o renovado tinham 20 IDs únicos da vigência. |
| Preparar | `c9119692-5b32-4e62-ab29-8de5218c7de5` | `29c5ead3-deb5-4384-a460-1197c3698558` | `reprint.booster` comum resultou em `reprint.single` comum nas posições 1–5 e 7, na pasta de TCG, e `reprint.rare` rara nas posições 6 e 8, no inventário. |
| Usar cofre | `c58fffc2-2feb-4c86-81f6-11c5340986d3` | `c653c8b2-3ceb-4b77-9f06-2cd7ef98f187` | `archive.booster` comum, fora da oferta, resultou em `archive.single` comum nas posições 1–5 e 7 e `archive.rare` rara nas posições 6 e 8. Todas foram ao cofre. |
| Legado | `f06fab56-edc0-4b3d-97f6-3507a07e8af7` | `59c8e1bd-b445-46d2-a5a1-4d76bf0a1026` | Só `current.booster` na oferta inicial, com o single de reprint ainda no slot 0. A sucessora gravou `next` e `archive`. |
| Passagem | `45d80de2-4b77-4817-af40-967ed6a13301` | `1197eee0-480f-40b9-b7e6-34830e293764` | `next.dimension` gerou `next.city`, ofertou `archive.booster` e `next.booster` comuns e restringiu o pool às duas coleções. Os slots 0–3 foram `archive.single`, `archive.rare`, `next.single`, `next.rare`, com raridades comum, rara, comum e rara. O legado teve a mesma vitrine após a passagem. |
| Vigência persistida | `06972f9d-9c76-4a34-b494-0e0d0d596433` | `d13300f0-8958-40be-bdc8-220f5ed84c6a` | Após editar para incluir `archive`, os três boosters originais seguiram na oferta. O pool renovado por decaimento conservou as origens `current`, `fixture` e `reprint`. |

Na recusa, a compra do slot 0 custaria 5 ouro e poderia repor o slot com `fixture.strength-basic`.

| Estado interno | Antes | Depois |
| --- | --- | --- |
| Pool | `reprint.single` e `fixture.strength-basic`, 0 saídas cada | Os mesmos IDs e 0 saídas cada |
| Estoque em `current.city` | 1 `reprint.single` e 1 `fixture.strength-basic` | 1 `reprint.single` e 1 `fixture.strength-basic` |
| RNG | `[0,0,0,10]` | `[0,0,0,10]` |

O GET manteve 3 PA, 150 ouro, cartas, vitrine, `lastMarketVisit` e `savedAt`. As proteções de referência passaram na suíte unitária. A rodada enviada não contém observação HTTP de exclusão ou substituição, de coleção sem dimensão publicada ou de ordem igual.

## Campanhas novas para a T-99

Todos os grupos começam em `current.dimension`, na zona `current.city`, com 3 PA e 150 ouro. A vitrine começa com `reprint.single` comum no slot 0 por 5 ouro e slots 1–3 vazios. A reserva de reposição é `fixture.strength-basic` comum. O estoque regular oferece `fixture.arrows` comum por 3 ouro o lote de 10. Os boosters da oferta são comuns e custam 30 ouro cada.

| Cenário | Campanha | Membro | Estado inicial específico |
| --- | --- | --- | --- |
| Oferta | `76e0541d-1b43-4157-b839-1a151810af67` | `fc67cf58-da69-47c1-8057-4c452d8362bd` | Oferta de `current.booster`, `fixture.booster` e `reprint.booster`. |
| Recusa atômica | `f41cdaaa-2c82-4ccc-b355-f1ce8be40f45` | `bece4772-d725-4b53-be76-024eaa2194fe` | Slot 0 tem reposição. `archive.booster` comum está fora da oferta. |
| Singles | `3a75b2e2-6c2c-445a-98b3-27012db5fb83` | `19e193c5-5699-4136-9e29-dfaa2ba9d96b` | Pool com uma cópia de cada single. Duas compras sucessivas no slot 0 provocam renovação. |
| Preparar | `910eccfa-a520-4a1e-a380-e38c377b436b` | `8640adc1-4b9f-4ead-ae3a-0e45ceac9842` | `reprint.booster` comum no inventário. |
| Usar cofre | `76a9f444-bbcb-40da-a412-338330e11bff` | `9781c8b5-0074-4528-a362-e3f8c452ccca` | `archive.booster` comum no cofre. |
| Legado | `b70f0495-cc78-45aa-9e65-3ae02c5321f2` | `2929fc51-49d2-4cf5-86d0-b01e0429dc36` | Campo de vigência ausente, apenas `current.booster` à venda e um `current.pass` na área de conclusão. |
| Passagem | `4343c014-d0f8-4aa5-be1b-d2a82fc45a35` | `a09b8ab5-8516-484e-8b89-a6fa09e4fd31` | Vigência `current`, `fixture`, `reprint` e um `current.pass` na área de conclusão. |
| Vigência persistida | `e35aee63-af48-4784-9c40-c045c47608a3` | `058a71ac-1714-430b-990b-65cb5bb679fe` | Editar `current.dimension` para remover a extensão e incluir `archive` como reprint. Reabrir e comprar os dois singles para renovar. Restaurar as listas originais após o cenário. |

O autor confirmou a preparação dos oito grupos. Mantenha a API e o Postgres disponíveis durante a T-99. A FEAT aguarda o resultado integrado.
