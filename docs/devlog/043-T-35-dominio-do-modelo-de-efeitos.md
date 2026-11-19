# 043 — T-35 — Domínio do modelo de efeitos (FEAT-11)

- **Data:** 2026-11-18
- **Status:** aguardando revisão
- **Spec:** v0.52 (REQ-98, REQ-99, D-103) · **Contrato:** v0.51 `acordado` (sem mudança) · **Roadmap:** v0.53

## Objetivo
Dar ao domínio o modelo de efeitos (README 13, REQ-98) e as regras de conteúdo de REQ-99: tipos das quatro uniões por `kind`, `Effect` nas 5 cartas, regras em `checkCatalogIntegrity` (portanto também no editor, no publicar e no import) e citação conferida ao publicar.

## Decisões
- **Uma tabela de faixas por união** (`Record<kind, Rule>` em `effect-rules/`): variação nova no tipo sem regra não compila (princípio 10). Prós: o catálogo vira dado conferível, um teste conta 46/11/56/59 kinds. Contra: a tabela repete as faixas do catálogo (a fonte continua `EFEITOS-CATALOGO.md`).
- **Passivo em consumível sem motivo próprio** (D-103): passivo = sem gatilho e sem custo, logo sem `consumeSelf`; `consumableNeedsConsumeSelf` em `effects[i].cost` já o cobre e é o exemplo do contrato (um problema só, não dois).
- Faixa/texto/`activation` vazios reaproveitam `outOfRange`, `duplicateValue` e `empty`; 10 motivos novos (D-103).
- **Citação:** `resource`/`exclude` só aceitam palavras fixas, categoria, local ou `tag:<texto>`; ao publicar, `cardId` citado e `zoneTitle` precisam existir no catálogo (qualquer status, confirmado pelo autor; qualquer coleção; a própria carta incluída). Revisão do spec-reviewer: `Object.hasOwn` para `kind`, teste do editor com a poção, zona renomeada fora da conferência.
- **Textos pt-BR dos 10 motivos antecipados da T-36** (`content-messages.ts`): o `Record<TCatalogIssueReason, string>` exaustivo não compila sem eles.

## Passos
1. Testes primeiro: `effect-rules/index.test.ts` (54 testes) + 1 teste de citação em cada um de publicar, substituir e importar; falharam por módulo/função inexistente.
2. `value-objects/effect/index.ts` (tipos do contrato), `card/index.ts` (`effects` das 5 cartas), `effect-rules/index.ts`, `catalog-integrity` (chama `checkEffects`), `card-validation` (`effectCitationPublicationIssues`), ligação nos 3 casos de uso.
3. Factories `makeEffect`/`makeZoneEffect`; testes antigos que usavam `{ text }` migrados.

## Arquivos
- Criados: `src/domain/catalog/enterprise/value-objects/effect/index.ts`, `src/domain/catalog/enterprise/effect-rules/index.ts` e `index.test.ts`.
- Alterados: `value-objects/card/index.ts`, `catalog-integrity/index.ts`, `card-validation/index.ts`, casos de uso `publish-card`, `replace-card`, `import-collection` (+ testes), `test/factories/make-card/index.ts`, testes de `map-assembly`, `dimension-composition`, `class-lock`, `src/infra/content/content-messages.ts`, `docs/SPEC-BACKEND.md`.

## Como verificar
`npx vitest run src/domain/catalog src/domain/campaign/enterprise/map-assembly` (398 testes verdes); `node .claude/hooks/domain-guard.mjs --all`.

## Problemas
- **Vermelho esperado até a T-36:** `src/infra/content/load-content.test.ts` (13) e `file-content-store.test.ts` (18) leem `content/` e a fixture no formato antigo (`{ text }`), que as regras novas recusam. Schemas Zod, leitor e conversão do conteúdo são da T-36. O boot do servidor com `content/` também acusa problemas até lá.

## Checks (2026-11-18)
guarda ✅ · typecheck ✅ · lint ✅ · format ✅ · testes de domínio 918 ✅ / infra de conteúdo 31 ❌ (esperado, T-36)

## Ponte com o frontend
Nenhuma nesta tarefa (o contrato já está `acordado`; `implementado (BE)` só no fim da T-39).

## Commit sugerido
`feat/effects domain model and content rules (t-35)`
