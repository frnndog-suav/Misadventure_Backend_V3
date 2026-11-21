# T-50 — Configuração de nocaute e ponto de respawn

- Data — 2026-11-21
- Status — concluída
- Spec — v0.65, REQ-124, REQ-125 e REQ-130
- Contrato — v0.69, FEAT-14 acordada
- Horas — a preencher pelo autor

## Entrega

- O parser de `PartyAction`, o caso de uso `TakePartyAction` e o agregado `Party` aceitam `saveRespawnPoint`. Cada uso aceito custa 1 PA e grava a Urbana atual, inclusive em repetição.
- `available-actions/index.ts` e o presenter da campanha projetam a ação em sessão ativa imediatamente antes de `startEvent` ou `endTurn`.
- `game-config/defaults.ts` define os cinco padrões e limites. O mapeador de campanhas aceita as chaves gravadas e completa as ausentes com os padrões. O laboratório reutiliza os fluxos de consulta, edição e reset.
- Os testes do caso de uso, configuração e mapeadores e os cenários HTTP de ações e laboratório cobrem a entrega. O preparador de fixtures legadas em `test/factories/remove-post-v6-config.ts` reproduz as configurações das versões v2 a v6.

## Verificação

- O autor confirmou os 63 unitários da configuração e dos mapeadores e os 33 unitários de `TakePartyActionUseCase`.
- Na execução HTTP, 76 de 77 testes passaram, incluindo os cenários de respawn e a consulta do laboratório. O teste de criação do grupo esperava indevidamente a nova ação com a sessão inativa. Após corrigir a expectativa, o autor confirmou o reteste do arquivo do cofre sem falhas.
- `npm run typecheck` e `git diff --check` passaram.

## Roteiro

Em sessão ativa na cidade inicial, conferir `saveRespawnPoint` antes de `startEvent`. Enviar a ação repetidamente e conferir os PA de 3 a 0, a posição preservada e o ponto de respawn no GET. Com 0 PA, conferir que a ação desaparece e outro POST retorna 409 com `noActionPoints`, com GET igual ao anterior.

## Retomada

A T-51 trata de queda e continuidade do desfecho, incluindo doação fatal, Reflexão e escolha pendente. A validação integrada da FEAT-14 permanece prevista na T-54.

## Commit sugerido

`feat/add knockout settings and save respawn point (t-50)`
