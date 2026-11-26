# 099 — T-82 — Área de itens de conclusão

- Data — 2026-11-26
- Status — concluída
- Spec — v1.04, REQ-166 e REQ-172
- Contrato — v0.96, FEAT-19 `acordado`
- Horas — a preencher pelo autor

## Implementação

- `party-member`, `starting-player`, `party` e a factory de jogador — área sem slot, com quantidades agregadas em ordem de ID. Doações, recompensas de eventos e missões e achados do deck de recompensas usam a área. A entrega não abre escolha de descarte e a área fica fora dos fluxos que operam sobre inventário, montaria ou cofre.
- `markets`, `market-trade` e `vault` — exclusão do filtro comum de singles e boosters, das ofertas e compras de mercado e da operação de guardar no cofre.
- `drizzle-party-mapper` e `party-presenter` — gravação e leitura da área no snapshot JSON e projeção da lista na resposta. Saves anteriores sem o campo devolvem uma lista vazia.
- A entrega sem slot mantém os valores existentes da v0.96. Para um achado de conclusão, `lastScavenge` registra `found: true` e `delivery: 'none'`, e `lastRewardDelivery` registra `disposition: 'kept'` e `space: null`. O destino consta em `completionItems`.

## Verificação

O autor confirmou o vermelho inicial com 10 falhas esperadas e 153 casos existentes aprovados. TypeScript e ESLint passaram após a implementação.

Na primeira execução após a implementação, 231 testes passaram e 19 falharam no mapper. Os casos legados montam snapshots com base em um save atual. A gravação incondicional de `completionItems: []` introduzia um campo que os schemas históricos rejeitam. O mapper passou a gravar o campo somente quando há itens e continua usando `[]` na leitura quando o campo está ausente. O teste de lista vazia agora verifica também a ausência do campo no JSON.

Na reexecução do mapper, 54 de 55 testes passaram, incluindo os casos legados e os de persistência de itens de conclusão. A asserção do JSON completo ainda incluía a lista vazia copiada do estado de domínio. O teste agora verifica a lista vazia no domínio e sua ausência no JSON esperado, mantendo a comparação completa do snapshot.

O autor confirmou a aprovação da suíte do mapper após o último ajuste. As outras sete suítes passaram na primeira execução após a implementação. A verificação unitária dispensou serviços locais.

## Pendências

- Retomada na T-83 após autorização do autor (REQ-165, REQ-167 e REQ-168).
- A validação integrada da FEAT-19 permanece na T-86.

## Commit sugerido

`feat/add completion item storage and delivery (t-82)`
