# FEAT-22 — Elenco solo e precedência HTTP

- **Data** — 2026-11-27
- **Status** — concluída
- **Referências** — SPEC-FRONTEND D-68 e REQ-110 a REQ-114. README §§3.2, 19.2, 19.5, 20.2 e 21.1
- **Contrato e roadmap** — v1.18 e v1.04
- **Horas** — a preencher pelo autor

## Decisões

O frontend confirmou a vitória coletiva por Reflexão com zero sobreviventes. O contrato registra progresso da missão quando aplicável, consequências normais do nocaute, ausência de ganhos e saque de combate e, no chefe final, conclusão única após os respawns. Com apenas o iniciador no elenco confirmado, vale o fluxo solo e a vitória por Reflexão conserva sua recompensa histórica.

Na precedência proposta, o recibo da chave original é resolvido antes do estado corrente. Durante a recuperação, uma chave concorrente recebe `ACTION_ADVANCE_PENDING`. Depois de concluído o avanço, uma decisão consumida recebe `combatDecisionExpired`, que também prevalece sobre a divergência de responsável quando o ID está vencido. Uma tentativa de recrutamento tardio sem referência a uma decisão consumida correspondente recebe `combatRecruitmentClosed`.

## Arquivos e verificações

- `docs/CONTRATO.md` — cenários 1, 2, 5, 6 e 7 atualizados com resultados esperados.
- `docs/ROADMAP.md` — revisão e pendência da T-109 registradas no histórico.
- `docs/devlog/README.md` e esta entrada — registro da etapa.
- `git diff --check` passou. Etapa documental. Os cenários de execução ficam para a implementação e a validação integrada.

## Ponte com o frontend

Sincronizar as cópias integrais do contrato e do roadmap e obter a confirmação final dos dois ajustes. A T-109 com MSW começa após o acordo.
