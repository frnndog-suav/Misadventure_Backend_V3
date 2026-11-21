# T-52 — Penalidades e passagem de vez

- Data — 2026-11-21
- Status — aguardando revisão
- Spec — v0.65, REQ-128
- Contrato — v0.69, FEAT-14 acordada
- Horas — a preencher pelo autor

## Testes escritos

- `src/domain/campaign/enterprise/entities/party/knockout.test.ts` cobre a proteção de Pico antes de expirar o status, a espera zero com renovação de PA e recarga, e o consumo da marca na próxima vez do membro conforme a ordem do grupo.
- O caso de proteção usa uma conversão temporária na fixture. O catálogo já define `untilKnockout` e o tipo de status ativo ainda precisa aceitá-lo.

## Verificação e retomada

`npm run typecheck` e `git diff --check` passaram. Aguardando o autor executar os três casos com `npm test -- src/domain/campaign/enterprise/entities/party/knockout.test.ts`.

- Proteção de Pico deve falhar com 18 em vez de 19.
- Espera zero deve passar com vez jogável em R+1, uma recarga e perda de ouro só na bolsa.
- Grupo deve falhar pela ausência de `skipNextTurn: true` depois do respawn. Após a implementação, o teste também verifica a passagem automática e o retorno do membro na rodada seguinte.

O autor executou os três casos. A espera zero passou e o grupo falhou pela ausência da marca. A proteção falhou com `TypeError` durante o avanço da vez, pois a duração `untilKnockout` ainda não era reconhecida pelo status ativo.

## Implementação

- `party/index.ts` avalia a proteção de Pico antes de expirar os status de nocaute. Aplica as penalidades uma vez e usa o avanço de vez existente para a espera solo e para consumir a marca de grupo, incluindo as transições de status e recarga.
- `activatable-effects/index.ts`, `effect-activation/index.ts` e `player-status/index.ts` aceitam a proteção como efeito persistente e a duração `untilKnockout`. O cenário de proteção agora usa a duração diretamente na fixture.
- `party-member/index.ts`, `drizzle-party-mapper.ts` e `party-presenter/index.ts` carregam, persistem e projetam a marca, com projeção falsa para saves sem o campo. O cenário HTTP de criação de campanha inclui esse valor inicial.
- As vitrines são da FEAT-16. O avanço automático reutiliza a mesma transição de vez usada por `endTurn`.

## Verificação após implementar

- `npm run typecheck` e `git diff --check` passaram. A execução dos testes unitários pelo autor está pendente. Os três casos de `knockout.test.ts` devem passar na suíte.
- Caso de borda — com a ordem A, B, C e B nocauteado na rodada 1, C joga na rodada 1, A e C jogam na rodada 2, e B volta a jogar na rodada 3. A marca permanece até a vez de B na rodada 2.
- A validação de combate em grupo com IA e de reanimação depende das FEATs 20 e 22. O resumo persistido e a retomada de saves legados seguem na T-53.

## Commit sugerido

`feat/apply knockout penalties and turn skips (t-52)`
