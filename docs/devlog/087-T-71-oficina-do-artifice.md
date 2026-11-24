# 087 — T-71 — Oficina do Artífice

- Data — 2026-11-24
- Status — aguardando revisão
- Spec — v0.87 (REQ-153; D-133, D-134; nova D-140)
- Contrato — v0.85, FEAT-17 `acordado` (sem mudança)

## Objetivo

Ação `artificerWorkshop` (README 25.5, 12.2): com Artífice ativo, em qualquer zona, 1 PA, repetível; o mesmo lote do Ir ao Ferreiro com conserto a 50%, refino até +6 (com o +2 no D20) e sem encantar. Projeção `workshop`. Efeito `repairEquipment` passa a somar marca de reparo (D-134). Ficam fora: venda com estado (T-72) e campanhas (T-73).

## Fluxo

1. Leitura de REQ-153, D-133, D-134, D-138 (b) e da FEAT-17 do contrato (ordem das conferências, `BlacksmithView`).
2. Domínio: `applyBlacksmithOperations` ganha `source` (`blacksmith` | `workshop`): desconto no conserto, `refineLevelTooHigh` depois de `refineLevelMax`, `enchantNotAvailable` antes do alvo. `describeBlacksmith` monta `blacksmith` e `workshop` separados. `Party.artificerWorkshop` (sessão → PA → Artífice ativo → operações), `availableActions` depois de `abandonQuest`, parser compartilhado com o `visitBlacksmith`, `source` no evento `BlacksmithVisited`, `repairEquipment` com marca.
3. Infra: caso de uso com `artificerInactive`; schema do `lastBlacksmithVisit` aceita `source: 'workshop'`.
4. Testes: unitários do lote e da projeção da Oficina, do agregado, de `availableActions`, do parser e do efeito; e2e novo da Oficina. Duas expectativas antigas mudaram pela própria REQ: `workshop` deixa de ser `null` com Artífice ativo (D-138 b) e o evento ganha `source`.
5. Revisão pelo `spec-reviewer`.

**Desvio do fluxo:** os testes foram escritos logo depois da implementação, não antes (sem a etapa red registrada).

## Decisões

- D-140 (a) a (g): ver a spec.

## Arquivos

- **Domínio:** `blacksmith/index.ts` e `index.test.ts`; `entities/party/index.ts`, `artificer-workshop.test.ts`, `visit-blacksmith.test.ts`; `available-actions/index.ts` e teste; `party-action/index.ts` e `visit-blacksmith.test.ts`; `events/party-events/index.ts`; `combat/abilities.ts` e `abilities.test.ts` (novo); `take-party-action/index.ts`; `_errors/action-not-allowed-error.ts`.
- **Infra:** `drizzle-party-mapper.ts` (`source`).
- **e2e:** `index.workshop.controller.e2e-spec.ts` (novo).
- **Docs:** `SPEC-BACKEND.md` v0.87.

## Checks

- typecheck, format, build e domain-guard: ok.
- `npm run lint`: só os 73 erros antigos de `test/prepare-feat-13.cjs` e `prepare-feat-14.cjs`.
- `npm test`: 123 arquivos, 1647 testes. `npm run test:e2e`: 56 arquivos, 290 testes. Todos verdes.

## Problemas

- As fixtures não têm a classe `artificer`, e atributos essenciais não podem se repetir entre classes: o e2e renomeia a `warrior` na cópia temporária do conteúdo (D-140 g).

## Commit sugerido

`feat/add artificer workshop (t-71)`
