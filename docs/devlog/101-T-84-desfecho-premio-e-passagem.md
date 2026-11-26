# 101 — T-84 — Desfecho, prêmio e passagem

- Data — 2026-11-26
- Status — concluída
- Spec — v1.06, REQ-167 a REQ-170
- Contrato — v0.97, FEAT-19 `acordado`
- Horas — a preencher pelo autor

## Alterações

- `docs/CONTRATO.md` registra o aceite do frontend para `destination: 'mount'` no recibo e explicita a exceção das montarias à regra de recompensa pendente.
- `random-event.test.ts` cobre o slot vazio com duas cópias (uma equipada e uma no limbo) e o slot ocupado (duas cópias no limbo). Os cenários conferem o recibo e a ausência de recompensa pendente.
- `take-party-action`, `Party` e `available-actions` ligam a ação direta e a vitória contra o chefe ao desfecho comum, com recibo por membro, prêmio, seleção da sucessora, preparação e resolução de pendências pelo dono.
- `rewards`, `PartyPresenter`, `DrizzlePartyMapper` e o repositório de teste preservam e projetam os recibos e as pendências. Os campos opcionais mantêm a leitura de saves antigos. O status é gravado como `frozen` quando não há sucessora publicada.
- Os testes cobrem também Pico de chefe e de conclusão, avanço para a menor ordem de lançamento superior, ouro com bolsa quase cheia, pendência resolvida após a passagem e reabertura do recibo e das pendências no mapper.

## Verificação e pendências

- TypeScript, ESLint nos arquivos alterados e `git diff --check` passaram. O domínio mantém a preparação no RNG semeado e recebe data e gerador de IDs pelas portas existentes.
- A primeira execução do autor encontrou dois `TypeError` ao comparar o agregado com `toMatchObject`, que tentou escrever no getter `pendingRewards`. O teste passou a conferir a lista de pendências diretamente e a usar `toHaveProperty` para verificar o recibo.
- Na segunda execução, os dois cenários passaram pela verificação de pendências e falharam na asserção do recibo com `Received: undefined`. Esse é o resultado esperado antes de implementar o desfecho.
- O autor confirmou a falha esperada e autorizou a implementação.
- Na primeira execução completa, os cenários de montaria passaram. A suíte registrou 1.835 aprovações e quatro falhas em expectativas legadas. `load-content.test.ts` passou a esperar `completionItem: false` quando o arquivo omite o campo. No mapper, a verificação de status desconhecido passou a usar `unknown`, pois `frozen` agora é válido.
- A execução iniciada às 13h01min45s registrou 1.838 aprovações. A única falha foi a do mapper, cujo teste foi atualizado às 13h01min52s, depois do início da suíte.
- O autor confirmou que a execução final de `npm test` passou sem falhas.
- A retomada de saves congelados após publicação e o tratamento HTTP de sessão estão planejados na T-85. A validação integrada da FEAT-19 segue na T-86.

## Commit de implementação

`feat/resolve dimension completion and prizes (t-84)` — a fazer pelo autor.
