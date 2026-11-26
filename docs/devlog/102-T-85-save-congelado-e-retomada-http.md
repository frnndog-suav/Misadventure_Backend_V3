# 102 — T-85 — Save congelado e retomada HTTP

- Data — 2026-11-26
- Status — aguardando testes do autor
- Spec — v1.06, REQ-171 e REQ-172
- Contrato — v0.97, FEAT-19 `acordado`
- Horas — a preencher pelo autor

## Alterações

- `find-dimension-successor.ts` compartilha a busca por ordem de lançamento entre `take-party-action`, `list-parties`, `get-party` e `start-session`. Os GETs projetam `idle` em uma cópia do agregado e preservam o resumo e a data do save.
- `Party` reaproveita o preparo da passagem e parte do RNG gravado. O caso de uso de sessão grava dentro de `withLockedParty` após preparar a sucessora e atualizar o resumo. `party-frozen-error.ts`, `domain-error-status.ts` e `campaign.module.ts` ligam a resposta HTTP e o catálogo.
- `random-event.test.ts` cobre reabertura com prêmio pendente, projeção sem gravação, sucessora sem mapa válido, retomada, repetição e reprodução do preparo a partir do mesmo save. Os testes de `start-session`, `get-party`, `list-parties` e `zone-quest.test.ts` recebem o catálogo.
- `dimension-completion.controller.e2e-spec.ts` verifica legado, conclusão e retomada concorrentes pelas rotas reais, com Postgres e publicação simulada no catálogo. Duas conclusões retornam um `200` e um `409`. Duas retomadas retornam o mesmo grupo preparado e preservam ouro e Pico. As consultas preservam o estado gravado.

## Verificação e pendências

- O autor executou o cenário antes da implementação. O único teste selecionado falhou na asserção de `PARTY_FROZEN`, com o save congelado na resposta de sucesso.
- TypeScript, ESLint nos arquivos alterados e `git diff --check` passaram. A preparação usa o RNG semeado e recebe a data pela porta de relógio.
- Aguardando a suíte unitária do autor. Depois, verificar o E2E com Postgres e confirmar a conclusão da T-85. A campanha para validação no frontend segue na T-86.

## Commit sugerido

`feat/resume frozen saves over http (t-85)`
