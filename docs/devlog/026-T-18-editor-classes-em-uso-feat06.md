# 026 — T-18 — Editor: dimensão, classes e conteúdo em uso (FEAT-06)

- **ID:** T-18 (FEAT-06) · **Data:** 2026-11-17 · **Status:** concluída
- **Spec:** v0.29 · **Contrato:** v0.25 (FEAT-06 `implementado (BE)`) · **ROADMAP:** v0.30

## Objetivo
Fechar o lado backend da FEAT-06 no editor:
- REQ-36 no `validate-dimension`;
- classes no editor (REQ-38);
- conteúdo usado por save → `CONTENT_IN_USE` (REQ-39);
- carta no deck pré-pronto de uma classe → `CONTENT_REFERENCED` (REQ-40);
- export e import com classes (REQ-48).

## Decisões
- **D-60 (nova):**
  - PUT em classe publicada aplica as regras de publicação (decisão do autor).
  - `playerClass` já usado → 409 antes da conferência de nome; nome repetido com outro `playerClass` → 400 com `path` `name`.
  - `CONTENT_REFERENCED` também vale ao excluir a coleção e no import com `replace` (decisão do autor).
  - Ordem dos erros: no import, 400 e 409 de ids antes de em-uso/referenciada; nos deletes, 404 → em uso → referenciada.
  - `releaseOrder` único no catálogo inteiro.
  - Motivo novo `starterDeckCardNotPublished`; `classesNotSupported` sai.
  - `findContentInUse` lê todos os saves (o editor é só de dev).
  - Um e2e único para as rotas de classe.
  - Adiado: duplicar Carta de Dimensão (por `/mudar-spec`, antes da FEAT-19).
- **D-57(b):** resolvida (a integridade recebe o `status` das classes).

## Passos e comandos
1. **Domínio** (TDD):
   - `Party.contentInUse()` e `PartiesRepository.findContentInUse()`.
   - Erros `ClassNotFoundError`, `ContentInUseError` e `ContentReferencedError`; porta `ClassInputParser`.
   - Seis casos de uso de classe.
   - Delete, replace e import de cartas e coleções com em-uso e referenciada.
   - `validateCandidate` com `otherDimensions`.
2. **Infra:**
   - `ZodClassInputParser` e `dimension` no `cardInputSchema`.
   - `FileContentStore` com `class.json`.
   - `load-content` passa o `status` das classes.
   - `DrizzlePartiesRepository.findContentInUse`.
   - Filtro: `CLASS_NOT_FOUND` → 404; `CONTENT_IN_USE` e `CONTENT_REFERENCED` → 409.
   - Seis controllers, presenters e `client.http`.
3. **Revisão `spec-reviewer`:** pediu e2e de import com `replace` em uso (REQ-39) e de renomear carta referenciada (REQ-40). Ambos foram acrescentados em `content-in-use.e2e-spec.ts`.
4. **Commit:** o código foi commitado pelo autor em `a60c06f`. Docs e e2e extras ficam para o próximo commit.

## Arquivos
- **Domínio:** `src/domain/catalog/**`, com os casos de uso de classe e as alterações nos de cartas e coleções. Também `Party` e `PartiesRepository` em `src/domain/campaign/**`.
- **Infra:** `src/infra/content/*`, `src/infra/http/**`, com os controllers e presenters de classe.
- **Testes e e2e:** `test/**`, `content-in-use.e2e-spec.ts`, `create-class/index.controller.e2e-spec.ts`.
- **Docs:** `client.http`, spec, CONTRATO e ROADMAP.

## Como verificar
- `npm test` e `npm run test:e2e`, com o Postgres no ar.
- `curl` dos cenários do CONTRATO FEAT-06 (veja o roteiro da resposta da tarefa).

## Problemas
- Postgres caiu durante o fechamento. Os dois e2e novos ainda não rodaram: falta rodar `npx vitest run --config vitest.config.e2e.ts src/infra/http/content-in-use.e2e-spec.ts`.

## Checks
- Antes do fechamento: typecheck, lint, guarda do domínio e build sem erros; `npm test` (533) e `npm run test:e2e` (135) passando.

## Ponte com o frontend
- AVISO DE FRONTEND da FEAT-06: levar o CONTRATO v0.25 e o ROADMAP v0.30.

## Commit sugerido
`docs/feat-06 implemented (be) and t-18 closing tests`
