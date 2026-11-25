# 093 — T-76 — Estábulo

- Data — 2026-11-25
- Status — aguardando revisão
- Spec — v0.96, T-76, REQ-158, D-151
- Contrato — v0.90, FEAT-18 `acordado` (sem mudança)
- Horas — registro automático

## Objetivo

Operações `buyMount` e `sellMount` no lote do `visitMarket` e a projeção `market.stable` (README 26, 24; REQ-158).

## Decisões (D-151)

- (a) `noMount` sem `cardId`; as demais recusas do Estábulo levam o `cardId` (no `mountNotEmpty`, o da montaria atual).
- (b) Carta da montaria ausente do catálogo: `currentMount: null` e venda por 0; id de `market.mounts` que não é `mount` fica fora das ofertas (`mountNotOffered`).
- (c) Ouro acima da bolsa na venda → `goldLost` (como a REQ-142).
- (d) O cenário "Estábulo" do contrato (400 de ouro) exige bolsa acima de 300: o e2e usa `purseCapacity: 1000`; a campanha preparada da T-80 precisa do mesmo.

## Arquivos

- Domínio: `enterprise/market-trade` (preços `mountPurchasePrice`/`mountSellPrice`, `stable` na projeção, operações e recusas novas; `zoneMounts` opcional), `party-action` (tipos e parser), `entities/party` (passa `market.mounts`), caso de uso `take-party-action` (carrega as montarias da zona e a do jogador).
- Infra: `party-presenter` (carrega as cartas de `market.mounts`), `drizzle-party-mapper` (resultados `buyMount`/`sellMount` em `lastMarketVisit`; sem nova versão de save: só acrescenta variantes).
- Testes novos: `market-trade/stable.test.ts` (10), e2e `take-party-action/index.stable.controller.e2e-spec.ts` (7; o mapa é sorteado, então a zona e o conteúdo da montaria são ajustados no banco, como no e2e da T-75).

## Como verificar

```
cd /d/Github/Misadventure_Backend_V3
npx vitest run src/domain/campaign/enterprise/market-trade
npm run test:e2e -- src/infra/http/controllers/take-party-action/index.stable
```

## Checks

guarda do domínio OK · typecheck OK · format OK · 935 testes afetados verdes · e2e do Estábulo, mercado e montaria verdes · build OK · lint: 73 erros já existentes em `test/prepare-feat-13.cjs` e `test/prepare-feat-14.cjs` (`process` não definido), fora desta tarefa.

## Ponte com o frontend

Nada a levar agora; a validação integrada da FEAT-18 é a T-80.

## Commit sugerido

`feat/add stable buy and sell mount operations (t-76)`
