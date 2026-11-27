# 113 — FEAT-21 — Implementação do backend e preparação da T-108

- **Data** — 2026-11-27
- **Situação** — backend concluído, aguardando validação da T-108
- **Contrato** — v1.13 implementada, v1.14 registra a entrega
- **Critérios** — FEAT-21 e seus seis cenários, REQ-183 a REQ-185 e D-157
- **Horas** — a preencher pelo autor

## Implementação

- A migração `0004_feat21_revisions_and_receipts` inicia saves existentes na revisão 1. O repositório calcula a revisão sob a trava do save e grava o número junto ao estado. O presenter inclui a revisão nas respostas com o save completo.
- O agregado registra movimento, fases do evento aleatório e atualizações públicas de combate na ordem em que ocorrem. O serviço agrupa os acontecimentos no contexto da vez de origem, calcula seus IDs e desloca os índices de combate pelo tamanho do lote já acumulado.
- A abertura e sua associação ao avanço pendente ocorrem sob a mesma trava. Cada checkpoint atualiza o estado e os recibos associados. O commit final grava o snapshot e os lotes. Recibos anteriores à migração recebem revisão 0 e lote vazio ao serem reapresentados.

## Arquivos

- `src/domain/campaign/enterprise/entities/party/`, `enterprise/ai-turn/public-events.ts` e caso de uso `start-session`.
- `src/infra/database/drizzle/` — schema, migração, metadados, mapper, repositório e testes.
- `src/infra/http/` — serviço de avanço, controller de sessão, presenter, versão anunciada por `GET /health` e testes HTTP afetados.
- `test/prepare-t108.cjs` — prepara campanhas no banco de laboratório e mede as duas operações com cinco ajudantes.

## Ambiente de preparação

URL confirmada **http://127.0.0.1:3391**. É a porta usada pelo servidor de preparação da T-91. O PostgreSQL precisa estar disponível primeiro. Use o banco local dedicado `misadventures_t91` documentado no devlog 110. Mantenha o laboratório ligado e configure `CORS_ORIGIN` com a origem do frontend local. A migração deve terminar antes de disponibilizar a API.

Os comandos abaixo derivam a conexão do banco dedicado a partir do `DATABASE_URL` do `.env` do backend. A migração 0004 já foi aplicada nesse banco. Para reproduzir a aplicação das migrações, execute no terminal do backend.

```bash
cd /d/Github/Misadventure_Backend_V3
t108_db=$(node -e 'require("dotenv").config({quiet:true}); const url = new URL(process.env.DATABASE_URL); url.pathname = "/misadventures_t91"; process.stdout.write(url.href)') &&
  DATABASE_URL="$t108_db" npm run db:migrate
```

O autor inicia a API de preparação no terminal do backend. Se a porta 3391 já estiver ocupada pela instância anterior, o autor precisa encerrá-la antes. Ajuste `CORS_ORIGIN` se o frontend usar outra origem.

```bash
cd /d/Github/Misadventure_Backend_V3
npm run build &&
  t108_content=$(node test/prepare-t91-catalog.cjs) &&
  t108_db=$(node -e 'require("dotenv").config({quiet:true}); const url = new URL(process.env.DATABASE_URL); url.pathname = "/misadventures_t91"; process.stdout.write(url.href)') &&
  DATABASE_URL="$t108_db" CONTENT_DIR="$t108_content" PORT=3391 LAB_ENABLED=true CORS_ORIGIN=http://localhost:5173 node test/serve-t91.cjs
```

A API pronta devolve HTTP 200 em `GET /health` com `contractVersion: "1.13"`. Com a API rodando, o preparador grava somente campanhas novas no banco dedicado e imprime uma linha JSON por save. Guarde as linhas e, para o recibo legado, a chave e o corpo impressos.

```bash
cd /d/Github/Misadventure_Backend_V3
t108_db=$(node -e 'require("dotenv").config({quiet:true}); const url = new URL(process.env.DATABASE_URL); url.pathname = "/misadventures_t91"; process.stdout.write(url.href)') &&
  DATABASE_URL="$t108_db" node test/prepare-t108.cjs
```

## Dados e resultados esperados para os seis cenários

Use as rotas `/parties/<save>/session`, `/parties/<save>/actions` e `/parties/<save>` na URL acima. Gere um UUID por ação ou abertura lógica, por exemplo com `crypto.randomUUID()`. Preserve o UUID e o corpo originais para cada reenvio. O POST de sessão usa corpo vazio. Execute o frontend com MSW desligado.

