# 048 — FEAT-12 — Proposta de contrato para eventos aleatórios

- **Data** — 2026-11-20
- **Status** — aguardando revisão
- **Contrato** — v0.54, `proposto (BE)`
- **Roadmap** — v0.57
- **Horas** — a preencher pelo autor

## Objetivo

Definir as intenções e respostas para a tela do grupo e dar ao frontend cenários determinísticos para fechar os critérios da FEAT-12.

## Decisões propostas

- A última parte é avaliada em uma transação provisória. Checagem mínima recusada preserva o encontro, os pagamentos anteriores e a opção de desistir.
- A configuração de eventos por tipo de zona mantém referências a combate. O baralho jogável nesta etapa contém eventos aleatórios executáveis. A conversão do conteúdo legado depende de revisão do autor.
- Recompensas paralisam a execução quando falta espaço. O destino ao deixar depende da origem, inclusive achados do Vasculhar. Relógios habilitados dependem da FEAT-26.
- D-20 e D-98 explicam o formato legado. D-88 e REQ-92 registram a recusa provisória que a proposta substitui. Os critérios da FEAT-12 e as mudanças de regra propostas aguardam acordo antes da implementação.

## Arquivos e verificação

- `docs/CONTRATO.md` descreve os formatos, as recusas e os cenários de validação.
- `docs/ROADMAP.md` registra a revisão em andamento.
- `docs/devlog/README.md` indexa esta entrada.
- `Get-FileHash` confirmou três pares de documentos compartilhados idênticos antes da edição. `git diff --check` confere o patch. Validação HTTP e da tela ficam pendentes da implementação.

## Ponte com o frontend

Levar o CONTRATO v0.54 e o ROADMAP v0.57 completos. Aguardar a confirmação do formato e dos critérios, com atenção à recusa atômica da última parte, à projeção jogável do deck e ao Vasculhar sem espaço.

## Commit sugerido

`docs/propose random event contract (feat-12)`
