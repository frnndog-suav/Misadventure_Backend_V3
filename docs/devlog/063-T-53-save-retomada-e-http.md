# T-53 — Save, retomada e HTTP

- Data — 2026-11-21
- Status — concluída
- Spec — v0.65, REQ-129
- Contrato — v0.69, FEAT-14 acordada
- Horas — a preencher pelo autor

## Testes escritos

- `src/infra/http/controllers/take-party-action/index.combat.controller.e2e-spec.ts` verifica no PostgreSQL o cursor, o RNG e os decks na pausa por recompensa, a retomada da escolha legada sem PA no GET e na reabertura e a persistência do resumo do respawn no último POST.
- O mesmo arquivo semeia derrotas legadas com o desfecho já aplicado e ponto de respawn válido, ausente ou fora do mapa. O primeiro GET inativo ou a primeira reabertura deve gravar o respawn uma vez. As consultas seguintes preservam ID, rodada, saldos e resultado de combate.

## Verificação e retomada

- `npm run typecheck` passou. Os testes dependem do PostgreSQL do autor.
- Falhas esperadas na implementação atual — resumo de nocaute ausente após a última escolha, GET de derrota legada com ponto válido ainda caído, GET com ponto ausente retornando 500 e reabertura com ponto inválido ainda caído.
- O autor retornou com cinco falhas. O POST omitiu o resumo, o GET com ponto válido devolveu o jogador caído e o GET sem ponto devolveu 500. A falha de leitura do save sem ponto também bloqueou a limpeza de campanha antes dos cenários de ponto inválido e do deck v8.

## Implementação

- `party/index.ts` registra o resumo no respawn usando os valores após o desfecho e as rodadas antes e depois da passagem de vez. `take-party-action/index.ts` preserva a origem de combate quando a última escolha conclui o desfecho em outro POST.
- `party-member/index.ts` e `starting-player/index.ts` definem os valores iniciais. `drizzle-party-mapper.ts` lê e grava o resumo no save v9 e recupera a cidade inicial do mapa gravado quando o ponto estiver ausente ou fora dele. `party-presenter/index.ts` projeta o resumo no snapshot público.
- `resume-legacy-knockout.ts`, `get-party/index.ts`, `start-session/index.ts` e `campaign.module.ts` concluem o respawn legado sob o bloqueio existente. A reabertura grava a sessão e o respawn juntos. GET inativo mantém a sessão inativa e avança a vez. Escolhas pendentes continuam a partir do cursor gravado.

## Verificação após implementar

- `npm run typecheck`, ESLint nos arquivos modificados e `git diff --check` passaram. O domínio segue usando as portas de relógio e IDs e o fluxo de respawn não consome RNG.
- O autor retornou com 105 e2e aprovados, incluindo os cinco cenários de combate e save. A única falha foi no teste de abertura de sessão do REQ-20, que usava as ações da campanha recém-criada como expectativa para a sessão ativa. O teste agora exige `saveRespawnPoint` imediatamente antes de `startEvent`, como prevê o CONTRATO v0.69.
- O autor confirmou a aprovação das suítes unitárias de campanha e mapper e dos dois e2e de abertura de sessão após o ajuste.
- No caso de borda de derrota legada com 32 de ouro após a coisa ruim, a primeira leitura retorna rodada 8 com 29 na bolsa e 80 no cofre. O GET seguinte e a reabertura mantêm os valores, o ID do nocaute e o resultado da derrota.
- Próxima etapa — T-54, campanhas determinísticas e validação integrada da FEAT-14.

## Commit sugerido

`feat/persist knockout and resume legacy saves (t-53)`
