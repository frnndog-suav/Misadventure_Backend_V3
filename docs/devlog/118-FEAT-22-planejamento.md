# FEAT-22 — Planejamento do backend

- **Data** — 2026-11-27
- **Status** — concluída
- **Horas** — a preencher pelo autor

A T-111 foi concluída no frontend com MSW e o ROADMAP v1.06 já estava sincronizado em `74084ef`. Os sete cenários do CONTRATO v1.19 foram associados aos critérios REQ-186 a REQ-191 na SPEC-BACKEND v1.16. As tarefas T-113 a T-117 cobrem o domínio, a integração HTTP e o pacote de validação.

## Arquivos e verificações

- `docs/SPEC-BACKEND.md` — critérios e tarefas conferidos contra os sete cenários acordados.
- `docs/devlog/README.md`, `docs/devlog/tempo.html` e esta entrada — etapa registrada, com duração a preencher.
- `git diff --check` passou. Etapa documental, sem execução de testes.

## Retomada

A T-113 começa pelos testes da REQ-186. Caso de borda do cenário 1: com dois candidatos aptos na mesma zona e com zero PA, a IA exatamente na metade dos PV aceita e a abaixo da metade recusa. Se todos recusarem, o iniciador segue no combate solo com uma única cobrança do encontro.

A T-117 entrega a revisão da API e o pacote de saves, catálogo, sementes, estados e resultados para a T-112 com MSW desligado.
