# 076 — T-61 — Conteúdo, editor e laboratório do mercado

- Data — 2026-11-23
- Status — aguardando revisão
- Spec — v0.75 (REQ-136, REQ-137, D-114, D-115, D-121; novas D-123 e D-124)
- Contrato — v0.80, FEAT-16 `acordado` (sem mudança)
- Horas — 0,75 (registro automático)

## Objetivo

Primeira tarefa da FEAT-16. Entrega os campos de mercado nas cartas, a validação desses campos no editor, no import e no boot, a proteção das cartas citadas no estoque e as 37 chaves do laboratório. Não entram aqui o estado dos mercados, nem `visitMarket` e `openBooster`, que são das T-62 a T-65.

## Fluxo e agentes

1. Os testes vieram primeiro. Os unitários foram escritos na sessão principal. Os e2e ficaram com o agente `test-writer`. A fase red teve 23 falhas, todas por campo ou regra ainda ausente.
2. O domínio ficou com o agente `domain-dev` e a infra com o `infra-dev`.
3. A revisão do agente `spec-reviewer` aprovou, sem bloqueantes. Os dois ajustes que ela pediu entraram nos testes: o REQ nos nomes dos `it` de `market-content.test.ts` e testes unitários do VO `GameConfig` para `sumMismatch` e `minAboveMax`.
4. O autor pediu que `AGENTS.md` seja ignorado, porque é do Codex. A instrução está registrada na memória do Claude.

## Decisões

- **D-123:** excluir uma coleção citada por `boosterCollectionId` de outra coleção não é recusado. Fica uma pendência de contrato antes da T-66.
- **D-124:** publicar uma zona não exige que os itens de `market.stock` estejam publicados.
- **D-114 (nota):** o motivo `priceMultiplierInvalid` vale para atributo, equipamento e item. No equipamento, ele substitui o `outOfRange`. A conversão para centésimos fica para a T-63.
- **`CONTENT_IN_USE` de pool e vitrine:** passou para a T-62, porque o save ainda não tem estado de mercado.
- **Motivos novos da integridade:** `priceMultiplierInvalid`, `stockPriceNotAllowed`, `stockQuantityRequiresStockPrice`, `boosterCollectionRequired`, `boosterCollectionNotAllowed`, `marketMismatch`, `stockItemWithoutPrice` e `duplicateStockItem`. Os textos pt-BR são os do contrato.
- **Caminhos:** os problemas do estoque usam o caminho `market.stock.<i>`. Cada posição tem um único problema.
- **Coleção do booster:** no editor, é conferida contra todas as coleções, pelo parâmetro `referenceCollectionIds`.

## Arquivos

- **Domínio:**
  - `src/domain/catalog/enterprise/value-objects/card/index.ts`: os campos novos.
  - `catalog-integrity/index.ts`: as regras do REQ-136.
  - `card-validation/index.ts`: `referenceCollectionIds` e `isCitedInMarketStock`.
  - `_errors/content-referenced-error.ts`: a referência `marketStock`.
  - Casos de uso `create-card`, `replace-card`, `publish-card`, `delete-card`, `delete-collection` e `import-collection`.
  - `lab/.../game-config/{defaults,index}.ts`: `MARKET_DEFAULTS` e `MARKET_LIMITS`, `sumMismatch` e o `minAboveMax` do fator.
- **Infra:**
  - `src/infra/content/card-schemas.ts`: os campos novos, com os padrões legados.
  - `src/infra/content/content-messages.ts`: as mensagens.
  - `drizzle-party-mapper.ts`: chaves do mercado opcionais no snapshot, com padrões.
- **Fixture (`test/fixtures/content/fixture/`):** feita como o contrato pede.
  - Porto Cinzento: ganhou `visitMarket` e `market`.
  - Cartas que já existiam: `stockPrice` na poção e na vara de pesca, `priceMultiplier` 1.2 na espada curta.
  - Cartas novas: `fixture.arrows` e `fixture.booster`.
  - Com isso, a fixture tem 26 cartas.
