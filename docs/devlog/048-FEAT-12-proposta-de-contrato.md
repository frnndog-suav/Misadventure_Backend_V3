# 048 — FEAT-12 — Proposta de contrato para eventos aleatórios

- **Data** — 2026-11-20
- **Status** — concluída
- **Contrato** — v0.57, `acordado`
- **Roadmap** — v0.58
- **Horas** — a preencher pelo autor

## Objetivo

Definir as intenções e respostas para a tela do grupo e dar ao frontend cenários determinísticos para fechar os critérios da FEAT-12.

## Decisões propostas

- A última parte é avaliada em uma transação provisória. Checagem mínima recusada preserva o encontro, os pagamentos anteriores e a opção de desistir.
- A configuração de eventos por tipo de zona mantém referências a combate. O baralho jogável nesta etapa contém eventos aleatórios executáveis. A conversão do conteúdo legado depende de revisão do autor.
- Recompensas paralisam a execução quando falta espaço. O destino ao deixar depende da origem, inclusive achados do Vasculhar. Relógios habilitados dependem da FEAT-26.
- D-20 e D-98 explicam o formato legado. D-88 e REQ-92 registram a recusa provisória que o contrato substitui. A próxima etapa registra os critérios Dado / Quando / Então e as tarefas BE da FEAT-12 na spec.

## Arquivos e verificação

- `docs/CONTRATO.md` descreve os formatos, as recusas e os cenários de validação.
- `docs/ROADMAP.md` registra o aceite e libera a etapa de implementação.
- `docs/devlog/README.md` indexa esta entrada.
- `Get-FileHash` confirmou três pares de documentos compartilhados idênticos antes da edição. `git diff --check` confere o patch. Validação HTTP e da tela ficam pendentes da implementação.

## Ponte com o frontend

O frontend confirmou a recusa atômica da última parte, a seleção por cópia, a projeção jogável do deck e o Vasculhar sem espaço na v0.54. A v0.55 esclareceu o consumo via `prepare/activate` e a seleção `handCardSelection`. O frontend aceitou a v0.55 integralmente. Levar o CONTRATO v0.56 e o ROADMAP v0.58 completos. Na implementação, executar os cenários acordados, incluindo a restauração do RNG após recusa da última parte e o consumo da cópia escolhida entre duplicatas. A entrega integrada inclui o contrato em `implementado (BE)`, a URL do ambiente de teste e os dados dos cenários.

## Commit sugerido

`docs/feat-12 agree lab config limits (contract v0.57)`

## Complemento da configuração do laboratório

O frontend aceitou os dois formatos de `LabConfig.limits` e o caminho `reserveDeck.0.weight` para peso zero. `docs/CONTRATO.md` v0.57 registra os tipos, o pedido e a resposta esperada. `git diff --check` passou. A validação HTTP fica para a implementação do backend. No frontend, a associação do erro à linha da reserva fica na T-59. Encontro e Vasculhar podem seguir com MSW.
