# 083 — T-67 — Conteúdo, editor e laboratório do ferreiro

- Data — 2026-11-24
- Status — aguardando revisão
- Spec — v0.83 (REQ-145, REQ-146, D-129, D-130; novas D-135 e D-136)
- Contrato — v0.85, FEAT-17 `acordado` (sem mudança)
- Horas — 3,25 (registro automático)

## Objetivo

Primeira tarefa da FEAT-17. Entrega as formas novas de `refinement`, `enchantment`, `recipe` e `blacksmith` nas cartas, a validação no editor, no import e no boot, a leitura do conteúdo legado, a proteção das cartas citadas e as 19 chaves do laboratório. Não entram estado do equipamento, `visitBlacksmith` nem `artificerWorkshop` (T-68 a T-71).

## Fluxo

1. Testes primeiro, na sessão principal: `blacksmith.test.ts` (integridade), `blacksmith-content.test.ts` (editor, legado, referências), `blacksmith-config.test.ts` (laboratório), dois e2e e o teste do mapper. Red: 14 falhas na integridade e 14 no editor, todas por regra ou campo ausente.
2. Implementação na sessão principal (sem `domain-dev`/`infra-dev`).
3. Revisão pelo agente `spec-reviewer`: dois bloqueantes (zona legada com `visitBlacksmith` virava `null`; `[]` derrubava o boot) e dois ajustes (regras de habilidade no encantamento; import que tira um item de `material`). Todos corrigidos, com testes.

## Decisões

- **D-135 (escolha do autor após a revisão):** `refinement.materials: []` só bloqueia publicar (publicar, importar como publicada, substituir publicada); boot, import e rascunho aceitam. Zona legada com `visitBlacksmith` sem o campo `blacksmith` é lida com lista vazia (`withLegacyBlacksmith` no parser e no `loadContent`).
- **D-136:** carta usada como material, receita ou encantamento dá `CONTENT_REFERENCED` (referência `blacksmith`) ao excluir, renomear, trocar a coleção, deixar de ser `material` ou deixar de ser equipamento. Equipamento, item e zona passam a ver as cartas de outras coleções (`citesOtherCards`).
- `enemyOnlyAbility`: efeito com `breakEquipment`, ou habilidade executável com esse efeito. Habilidade só com nome e texto não é detectável.
- O default de `makeEquipmentCard` passou a `refinement: null` (o antigo citava um material inexistente).

## Arquivos

- **Domínio:** `value-objects/card/index.ts` (tipos novos), `enterprise/blacksmith-content/index.ts` (novo), `catalog-integrity/index.ts`, `card-validation/index.ts` (`citesOtherCards`, `isCitedInBlacksmith`), use cases `create-card`, `replace-card`, `publish-card`, `delete-card`, `delete-collection`, `import-collection`, `_errors/content-referenced-error.ts`, `game-config/defaults.ts` (`BLACKSMITH_DEFAULTS` e `BLACKSMITH_LIMITS`).
- **Infra:** `content/card-schemas.ts` (formas novas e legado), `content/content-messages.ts`, `drizzle-party-mapper.ts` (chaves opcionais no snapshot).
- **Fixture** (`test/fixtures/content/fixture/`): `short-sword` e `blade-of-dusk` com materiais, `ember-shard`, `sword-blueprint`, `gray-harbor` com `visitBlacksmith` e `blacksmith`. Agora 28 cartas.
- **Testes:** os novos acima e ajustes de contagem em `file-content-store`, `load-content`, `get-card`, `create-card`, `list-collection-cards`, `list-collections`, `get-editor-collection`, `list-editor-collections` e `effects`.
- **Docs:** `docs/SPEC-BACKEND.md` v0.83.

## Como verificar

```bash
cd /d/Github/Misadventure_Backend_V3
unset CONTENT_DIR
npm test
npm run test:e2e   # com o Postgres no ar (docker compose up -d postgres)
npm run validate:content -- content/base
```

Esperado: 115 arquivos e 1557 testes unitários; 54 arquivos e 278 e2e; `Conteúdo válido (content/base): 1 coleção(ões), 16 carta(s).`

## Problemas

- O Bash do agente quebra o Vitest (`reading 'config'`); os testes rodaram pelo PowerShell.

## Checks

Guarda do domínio OK; typecheck OK; ESLint em `src` e `test/factories` limpo; `format:check` OK; build OK; unitários 1557/1557; e2e 278/278.

## Ponte com o frontend

Nenhum aviso nesta etapa; a FEAT-17 só fica `implementado (BE)` na T-73.

## Retomada

Próxima: T-68 (estado do equipamento e save v10).

Commit sugerido — `feat/add blacksmith content, editor and lab settings (t-67)`
