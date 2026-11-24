# 085 — T-69 — Ir ao Ferreiro: consertar, refinar e criar

- Data — 2026-11-24
- Status — aguardando revisão
- Spec — v0.85 (REQ-149, REQ-150, REQ-152, D-132; nova D-138)
- Contrato — v0.85, FEAT-17 `acordado` (sem mudança)

## Objetivo

Ação `visitBlacksmith` em lote: consertar, refinar e criar. O lote é conferido inteiro sem rolar e depois executado em ordem, com rolagens. A ação gasta todos os PA. A projeção `blacksmith` e o `lastBlacksmithVisit` vão para o jogador. Ficam fora: encantar (T-70), Oficina (T-71) e venda com estado (T-72).

## Fluxo

1. Pergunta ao autor sobre o `enchant` antes da T-70. Escolha: o parser aceita, o domínio recusa com `enchantmentNotOffered` (D-138 a).
2. Domínio:
   - módulo novo `blacksmith` (`applyBlacksmithOperations`, `describeBlacksmith`);
   - `Party.visitBlacksmith` e `describeBlacksmith`;
   - evento `BlacksmithVisited`;
   - parser e `availableActions`.
3. Infra:
   - caso de uso (`findBlacksmithCatalog`);
   - presenter (`blacksmith`, `lastBlacksmithVisit`);
   - mapper (save v10 com `lastBlacksmithVisit` opcional).
4. Testes:
   - unitários do módulo (exemplos numéricos, `skipped`, ordem das recusas, criar);
   - entidade (todos os PA, recusa sem efeito colateral, evento);
   - parser, `availableActions` e mapper;
   - e2e novo `index.blacksmith.controller.e2e-spec.ts`.
   - Cenários antigos ganharam `visitBlacksmith` antes de `visitMarket`, como o contrato manda.
5. Revisão pelo `spec-reviewer`.

**Nota de processo:** os testes do módulo foram escritos depois da implementação, na mesma sessão, e não antes (desvio do TDD).

## Decisões

- D-138 (a) a (g): ver a spec.

## Arquivos

- **Domínio:**
  - novos: `blacksmith/index.ts` e `index.test.ts`, `party/visit-blacksmith.test.ts`, `party-action/visit-blacksmith.test.ts`
  - alterados: `party-action`, `party/index.ts`, `party-member`, `party-events`, `available-actions` (+ teste), `take-party-action`, `action-not-allowed-error`
- **Infra:**
  - `drizzle-party-mapper.ts` (+ teste)
  - `party-presenter/index.ts`
- **e2e:**
  - novo: `index.blacksmith.controller.e2e-spec.ts`
  - `visitBlacksmith` nos `availableActions` esperados de create-party, start-session, take-party-action, market, prepare e vault
  - `blacksmith` e `lastBlacksmithVisit` em create-party

## Checks

- typecheck, lint, format, build e domain-guard: ok.
  - O lint ainda mostra os erros antigos de `test/prepare-feat-13.cjs` e `prepare-feat-14.cjs`.
- `npm test`: 1621 testes passando.
- e2e (take-party-action, create-party, start-session): 130 testes passando.

## Problemas

- A 1ª rodada dos e2e falhou em 4 testes porque o terminal do autor tinha `CONTENT_DIR` apontando para a cópia antiga das fixtures da T-66 (sem o ferreiro). O `test/setup-e2e.ts` só usa as fixtures quando `CONTENT_DIR` está vazio. Com `env -u CONTENT_DIR`, tudo passou.

## Commit sugerido

`feat/add visit blacksmith with repair, refine and craft (t-69)`
