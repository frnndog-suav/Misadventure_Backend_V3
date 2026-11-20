# 051 — T-42 — Recompensas pendentes e Vasculhar

- **Data** — 2026-11-20
- **Status** — concluída
- **Spec** — REQ-114 e REQ-115
- **Contrato** — v0.57, acordado
- **Horas** — a preencher pelo autor

## Objetivo

Retomar do devlog 050 e verificar a pausa e a retomada do desfecho, a entrega de recompensas e os recibos de Vasculhar pelo caso de uso.

## Arquivos

- `random-event.test.ts` cobre a compra que passa do deck da zona para a reserva, a recusa atômica por descarte insuficiente, o destino das três origens, a busca no deck vazio e a finalização única com reposição.
- `scavenge.test.ts` cobre o gasto de PA, a abertura de escolha, o retorno ao fundo do deck, o empilhamento e a busca sem achado com reserva disponível.
- Os cenários de escolha usam o agregado em memória. A verificação de recarga do save e da projeção HTTP fica na T-43.
- `party/index.ts`, `random-event/index.ts` e `rewards/index.ts` aplicam as recompensas por cópia, guardam o cursor do desfecho e sorteiam a reserva com o RNG do grupo. `party-member/index.ts` guarda os recibos e `party-events/index.ts` registra descartes da pasta no limbo.
- `party-action/index.ts`, `available-actions/index.ts`, `take-party-action/index.ts` e `action-not-allowed-error.ts` leem e encaminham a escolha, carregam as cartas e expõem as recusas. O teste de Vasculhar do agregado também cobre o modo provisório do HTTP, que continua ativo até T-43.

## Como verificar

```powershell
npm.cmd test -- src/domain/campaign/application/use-cases/take-party-action/random-event.test.ts src/domain/campaign/application/use-cases/take-party-action/scavenge.test.ts
```

Na rodada inicial, espera-se que falhem os quatro cenários de recompensa do encontro e os quatro cenários novos ou atualizados de Vasculhar. A falha deve apontar para a ausência de `pendingRewards`, do campo `delivery` ou para a recusa antiga `inventoryFull`. Os demais cenários devem passar.

Após a implementação, os 28 casos dos dois arquivos devem passar, assim como a suíte de Vasculhar do agregado em `src/domain/campaign/enterprise/entities/party/scavenge.test.ts`. São testes unitários e dispensam serviços locais.

## Checks e retomada

- Typecheck, ESLint dos testes alterados e `git diff --check` passaram.
- O autor reportou 8 falhas e 20 aprovações. Dois cenários de Vasculhar falharam no matcher ao comparar diretamente o getter `Party.turn`. Os testes novos agora comparam objetos simples com os campos relevantes, o que também reduz a saída do diff.
- O anexo da nova rodada confirmou 8 falhas de comportamento e 20 aprovações.
- Implementação de domínio e caso de uso registrada no commit `f95037e`. Typecheck, ESLint dos arquivos alterados e `git diff --check` passaram.
- O autor executou a rodada final. O log confirmou 43 testes aprovados em 3 suítes, com código de saída 0.
- A T-43 retoma a partir daqui com persistência do save, projeção HTTP e validação BE da FEAT-12.
- O caso de borda de descarte parcial deve manter a pilha e o RNG intactos. O descarte de toda a pilha deve enviar as cópias ao limbo, entregar a recompensa e abrir a próxima escolha. O desfecho deve aplicar a cura final, o Pico e a reposição uma única vez.

## Commit sugerido

`feat/resolve pending rewards and scavenge (t-42)`