| Cenário | Dados do preparador | Roteiro e resultado esperado |
| --- | --- | --- |
| 1. Revisão e lote vazio | `1-legado`, solo v11 com 37 de ouro, e `1-humano`, dois ajudantes e anfitriã em primeiro | Confirme revisão 1 no GET, 2 na primeira abertura e lote vazio. Repita com nova chave e confirme revisão 2. O GET corrente tem a mesma revisão, sem lotes. |
| 2. Ordem e payloads | `2-evento` com Carroça Abandonada, `2-combate` com Emboscada de Goblins, `2-combate-prefixo` com Lia a 1 de vida, e percurso no `6-sucessora-com-movimento` | Abra os saves e confira início, fases ocorridas, resolução e fechamento. Confira percurso origem/destino no cenário de passagem. No save de prefixo, abra a sessão, envie `startEvent` e depois `revealEvent` com o ID retornado. O nocaute inicia a vez automática e as quatro primeiras atualizações são da ação humana. Compare cada `payload.update` com o item no índice indicado, a partir de 4. Na sessão, use `payload.update`. |
| 3. Virada de rodada | `3-virada`, Lia na rodada 1, ordem Ajudante 3, Lia, Ajudante 1, Ajudante 2 | Envie `endTurn`. Espere Ajudantes 1 e 2 na rodada 1, Ajudante 3 na rodada 2, revisão +4 e retorno a Lia. Compare o GET ao terminar ou pular a apresentação. |
| 4. Checkpoint e perda | `4-acao`, `4-sessao-retoma-acao`, `4-abertura-corte` e `4-abertura-resposta-perdida` | Envie `endTurn` com `X-T91-Cut-After-Ai-Turns: 1` nos dois primeiros saves. O servidor devolve 500 depois de um checkpoint. Retome um pela mesma ação e o outro pela sessão. Compare a sessão que concluiu com o recibo da ação. Repita o corte no POST de sessão do terceiro save. No quarto, descarte a resposta 200 completa e reenvie a chave original em paralelo. Confirme lote, IDs e revisão estáveis, sem sorteio duplicado. |
| 5. Recibo antigo | `5-replay` e `5-recibo-legado` | Guarde os recibos de uma abertura e de `endTurn`, faça outra ação e reenvie as chaves originais. O GET deve ter revisão superior e a interface deve manter esse estado sem reapresentar o lote. Nova abertura devolve lote vazio. No recibo legado, use os dados da linha `5-chave-do-recibo-legado` e confirme revisão 0 e lote vazio. |
| 6. Dimensões | `6-sucessora-com-movimento`, ajudante adjacente à cidade com Fragmento, e `6-ultima`, ajudante com Fragmento na Costa da Aurora | Abra o primeiro save. Confira deslocamento, fechamento `dimensionChanged` com contexto da Costa Velha, nova ordem e abertura automática na sucessora se a IA iniciar. Abra o segundo save com chave e confira fechamento `frozen` e ações indisponíveis. Reenvie a chave original e depois abra com nova chave, que deve devolver `409 PARTY_FROZEN`. |

No cenário 4, a chave diferente para uma ação durante a pendência deve receber `409 ACTION_ADVANCE_PENDING`. Para conferir a perda de resposta da abertura, descarte a primeira resposta antes de apresentá-la. Reenvie a mesma chave e compare com um terceiro reenvio. O corte de teste deve aparecer só no pedido inicial.

## Medição com cinco ajudantes

Selecione `medicao-cinco-ajudantes` em `idle`, com Lia em sexto. Meça a abertura e, em seguida, `endTurn` na T-108. Registre para cada operação URL, save, revisão, status, duração até o fim do corpo, bytes da resposta em UTF-8, quantidade de `domainEvents` e bytes UTF-8 de `JSON.stringify(body.domainEvents)`. Ambas devem abrir exatamente cinco vezes distintas e devolver a vez de Lia. O GET final deve confirmar a revisão e a vez devolvidas por `endTurn`. No frontend, registre os mesmos valores no percurso real do navegador, incluindo eventual erro ou prazo de resposta.

Para uma medição de controle pelo backend, use um save de medição novo no comando abaixo. O script consome as duas operações e imprime um JSON por operação. O próprio script encerra uma tentativa após 60 s.

```bash
cd /d/Github/Misadventure_Backend_V3
read -r -p 'UUID do save de medição em idle: ' t108_save
node test/prepare-t108.cjs measure "$t108_save"
```

## Verificações e pendências

