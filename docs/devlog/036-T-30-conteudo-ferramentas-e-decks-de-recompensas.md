# 036 — T-30 — Conteúdo: ferramentas, coletáveis e decks de recompensas (FEAT-32)

- **ID:** T-30 · **Data:** 2026-11-18 · **Status:** concluída
- **Spec:** v0.44 · **Contrato:** v0.46 (FEAT-32 `acordado`) · **Roadmap:** sem mudança

## Objetivo
REQ-81 e REQ-82: campos novos nas cartas (`ItemCard.toolKind`, `scavengeZoneTypes`, `scavengeTool`; `EquipmentCard.scavengeTool`; `DimensionCard.rewardDecks`), validados no boot e no editor; `CONTENT_REFERENCED` por deck de recompensas; `fixture` e `content/base` atualizados.

## Decisões
- **D-91 (nova):** a Carta de Dimensão pode citar cartas de qualquer coleção.
  - `checkCatalogIntegrity` ganhou `referenceCards`, usadas só para achar as citadas.
  - A exigência de carta `published` vale ao publicar, ao editar uma publicada e no import. No boot não vale, como no deck pré-pronto.
  - `CONTENT_REFERENCED` ganhou a mensagem do deck de recompensas (`ContentReferencedError('rewardDeck')`).
- Motivos novos com texto pt-BR (D-49): `toolKindOnlyForTools`, `scavengeZoneTypesRequired`, `scavengeZoneTypesNotAllowed`, `notKebabCase`, `notARewardCard`, `rewardDeckCardNotPublished`.

## Passos e comandos
1. Tipos (`value-objects/card`), schema Zod (`card-schemas.ts`) e factory `make-card`.
2. Testes REQ-81/82 em `catalog-integrity/index.test.ts` (red confirmado pelo autor: 9 falhas pelo motivo certo), depois a implementação em `catalog-integrity`.
3. `card-validation`: `validateCandidate(..., referenceCards)`, `rewardDeckPublicationIssues`, `isCitedInRewardDeck`. `_shared/all-cards.ts` (`loadAllCards`, `cardsOutside`, `statusById`).
4. Casos de uso: `create-card`, `publish-card`, `replace-card`, `delete-card`, `delete-collection`, `import-collection`. Teste unitário `_shared/req-82.test.ts`.
5. Conteúdo: `fixture` com `fixture.fishing-rod`, `fixture.silver-fish`, `fixture.iron-ore`, `scavenge` em Porto Cinzento, `rewardDecks` na `fixture.test-dimension` (20 cartas); `content/base` com os campos novos vazios. `npm run validate:content -- test/fixtures/content` e `-- content`.
6. E2E novo `create-card/index.scavenge.controller.e2e-spec.ts`; antigos ajustados à fixture nova e ao `CardInput` com os campos obrigatórios (contagens, lista do catálogo, `get-card`, `create-card`, `catalog-published-only`, `file-content-store`).

## Problemas
- Neste ambiente o Vitest falha em todo arquivo com `Cannot read properties of undefined (reading 'config')`, inclusive sem as mudanças. No terminal do autor roda normal. Os testes desta tarefa foram rodados pelo autor.
- Dois testes de `file-content-store` apagavam `fixture.healing-potion` direto no store; agora ela é citada em `rewardDecks`, e o boot acusaria "Carta inexistente." (correto). Passaram a apagar `fixture.pickaxe`.

## Checks
- Agente: `domain-guard --all` OK, `typecheck` sem erros, `lint` e `format:check` limpos.
- Autor: `npm test` e `npm run test:e2e` inteiros verdes.

## Ponte com o frontend
Nada a levar agora: o contrato v0.46 já tem os campos. O aviso vem quando a FEAT-32 ficar `implementado (BE)` (fim da T-33).

## Commit sugerido
`feat/feat-32 content tools and reward decks (t-30, spec v0.44)`
