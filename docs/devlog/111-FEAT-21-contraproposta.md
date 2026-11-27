# FEAT-21 — Contraproposta de contrato

- **Data** — 2026-11-27
- **Status** — revisão concluída, contraproposta aguardando acordo
- **Contrato** — v1.11 recebido do FE, v1.12 proposto pelo BE
- **Roadmap** — v0.99
- **Horas** — a preencher pelo autor

## Objetivo

Sincronizar os documentos compartilhados e revisar os seis cenários da FEAT-21 após a aprovação da P-02. O momento 2 usa apresentação sequencial após o HTTP. Socket.IO fica para a FEAT-26.

## Decisões

- O CONTRATO v1.12 define a projeção pública das vezes automáticas, com cada transição de combate autocontida no acontecimento e ligada por índice ao lote da ação.
- A revisão avança a cada transação que grava mudança no save, inclusive checkpoints e reparos de legado. O recibo captura a revisão original e o GET permite detectar uma resposta superada. O valor zero identifica recibos históricos sem revisão.
- A abertura com chave própria permite recuperar o resultado concluído sem reapresentá-lo numa abertura nova. Sessão e ação compartilham o avanço pendente e finalizam seus recibos junto ao snapshot. A revisão tomou como base REQ-183 a REQ-185, D-157, o serviço de avanço, os casos de uso de sessão e GET, o repositório e os E2E de avanço automático.

## Arquivos

- `docs/CONTRATO.md` — cópia integral v1.11 seguida da contraproposta v1.12.
- `docs/ROADMAP.md` — cópia integral v0.99.
- `docs/devlog/README.md` e esta entrada.

## Verificações

As duas cópias coincidiram com os respectivos SHA-256 do frontend após a importação. O ROADMAP permanece idêntico ao arquivo recebido. Os seis cenários foram revisados no contrato. A etapa é documental e a execução dos cenários fica para a implementação e a validação integrada.

```bash
cd /d/Github/Misadventure_Backend_V3
git diff --check
```

A conferência deve terminar sem erros de whitespace.

## Ponte com o frontend

Levar o CONTRATO v1.12 inteiro para confirmar formatos, revisão, recuperação e os seis cenários. A T-105 começa com MSW após o acordo. A validação integrada e as medições com cinco ajudantes ficam após a implementação no backend.

## Commit sugerido

`docs/propose feat-21 contract (contract v1.12)`
