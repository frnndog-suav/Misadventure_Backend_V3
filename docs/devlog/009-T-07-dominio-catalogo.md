# 009 — T-07 — Domínio do catálogo (FEAT-04)

- **ID:** T-07 · **Data:** 2026-11-14 · **Status:** aguardando revisão
- **Spec:** v0.11 · **Contrato:** v0.11 (FEAT-04 `acordado`) · **Roadmap:** v0.13

## Objetivo
Criar o domínio `catalog`: tipos das cartas (como no contrato), a regra de integridade do conteúdo (REQ-15), a porta `CardCatalog` e os casos de uso das três rotas (REQ-12 a REQ-14). Sem infra: o leitor de arquivos é da T-08 e as rotas são da T-09.

## Antes da tarefa (mesma sessão)
- `/mudar-spec`: planejamento da FEAT-04 (REQ-10 a REQ-15, D-18 a D-22, T-07 a T-09). O autor aprovou D-19, D-20 e D-21 em 2026-11-14.
- `/contrato FEAT-04`: proposta do backend (CONTRATO v0.10, ROADMAP v0.12). O frontend aceitou sem mudanças (CONTRATO v0.11, ROADMAP v0.13).
- Commits do autor: `docs/feat-04 planning` e `docs/feat-04 planning and contract proposal`.

## Decisões
- **D-23:**
  - As cartas são tipos `readonly`, sem classes `ValueObject`.
  - Os enums são arrays `const` e servem de fonte única para o Zod da T-08.
  - A função `checkCatalogIntegrity` cobre o que o tipo não expressa. Cada problema sai como `{ collectionId, cardId, field, reason }`.
  - `outOfRange` nas setas tem precedência sobre `urbanZoneRequiresFourArrows`.
  - A ordem por `id` compara os códigos dos caracteres.
  - No filtro, o `type` inválido é conferido antes da coleção: o `400` vem antes do `404`.
- **D-18:** a porta não recebe filtro. O filtro e a ordem ficam nos casos de uso.
- **Pendente com o autor:** decidir se o id da coleção também precisa seguir a forma kebab de D-22. Isso não está em REQ-15.

## Passos e comandos
1. Testes primeiro: um teste por regra de REQ-15, mais os testes dos casos de uso. Estado vermelho confirmado: os módulos de produção ainda não existiam.
2. Implementação até ficar verde.
3. Revisão do agente `spec-reviewer`: sem lacunas. Três correções aplicadas:
   - `priceMultiplier` `NaN` agora é rejeitado, com teste.
   - O `switch` exaustivo não devolve mais `never`.
   - A precedência das setas foi registrada em D-23.
4. `npm run format`, `npx vitest run`, `node .claude/hooks/domain-guard.mjs --all`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`.

## Arquivos
- **Criados:**
  - `src/domain/catalog/enterprise/value-objects/card/index.ts`
  - `src/domain/catalog/enterprise/catalog-integrity/index.ts` e `index.test.ts`
  - `src/domain/catalog/application/repositories/card-catalog/index.ts`
  - `src/domain/catalog/application/use-cases/{list-collections,list-collection-cards,get-card}/index.ts` e `index.test.ts`
  - `src/domain/catalog/application/use-cases/_errors/{catalog-query-invalid,collection-not-found,card-not-found}-error.ts`
  - `src/domain/catalog/application/use-cases/_shared/sort-by-id.ts`
  - `test/factories/make-card/index.ts`
  - `test/fakes/in-memory-card-catalog.ts`
- **Alterados:**
  - `docs/SPEC-BACKEND.md` (v0.11)
  - `docs/devlog/README.md`
  - `docs/devlog/tempo.html`

## Como verificar
`npx vitest run src/domain/catalog`, rodado pelo **PowerShell**. Resultado esperado: 4 arquivos e todos os testes verdes.

## Problemas
- No Git Bash, o vitest falha com `Cannot read properties of undefined (reading 'config')` em **todos** os testes, inclusive nos do `lab`, que já estavam verdes. A causa provável é o caminho `/d/...`. Pelo PowerShell, os testes rodam normalmente.

## Checks
- **Testes unitários:** 87 de 87, em 10 arquivos.
- **domain-guard:** OK.
- **typecheck, lint, format:check e build:** todos com código de saída 0.

## Ponte com o frontend
Nada novo a levar: o contrato não mudou.

## Commit sugerido
`feat/catalog domain (t-07)`
