# FEAT-15 — Revisão da proposta do frontend

- Data: 2026-11-22
- Status: concluída
- Spec: backend v0.64 (sem mudança), frontend v0.82
- Contrato: v0.73, `acordado`
- Horas: a preencher

## Objetivo e decisões

Revisar a v0.70 para os REQ-66 a REQ-70 do frontend. A contraproposta define estado, intenções, formatos de conteúdo do editor, laboratório, recusas e respostas HTTP de referência. A regra de aquisição segue README §8.2: nova trava inativa até salvar a build. O progresso no primeiro POST do desfecho, mesmo com escolha pendente, e a separação entre tentativa e entrega são propostas em revisão.

## Arquivos e verificação

- `docs/CONTRATO.md`: versão, seção FEAT-15 e histórico. Os exemplos cobrem reposição, abandono, conclusão, recusa e reabertura, incluindo Reflexão fatal com etapa concluída e contador genérico intacto.
- `docs/devlog/README.md`: índice da revisão.
- Conferência documental com README §§3.4, 8.2–8.4, 12.2 e 21 e Apêndice A. `git diff --check` passou. A etapa foi documental.

## Revisão após o aceite parcial

A v0.72 define o combate embutido conforme README §§18.1 e 21.1. Mantém referência tipada para evento aleatório e preserva o deck e o descarte de eventos da zona. Acrescenta uma sequência de tentativa, recompensa pendente e entrega com PA e escolhas, exemplos de PUT e de validação da dimensão e a ativação de Cavaleiro ao salvar uma build. O reforço da especialização agora identifica quais essenciais recebem o acréscimo, conforme o README §8.6. Os exemplos são referências contratuais. A verificação foi documental, com `git diff --check`.

## Ponte com o frontend

O frontend aceitou parcialmente a v0.71, incluindo o momento do progresso, a vitória com o dono caído e a separação entre tentativa e entrega. O frontend aceitou a v0.72 para os REQ-66 a REQ-70 no recorte solo. A v0.73 registra o acordo e libera a T-69 para cliente e fixtures MSW após a sincronização. Os cenários serão executados nas etapas de implementação e validação integrada. O planejamento do backend continua em etapa própria; a T-54 da FEAT-14 permanece em andamento.

Commit sugerido: `docs/feat-15 contract agreed (contract v0.73)`
