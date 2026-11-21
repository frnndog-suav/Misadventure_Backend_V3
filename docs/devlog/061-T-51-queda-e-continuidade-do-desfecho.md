# T-51 — Queda e continuidade do desfecho

- Data — 2026-11-21
- Status — aguardando revisão
- Spec — v0.65, REQ-126 e REQ-127
- Contrato — v0.69, FEAT-14 acordada
- Horas — a preencher pelo autor

## Testes escritos

- `random-event.test.ts` — derrota e Reflexão fatal, pagamento fatal parcial com e sem recompensas e pagamento fatal final aceito ou recusado. Duas escolhas no revés verificam que a cura mantém 0 PV antes e depois de resolver a primeira escolha.
- `party/activate.test.ts` — doação fatal em Preparar, execução dos passos seguintes e retorno ao ponto salvo.
- `index.combat.controller.e2e-spec.ts` — vitória por Reflexão com 0 PA, reserva da carta, consulta e reabertura com a mesma escolha e respawn no 200 da resolução.

## Verificação e retomada

`npm run typecheck` e `git diff --check` passaram. A execução dos testes está com o autor. A doação recusada por Vigor abaixo do mínimo deve passar preservando o estado. Os cenários de ações fatais aceitas devem expor a falta de avanço automático para revés ou respawn. A implementação começa após a confirmação desse resultado.

Na primeira execução, a recusa por Vigor insuficiente passou. Cinco unitários e um cenário HTTP falharam nas expectativas de revés ou respawn. O cenário de revés automático lançou um `TypeError` ao comparar o agregado com `toMatchObject`. A asserção passou a ler as propriedades diretamente.

## Implementação

- O autor confirmou no reteste que o pagamento fatal parcial mantinha o encontro aberto.
- `party/index.ts` conclui pagamentos fatais parciais por desistência e preserva a verificação dos mínimos no último pagamento. O respawn ocorre após o desfecho e qualquer escolha aberta, antes de gravar a ação aceita.
- `effect-activation/index.ts` marca a queda por perda de vida ou custo fatal e resolve a cura comum do caído com zero PV restaurados. Os passos seguintes do efeito continuam na ordem.
- `take-party-action/index.ts` integra o fechamento após ações de combate, encontro, recompensa e habilidade. Preparar resolve a queda depois de registrar os eventos do efeito.

## Verificação após implementar

- `npm run typecheck` e `git diff --check` passaram. Aguardando o autor executar os testes unitários afetados e o cenário HTTP.
- Caso de borda — resolver a primeira recompensa do revés, aplicar a cura e abrir a segunda escolha com os mesmos membro e rodada, ainda com 0 PV e 0 PA. Resolver a segunda escolha deve concluir o desfecho, descartar a carta e devolver o jogador recuperado.
- A proteção de Pico e a marca de espera em grupo seguem na T-52. O resumo persistido e a retomada de saves legados seguem na T-53.

## Commit sugerido

`feat/resolve fatal actions through knockout (t-51)`