- A checagem de tipos, o build e o lint dos arquivos alterados passaram. A bateria unitária terminou com 1.855 testes aprovados e uma falha anterior de REQ-56. O código de `HEAD` já restringe intenções ao anfitrião. O teste de REQ-56 ainda espera que outro humano atue. O lint global também encontrou erros anteriores na seleção de ações da IA e em scripts de preparação.
- Os testes unitários foram repetidos com uma configuração temporária do Vitest usando o transformador TypeScript, após o erro intermitente no módulo nativo do SWC. A configuração temporária foi removida.
- A preparação do catálogo passou no carregador real. A reprodução em memória com o mesmo catálogo e os estados de teste confirmou as quatro fases da Carroça, as transições públicas de combate, o prefixo humano de quatro atualizações no nocaute e o movimento seguido da entrada na sucessora com IA em primeiro.
- Com o serviço de avanço e um repositório em memória, o corte depois da primeira vez deixou a revisão 3. A retomada por outra chave completou a abertura com cinco ajudantes na revisão 7 e 151 acontecimentos. O reenvio devolveu o mesmo lote e a mesma revisão. O `endTurn` seguinte completou cinco vezes na revisão 13, com os índices de combate conferidos contra o lote da ação.
- Após a confirmação do PostgreSQL, o runner padrão voltou a falhar ao carregar o SWC. A configuração temporária com o transformador TypeScript preservou o setup PostgreSQL dos E2E. O resultado final foi 379 aprovados e três falhas de expectativas antigas de catálogo em `create-card` e `get-card` (campos `completionItem`, `completion`, `extendedCollectionIds` e `reprintCollectionIds`). Os E2E de sessão, ações, avanço, revisão e recibos passaram.
- A migração 0004 passou nos schemas isolados dos E2E e no banco dedicado `misadventures_t91`, onde inicializou os 44 saves existentes na revisão 1. Após o reinício pelo autor, `GET /health` retornou HTTP 200 com `contractVersion: "1.13"`.
- Os seis cenários HTTP passaram na leva de controle. O cenário 4 confirmou retomada pela ação e pela sessão, bloqueio de outra ação durante o checkpoint e reenvio paralelo da abertura. A perda de resposta foi simulada descartando a resposta original no cliente. O cenário 6 confirmou o contexto de origem no fechamento, IA na sucessora e reenvio da abertura congelada.
- No save de controle `e627651d-b933-4cc1-a54a-9b1a698d8af3`, ambas as operações processaram cinco ajudantes e devolveram a vez de Lia.

| Operação | Revisão | Duração HTTP | Resposta UTF-8 | Acontecimentos | Lote UTF-8 |
| --- | --- | --- | --- | --- | --- |
| Abertura | 7 | 523 ms | 72.527 bytes | 151 | 56.951 bytes |
| `endTurn` | 13 | 573 ms | 61.829 bytes | 87 | 31.297 bytes |

## Saves de entrega para a T-108

A segunda leva foi conferida por GET. Use os saves abaixo para a validação no frontend.

| Dado | Save |
| --- | --- |
| `1-legado` | `b162d6aa-bd5d-4c65-b31b-7327fd0e9358` |
| `1-humano` | `8fe5d9f5-de2e-4ddf-9d5d-a6e315219f73` |
| `2-evento` | `8fdeded6-45d0-408e-b71b-994d3d77dc56` |
| `2-combate` | `4cd6dc07-3ffe-4d2c-ba7b-d5b7e3a9a871` |
| `2-combate-prefixo` | `e2aac515-2ad8-4de7-b4f3-336b18916784` |
| `3-virada` | `03bd44a8-03da-4134-a1bc-8df1b54e6ec1` |
| `4-acao` | `935200ba-d424-4bb4-8a6d-7845acf2c852` |
| `4-sessao-retoma-acao` | `7b098ded-378f-45b1-806c-cca5279e4a14` |
| `4-abertura-corte` | `c540d0c3-757d-4aa7-a108-904415c6abfd` |
| `4-abertura-resposta-perdida` | `87f6c885-4f17-4ec2-bc46-96bc511bd09d` |
| `5-replay` | `ea6934a2-0c5a-4058-9a50-7f646aabda88` |
| `5-recibo-legado` | `b350780f-562b-4713-977e-5088876cd7fc` |
| `6-sucessora-com-movimento` | `acb6b39f-27f5-4669-919c-ea8cc3760034` |
| `6-ultima` | `8304edb3-b8f6-4203-bd06-35847eb57f63` |
| `medicao-cinco-ajudantes` | `130b46f5-4f0f-4bcd-838e-623b08ac12de` |

O recibo legado usa a chave `8a0a4c34-0353-4db6-8b5d-57e54b1375ec` e o corpo `{ "type": "endTurn" }`. Mantenha o PostgreSQL e a API de preparação ligados até o retorno da T-108.

## Commit sugerido

`feat/persist automatic turn events and session receipts (feat-21)`
