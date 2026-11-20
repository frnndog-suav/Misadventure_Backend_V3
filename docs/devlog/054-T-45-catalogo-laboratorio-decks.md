# 054 — T-45 — Catálogo, laboratório e decks de combate

- Data — 2026-11-20
- Status — concluída
- Spec — v0.62
- Contrato — v0.62, acordado
- Horas — a preencher pelo autor

## Objetivo

Estruturar o conteúdo de combate, validar a publicação de decks explícitos e incluir os ajustes de combate no laboratório.

## Decisões

- REQ-117 e D-109 orientam os testes de leitura de conteúdo, publicação, decks e configuração do laboratório.
- A implementação da entrada no combate, incluindo a identidade de cada cópia inimiga, segue na T-46. A integração da transição D-110 à gravação de saves segue na T-49.
- O autor aprovou a conversão de `base.goblin-ambush`. A vitória compra uma recompensa da zona e o revés remove cinco de ouro. Os textos e as duas cópias do goblin foram preservados.
- A publicação, a importação com status publicado e a edição de dimensões publicadas validam as cartas de combate referenciadas. A leitura de conteúdo existente preserva cartas legadas.

## Arquivos

- `src/infra/content/zod-card-input-parser.test.ts` — leitura das variantes legada e executável, preservação de `count` e caminho de erro de habilidade incompleta.
- `src/domain/catalog/application/use-cases/publish-card/index.test.ts` — recusa de publicação de deck com desfecho ou habilidade inimiga legada.
- `src/domain/campaign/application/use-cases/take-party-action/random-event.test.ts` — composição semeada do deck misto e elegibilidade da antecipação quando a única carta executável está no descarte urbano.
- `src/domain/lab/application/use-cases/update-game-config/index.test.ts` — gravação e consulta dos ajustes e prioridades de combate.
- `src/domain/catalog/enterprise/` e `src/infra/content/` — variantes de habilidade e desfecho, validações de executabilidade e mensagens de conteúdo.
- `src/domain/catalog/application/use-cases/` — validação em publicação, importação e substituição.
- `src/domain/lab/enterprise/value-objects/game-config/` e mapeadores Drizzle de configuração e grupo — ajustes, limites, padrões e leitura de registros anteriores.
- `src/domain/campaign/enterprise/entities/party/index.ts` — elegibilidade e embaralhamento de cartas executáveis na inicialização do deck.
- `content/base/combatEvent.json` — conversão aprovada da Emboscada de Goblins.

## Como verificar

```powershell
npm.cmd exec -- vitest run src/infra/content/zod-card-input-parser.test.ts src/domain/catalog/application/use-cases/publish-card/index.test.ts src/domain/campaign/application/use-cases/take-party-action/random-event.test.ts src/domain/lab/application/use-cases/update-game-config/index.test.ts
```

Antes da implementação, o autor confirmou 7 falhas esperadas e 39 testes passando. Na próxima execução, esperam-se 46 testes passando. O caso de borda com compra vazia e combate executável apenas no descarte deve abrir a antecipação com carta oculta.

## Checks e pendências

- `npm.cmd run typecheck` e `git diff --check` passaram. `npm.cmd run validate:content` validou 1 coleção e 16 cartas.
- O autor confirmou que a segunda execução passou sem erros e registrou a implementação no commit `aad6a88`.
- A revelação ainda usa o fluxo de evento aleatório. Um deck só com combate executável pode abrir antecipação e receber `eventDeckEmpty` ao revelar até a entrada de combate da T-46. A compra e a reciclagem que iniciam combate dependem dessa entrada.

## Commit sugerido

`feat/prepare combat catalog and decks (t-45)`
