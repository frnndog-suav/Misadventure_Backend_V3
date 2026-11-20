# 049 — T-40 — Configuração do laboratório, catálogo e decks mistos

- **Data** — 2026-11-20
- **Status** — concluída
- **Requisitos** — REQ-108 a REQ-111
- **Contrato** — v0.57, acordado
- **Horas** — a preencher pelo autor

## Entrega

- A configuração e os presenters do laboratório expõem o percentual de fuga e a reserva ponderada. A reserva padrão contém uma entrada de 1 ouro com peso 1. O mapper grava o ajuste e recupera os padrões em saves anteriores. Cartas da reserva precisam existir no catálogo publicado e ser consumíveis ou materiais.
- O catálogo e o editor aceitam cartas legadas em `RuleText` e cartas executáveis. Os schemas e a integridade do catálogo validam as partes e os passos de desfecho. Publicar um deck com evento aleatório legado retorna `CONTENT_INVALID`. Referências de decks e recompensas participam das proteções de edição, importação e remoção. Cartas da reserva também contam como conteúdo em uso.
- O autor delegou as escolhas para a conversão. `base.abandoned-cart` pede 1 símbolo de Sabedoria, compra 1 recompensa no êxito e causa 2 de dano no revés. `fixture.wounded-traveler` pede 1 item com a etiqueta `poção`, compra 1 carta de atributo no êxito e tira 2 de ouro no revés. Cada dimensão tem um deck urbano com uma cópia do evento aleatório e uma do combate correspondente.

## Arquivos

- Configuração e testes em `src/domain/lab`, presenter e controllers do laboratório, mappers Drizzle e proteção de conteúdo nos saves.
- Tipos, validações e casos de uso de catálogo em `src/domain/catalog`, schemas e testes em `src/infra/content`, teste HTTP de leitura em `src/infra/http/controllers/get-card`.
- Cartas migradas e dimensões em `content/base` e `test/fixtures/content/fixture`.

## Verificação

- Os testes iniciais de REQ-108 e REQ-109 falharam pela ausência das chaves novas. O teste de REQ-110 falhou pela ausência da validação do deck com carta legada. Ambos os conjuntos passaram após a implementação.
- A suíte unitária passou com 1.197 testes. Após o ajuste de lint da fixture, os 24 testes do mapper passaram novamente. Typecheck e ESLint dos arquivos TypeScript afetados passaram. O validador estático aceitou as 16 cartas de produção e as 24 cartas da fixture.
- Os 9 testes HTTP do laboratório passaram contra o PostgreSQL, incluindo GET, PATCH, reset e o caso de borda de peso zero na primeira entrada. O PATCH recusado devolveu 400 com `LAB_CONFIG_INVALID` e `reserveDeck.0.weight`. O GET seguinte devolveu a configuração salva antes da recusa.
- A suíte HTTP do laboratório iniciou e encerrou uma instância de teste em processo antes da instrução atual de operação do ambiente. A execução HTTP posterior à migração do catálogo fica com o autor. Com o Docker e o PostgreSQL disponíveis, o cenário em `get-card` deve devolver o deck urbano misto da fixture.

## Retomada

A T-41 implementa antecipação, revelação, filtro jogável, reciclagem e recusas do encontro. A validação integrada da FEAT-12 segue na T-43.
