# 086 — T-70 — Encantar

- Data — 2026-11-24
- Status — aguardando revisão
- Spec — v0.86 (REQ-151; nova D-139)
- Contrato — v0.85, FEAT-17 `acordado` (sem mudança; uma inconsistência anotada em D-139 g)

## Objetivo

Operação `enchant` no Ir ao Ferreiro (README 25.3): slots por tipo e refino mínimo, substituição com `replaceIndex`, extra do Ferreiro Arcano, definição copiada da zona, limiares 10 (elemento) e 13 (efeito), sem bônus do Artífice. Projeção `enchantOptions`. Ficam fora: Oficina (T-71) e venda com estado (T-72).

## Fluxo

1. Perguntas ao autor: como reconhecer o Ferreiro Arcano (escolha: id fixo `arcaneSmith` da classe `artificer`) e o `replaceIndex` com slot livre (escolha: substitui mesmo assim).
2. Testes primeiro (red): 12 unitários de REQ-151/D-139 no módulo `blacksmith`; e2e com o cenário "Lote com falha e quebra" do contrato; as expectativas provisórias da D-138 (`enchantOptions: []`, `enchantmentNotOffered`) trocadas pelas reais.
3. Domínio: `case 'enchant'` no plano do lote (mesma conferência sem RNG e execução com rolagem; `skipped` quando o refino anterior falhou), `arcaneSmithActive`, `enchantOptionsOf`; `Party` passa os encantamentos da zona.
4. Infra: o schema do `lastBlacksmithVisit` (save v10) aceita `enchant`.
5. Revisão pelo `spec-reviewer`: aprovado sem bloqueantes; acrescentados testes de ordem das recusas, `extra` ignorando `replaceIndex`, ordem da substituição e checagens de PA e `skipped` no e2e.

## Decisões

- D-139 (a) a (g): ver a spec.

## Arquivos

- **Domínio:** `blacksmith/index.ts` e `index.test.ts`; `entities/party/index.ts` (1 linha).
- **Infra:** `drizzle-party-mapper.ts` (schema `enchant` e `appliedEnchantmentSchema`).
- **e2e:** `index.blacksmith.controller.e2e-spec.ts`.
- **Docs:** `SPEC-BACKEND.md` v0.86.

## Checks

- typecheck, format, build e domain-guard: ok.
- lint dos arquivos alterados: ok; o `npm run lint` completo segue com os 73 erros antigos de `test/prepare-feat-13.cjs` e `prepare-feat-14.cjs` (existem no HEAD).
- Unitários afetados: 770 de 770 (36 no módulo do ferreiro). `npm run test:e2e`: 55 arquivos, 285 testes, todos verdes.

## Problemas

- No Git Bash, o Vitest falhou em qualquer arquivo com `Cannot read properties of undefined (reading 'config')`; pelo PowerShell rodou normalmente. Não investigado a fundo.
- O cenário "Lote com falha e quebra" do CONTRATO v0.85 descreve um "5º refino skipped" que o lote de 5 operações não tem. Corrigir na próxima rodada de `/contrato FEAT-17`, junto com a menção ao id `arcaneSmith`.

## Commit sugerido

`feat/add enchant to blacksmith visit (t-70)`