- **Documentação:**
  - `docs/EFEITOS-CATALOGO.md`: `marketShowcaseModifier` passou a "a definir" (D-121).
  - `docs/SPEC-BACKEND.md`: v0.75.
- **Testes novos:**
  - `src/infra/content/market-content.test.ts`
  - `src/infra/http/presenters/lab-config-presenter/market-config.test.ts`
  - o bloco REQ-136 em `catalog-integrity/index.test.ts`
  - REQ-137 em `drizzle-party-mapper.test.ts` e em `game-config/index.test.ts`
  - e2e `replace-card/index.market.controller.e2e-spec.ts` e `update-lab-config/index.market.controller.e2e-spec.ts`
- **Expectativas ajustadas pela fixture ou pelos padrões do contrato:**
  - testes unitários: `file-content-store.test.ts` e `load-content.test.ts`;
  - e2e: `get-card`, `list-collection-cards`, `list-collections`, `get-editor-collection`, `list-editor-collections`, `get-editor-card`, `duplicate-card`, `export-collection`, `create-card` (as duas variantes) e `effects`, que passou de 24 para 26 cartas.
  - O `test/factories/remove-post-v6-config.ts` passou a remover também as chaves do mercado.
  - `catalog-published-only.e2e-spec.ts`: o teste esperava 7 tipos em `cardCounts`, mas são 8 desde a T-55. Essa falha já existia antes da T-61 e foi corrigida aqui.

## Como verificar

Os testes unitários dispensam banco. Os e2e precisam do Postgres. Rode no Git Bash, num terminal sem `CONTENT_DIR` exportado:

```bash
cd /d/Github/Misadventure_Backend_V3
unset CONTENT_DIR
npm test
docker compose up -d postgres
npm run test:e2e
```

Resultado esperado: os testes unitários dão 100 arquivos e 1374 testes verdes. Os e2e dão 51 arquivos e 256 testes verdes.

## Problemas encontrados

- **`describe` quebrado no Bash do agente.** Dentro do shell Bash do agente, o Vitest quebrava em qualquer `describe` com "reading 'config'". Pelo PowerShell funciona normalmente. O problema é só do ambiente do agente e não afeta o terminal do autor.
- **`CONTENT_DIR` herdado da T-60.** O terminal do autor ainda tinha `CONTENT_DIR` exportado da validação da T-60, apontando para um catálogo temporário. Como `test/setup-e2e.ts` usa `??=`, os e2e leram esse catálogo e deram 10 falhas falsas. Para evitar, rode `unset CONTENT_DIR` antes de `npm run test:e2e`.
- **Lint fora do escopo.** `npm run lint` acusa 73 erros, todos em `test/prepare-feat-13.cjs` e `test/prepare-feat-14.cjs`, que já vieram assim do commit b68db39 e ficaram fora do escopo. O lint rodado em `src` e `test/factories` sai limpo.

## Checks

- Guarda do domínio: OK.
- Typecheck: OK.
- Lint em `src` e `test/factories`: OK.
- Formatação: OK.
- Build: OK.
- Testes unitários: 1374 de 1374 passando.
- E2e: confirmados pelo autor. Na rodada completa passaram 254 de 256. Os 2 restantes foram corrigidos e passaram numa segunda rodada só desses dois arquivos.

## Ponte com o frontend

Nenhum aviso nesta etapa. A FEAT-16 só fica `implementado (BE)` no fim da T-66.

## Retomada

A próxima etapa é a T-62: estado dos mercados e save, incluindo `CONTENT_IN_USE` para cartas no pool e na vitrine. Atenção: a T-62 fala em "save v9", mas o `SCHEMA_VERSION` já está em 9 desde a T-55. Confirmar a versão do save antes de começar.

Commit sugerido — `feat/add market content, editor and lab settings (t-61)`
