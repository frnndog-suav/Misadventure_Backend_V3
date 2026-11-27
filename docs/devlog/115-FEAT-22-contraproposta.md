# FEAT-22 — Revisão e contraproposta de contrato

- **Data** — 2026-11-27
- **Status** — concluída
- **Referências** — SPEC-FRONTEND v1.12, D-68 e REQ-110 a REQ-114. README §§3.2, 19.1, 19.5 e 21.1
- **Contrato e roadmap** — v1.17 e v1.03
- **Horas** — a preencher pelo autor

## Objetivo

Receber os documentos integrais do frontend e revisar a proposta antes da T-109.

## Decisões propostas

A decisão corrente autoriza a intenção do humano fora da própria vez. A pausa mantém a continuação persistida, com recibo idempotente e serialização de respostas concorrentes. As IAs convidam elegíveis na ordem da campanha e aceitam com pelo menos metade dos PV máximos. A alternativa de desempate dá prioridade ao humano entre jogadores empatados.

O Pico de Chefe entra no ganho de vitória dos participantes de pé. O saque do combate termina antes dos respawns e da conclusão da dimensão. Pendências do prêmio máximo seguem a FEAT-19. A vitória com Reflexão e zero sobreviventes no combate em grupo exige confirmação explícita da regra proposta.

## Arquivos e verificações

- `docs/CONTRATO.md` e `docs/ROADMAP.md` — cópias de entrada conferidas por SHA-256 antes da edição. Histórico atualizado em ambos.
- `docs/devlog/README.md` e esta entrada — registro da revisão.
- `git diff --check` passou. Cenários 1, 2, 3, 5, 6 e 7 revisados. O cenário 4 continua cobrindo a fuga e o limite de ciclos. Etapa documental, sem execução dos cenários integrados.

## Ponte com o frontend

Sincronizar CONTRATO v1.17 e ROADMAP v1.03 integrais e pedir revisão da contraproposta. A T-109 é o próximo passo do frontend após o acordo.

## Commit sugerido

`docs/review feat-22 contract (contract v1.17)`
