# 022 — T-14 — Domínio do catálogo e configuração (FEAT-06)

- **ID:** T-14 (FEAT-06) · **Data:** 2026-11-16 · **Status:** aguardando revisão
- **Spec:** v0.25 · **Contrato:** v0.24 (FEAT-06 `acordado`, sem mudança) · **ROADMAP:** v0.29

## Objetivo
Pôr no domínio o conteúdo novo da FEAT-06: as 11 chaves novas da `GameConfig` (REQ-29, D-41), `arrowLayout` nas zonas (D-37), a Carta de Dimensão (D-39), as classes com deck pré-pronto (D-40), as regras de integridade de REQ-26, a trava da classe (`isClassActive`, REQ-30), `listClasses`/`findClass` na porta `CardCatalog`, `ListClassesUseCase` (REQ-27) e o filtro `dimension` (REQ-28).

## Decisões
- **Ponte mínima (aprovada pelo autor):** só mexer no domínio deixaria o typecheck e o boot quebrados até a T-15. Por isso o infra recebeu o mínimo: schema Zod de `arrowLayout` e de `dimension.json`, `arrowLayout` nas zonas de `content/base` e da `fixture` (`whispering-grove` = `straight`, como no contrato), os textos pt-BR dos motivos novos e os ajustes nas asserções e2e de `cardCounts` e `/lab/config`. Até a T-15, `FileContentStore.listClasses` e `findClass` devolvem vazio. O editor ainda não aceita `dimension` no `CardInput` (fica para a T-18).
- **D-56 (nova):** motivos, forma do problema de classe, precedências, `classes` opcional na integridade com os padrões de `GameConfig`, assinatura de `isClassActive` e `findClass` com texto cru.
- Dois testes antigos foram alinhados ao contrato, porque `CardType` agora tem `dimension`: a contagem de tipos em create-collection (7) e a lista de arquivos esperados em `load-content.test.ts`.

## Passos e comandos
1. Tipos e config: `defaults.ts`, `value-objects/card`.
2. Testes primeiro: integridade (REQ-26, uma regra por `it`), `class-lock`, `list-classes`, filtro `dimension` e `cardCounts` (REQ-28), além de REQ-04/REQ-29 em `game-config`. O vermelho foi confirmado: 18 falhas de REQ-26 e os módulos inexistentes.
3. Implementação: `checkCatalogIntegrity`, `isClassActive`, `ListClassesUseCase`, fakes e factories (`makeDimensionCard`, `makeClassDefinition`).
4. Ponte no infra (ver Decisões).
5. `npm run format`, `npm run lint`, `npm run typecheck`, `node .claude/hooks/domain-guard.mjs --all`, `npx vitest run`, `npm run build`, `npm run validate:content -- content`, `npm run validate:content -- test/fixtures/content`.

## Arquivos
**Criados:**
- `src/domain/catalog/enterprise/class-lock/index{,.test}.ts`;
- `src/domain/catalog/application/use-cases/list-classes/index{,.test}.ts`.

**Alterados:**
- domínio: `catalog/enterprise/{value-objects/card,catalog-integrity,editor-collection}`, `catalog/application/repositories/card-catalog`, `lab/enterprise/value-objects/game-config/defaults.ts` e os testes de `catalog-integrity`, `game-config`, `list-collections`, `list-collection-cards` e `create-collection`;
- infra: `src/infra/content/{card-schemas,content-messages,file-content-store}.ts`, `load-content.test.ts`, `catalog-published-only.e2e-spec.ts`, e2e de `get-lab-config`, `update-lab-config`, `list-collections`, `create-collection` e `get-editor-collection`;
- test: `test/factories/make-card`, `test/fakes/in-memory-{card-catalog,content-store}.ts`;
- conteúdo: `content/base/zone.json`, `test/fixtures/content/fixture/zone.json`;
- `docs/SPEC-BACKEND.md` (v0.25).

## Como verificar
- `npx vitest run src/domain/catalog src/domain/lab`.
- `npm run test:e2e` (precisa do Postgres).
- `npm run validate:content -- content`.

- Revisão `spec-reviewer`: aprovado, sem bloqueantes. Entraram: `duplicateEssentials` só com essenciais válidas e testes das precedências de D-56. Pendências para a T-15: `load-content` apontar problema de classe para `class.json`.

## Problemas
- O Git Bash não tem `python`. As edições foram feitas com Edit/`sed`/`node`.
- No primeiro rascunho, a classe com essenciais inválidas também gerava `starterDeckLockNotMet`. Isso foi resolvido pela precedência de D-56(d).
- Os e2e não rodaram nesta sessão: o Postgres estava desligado (`docker compose ps` vazio).

## Checks
- domain-guard OK.
- tsc, eslint e format:check limpos.
- Unitários: 51 arquivos, 375 testes (com os 4 da revisão).
- build ok.
- validate:content: `content` com 7 cartas e `fixture` com 6, ambos ok.
- e2e: pendente (Docker).

## Ponte com o frontend
Nenhuma nesta tarefa. A FEAT-06 só fica `implementado (BE)` na T-18.

## Commit sugerido
`feat/catalog domain for match setup`
