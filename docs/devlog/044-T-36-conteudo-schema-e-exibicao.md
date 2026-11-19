# 044 — T-36 — Conteúdo, schema e exibição (FEAT-11)

- **Data:** 2026-11-18
- **Status:** aguardando revisão
- **Spec:** v0.53 (REQ-98, REQ-99, REQ-100, REQ-101, D-104) · **Contrato:** v0.51 `acordado` (sem mudança) · **Roadmap:** v0.53

## Objetivo
Levar o modelo de efeitos do domínio (T-35) para o disco e para as rotas: schemas Zod espelhando as quatro uniões, conversão de `content/` e da fixture (D-101), e e2e do catálogo e do editor.

## Decisões
- **Schemas só de estrutura e enums** (`effect-schemas.ts`, D-104): faixas/inteiros/regras entre campos ficam no domínio (`effect-rules`, D-103). Por isso `text` do efeito é `z.string()` sem `min(1)` — texto vazio tem que chegar ao domínio para virar `empty` (REQ-99). Parâmetros sempre presentes (CONTRATO FEAT-11).
- **Teste-espelho**: um exemplar válido por `kind` (172), com o conjunto de chaves comparado ao `EFFECT_KINDS` do domínio nos dois sentidos + contagem de opções do `discriminatedUnion` (46/11/56/59). Field name errado ou kind que falta falha o teste.
- **`base.misty-forest` reescrita (autor, REQ-100):** "-1 de Precisão enquanto estiver nesta zona" (`modifierFlat` accuracy −1, `whileInThisZone`, `negative`). A alternativa de variação genérica de texto foi rejeitada pelo autor.
- **Raridade/tags das 4 cartas novas** (fora do contrato, critério do backend): `strength-tonic` common, `lucky-coin` uncommon, `focus-amulet` uncommon, `guardian-armor` rare; tags `[]`.
- **Presenters sem mudança** (D-25): a carta sai como está; os tipos do domínio já espelham o contrato. REQ-101 é garantida pelo parse (Zod) + presenters passa-through.
- `equipment.json` da fixture reordenado por `id` (estava fora de ordem; D-47).
- `unrecognized_keys` do Zod v4: chaves em `issue.keys`, path no objeto (o `toContentIssues` já traduzia).

## Passos
1. Testes primeiro: `effect-schemas.test.ts` novo (186 testes) + expectativas atualizadas em `load-content` (fixture 20→24), `file-content-store` (ordem do `item.json`), `list-collections` e `get-editor-collection` (contagens/raridades) + cenários novos em `get-card` (REQ-101) e `create-card` (REQ-99 recusa + roundtrip). Vermelhos pelo motivo certo.
2. `effect-schemas.ts` (novo) e `card-schemas.ts` (`effects` das 5 cartas de `ruleText` para `effectSchema`/`zoneEffectSchema`).
3. Conversão: `base.healing-herb`, `base.misty-forest`, `fixture.healing-potion`, `fixture.pickaxe`/`fishing-rod` (`effects: []`), 4 cartas novas (D-101).
4. `/validar-cartas` via `npm run validate:content -- content` e `-- test/fixtures/content`.

## Arquivos
- Criados: `src/infra/content/effect-schemas.ts`, `src/infra/content/effect-schemas.test.ts`.
- Alterados: `src/infra/content/card-schemas.ts`, `src/infra/content/load-content.test.ts`, `src/infra/content/file-content-store.test.ts`, `src/infra/content/catalog-published-only.e2e-spec.ts`, `src/infra/http/controllers/get-card/index.controller.e2e-spec.ts`, `.../create-card/index.controller.e2e-spec.ts`, `.../list-collections/index.controller.e2e-spec.ts`, `.../list-collection-cards/index.controller.e2e-spec.ts`, `.../list-editor-collections/index.controller.e2e-spec.ts`, `.../get-editor-collection/index.controller.e2e-spec.ts`, `content/base/item.json`, `content/base/zone.json`, `test/fixtures/content/fixture/item.json`, `test/fixtures/content/fixture/equipment.json`, `docs/SPEC-BACKEND.md`.

## Como verificar
`npm run validate:content -- content` → "Conteúdo válido (content): 1 coleção(ões), 16 carta(s)."; `-- test/fixtures/content` → 24 cartas. `npm run test` → 1136 verdes. Com o Postgres no ar: `npm run test:e2e` (arquivos do catálogo e do editor).

## Problemas
- **e2e não executado na sessão:** Postgres fora do ar (ECONNREFUSED :5432); o Docker é manual (autor sobe). **Rodado pelo autor depois** (209 testes): revelou 3 specs com expectativas/dados da fixture antiga que o grep da sessão não pegou — `catalog-published-only` (montava `bosque.potion` em formato antigo), `list-collection-cards` (20 ids) e `list-editor-collections` (`publishedCount: 20`). Corrigidos os três; suíte e2e completa verde (45 arquivos, 209 testes). Lição: procurar também efeitos escritos como literal `{ text: ... }` em specs que montam conteúdo próprio, não só `effects:`.

## Checks (2026-11-18)
guarda ✅ · typecheck ✅ · lint ✅ · format ✅ · testes unitários 1136 ✅ (87 arquivos) · validate:content ✅ (content 16, fixture 24) · build ✅ (dist/ apagado) · e2e ✅ (45 arquivos, 209 testes, rodados pelo autor)

## Ponte com o frontend
Nenhuma nesta tarefa (FEAT-11 continua `acordado`; `implementado (BE)` só no fim da T-39).

## Commit sugerido
`feat/effects schemas, content conversion and fixture (t-36)`

<!-- tempo: a preencher pelo autor (Kimi Code não roda o hook de tempo) -->
