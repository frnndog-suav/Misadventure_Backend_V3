# FEAT-14 — Acordo de contrato de nocaute, spawn e respawn

- Data: 2026-11-21
- Status: concluída (etapa de acordo)
- Spec: backend v0.63, frontend v0.81 (REQ-63 a REQ-65, T-68)
- Contrato: v0.69, `acordado` após o aceite da v0.68
- Horas: a preencher pelo autor

## Objetivo

Pactuar o formato público da FEAT-14 para revisão do frontend antes da T-68.

## Decisões acordadas

- Reutilizar a rota de ações e `respawnZoneId`, com custo de 1 PA inclusive ao salvar a mesma zona.
- Persistir `lastKnockout` e preservar `lastCombatResult`. Resolver o respawn após o desfecho e as escolhas, inclusive na retomada de saves caídos da FEAT-13.
- No solo, passar a rodada de espera após encerrar a vez atual. A rodada 6 passa à vez jogável na rodada 8 com espera padrão de 1.
- Expor no laboratório os cinco ajustes de nocaute com limites, padrões e fallback para configurações legadas.
- Na revisão v0.68, aplicar o revés da desistência se um pagamento aceito causar queda com requisitos em aberto. Preservar os pagamentos aceitos e concluir reposição e descarte antes do respawn.
- Manter 0 PV e `down: true` durante a resolução após a queda. A cura comum tem efeito zero no caído, inclusive antes e depois de uma escolha de recompensa.

## Arquivos

- `docs/CONTRATO.md` com seção e histórico das versões 0.67 a 0.69.
- `docs/devlog/README.md` com a entrada no índice.
- `docs/devlog/059-FEAT-14-contrato-nocaute.md` com o registro da proposta.

## Como verificar

Revisar os exemplos da FEAT-14 contra os REQ-63 a REQ-65 do frontend. Conferir a continuidade da escolha por Reflexão após GET, o desconto de 3 sobre 37 de ouro na bolsa e os 80 preservados no cofre. Como caso de borda, revisar a retomada da derrota legada com a coisa ruim aplicada uma única vez.

Na v0.68, conferir os dois novos cenários. O pagamento fatal com requisitos pendentes aciona o revés, repõe uma carta paga e abre a rodada 8 com 29 de ouro. A cura durante o revés mantém o jogador com 0 PV na pausa para recompensa. A última escolha libera o respawn com 2 PV.

## Checks

Revisão documental e `git diff --check`. O frontend aceitou a v0.68 e conferiu os cenários de doação fatal e cura após a queda. Os cenários aguardam implementação.

## Ponte com o frontend

O frontend confirmou os formatos dos REQ-63 e REQ-65 da v0.67 e aceitou os esclarecimentos do REQ-64 na v0.68. O autor leva o CONTRATO v0.69 inteiro para sincronizar. A T-68 pode começar com MSW após a sincronização.

## Commit sugerido

`docs/feat-14 contract agreed (contract v0.69)`
