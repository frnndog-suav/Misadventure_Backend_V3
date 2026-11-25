# 091 — T-74 — Conteúdo da montaria, editor e laboratório

- Data — 2026-11-25
- Status — aguardando revisão
- Spec — v0.94, T-74, REQ-155, REQ-156, D-142, D-148, D-149
- Contrato — v0.90, FEAT-18 `acordado` (sem mudança)
- Horas — registro automático

## Objetivo

Primeira tarefa da FEAT-18: o tipo de carta `mount`, o Estábulo (`market.mounts`) na zona, a leitura do conteúdo legado, o editor com proteção de referência, as 7 chaves do laboratório e o conteúdo de teste (`fixture.plow-horse`, `fixture.war-pony`, `fixture.old-mine` Rural com Estábulo). O estado do jogador com montaria, a compra/venda e o movimento ficam nas T-75 a T-79.

## Decisões (D-149)

- Motivos de integridade: `mountTypesInvalid` (vazio ou repetido, uma mensagem só), `creatureRequired`, `stableNotAllowed` (caminho `market.mounts`), `notAMount` e `duplicateMount` (`market.mounts.i`); id inexistente reusa `unknownCard`. O schema aceita `mountTypes: []` e `creature: ""` para a integridade devolver o texto do contrato.
- Efeitos e habilidades da montaria passam por `checkEffects` e `checkAbilities`, como no equipamento (`consumeSelf` continua só em item).
- Leitura legada: `market.mounts` ausente → `[]` pelo `default` do Zod.
- Proteção: `ContentReferencedError('stable')` ("Esta montaria está no Estábulo de uma zona.") ao excluir, renomear ou trocar o tipo da carta, e ao excluir ou substituir (import `replace`) a coleção citada por zona de outra coleção. `CONTENT_IN_USE` segue o mecanismo genérico dos saves.
- Booster e singles já ignoram montaria (`marketCandidatesOf` só aceita atributo, equipamento e item); há um teste que confirma isso.
- Laboratório: `MOUNT_DEFAULTS`/`MOUNT_LIMITS` em `defaults.ts`; snapshots antigos ganham os padrões pelo mapper.
- Efeito colateral previsto no contrato: a Mina Velha deixa de ser `forest`. Os preparadores `test/prepare-feat-14.cjs` e `test/prepare-feat-15.cjs` passam a usar `rural` nos decks de evento e nas etapas por tipo de zona. Os e2e de "zona sem mercado" (`REQ-57` endTurn e `REQ-140` fora do Porto) escolhem um destino diferente da Mina Velha. Nenhum cenário do contrato mudou de resultado.

## Arquivos

- Domínio: `value-objects/card` (`TMountCard`, `CARD_TYPES`, `market.mounts`), `catalog-integrity`, `effect-rules` (`TEffectCard`), `editor-collection` (raridade da montaria), `card-validation` (`isCitedInStable`), casos de uso `delete-card`, `delete-collection`, `import-collection`, `replace-card`, `_errors/content-referenced-error`; `lab/.../game-config/defaults.ts`.
- Infra: `content/card-schemas.ts`, `content/content-messages.ts`, `drizzle-party-mapper.ts`.
- Conteúdo: `test/fixtures/content/fixture/mount.json` (novo), `zone.json`.
- Testes novos: `src/infra/content/mount-content.test.ts` (9), `lab-config-presenter/mount-config.test.ts` (2), `drizzle-party-mapper.test.ts` (+1), e2e `replace-card/index.mount.controller.e2e-spec.ts` (4) e `update-lab-config/index.mount.controller.e2e-spec.ts` (2). Factory `makeMountCard`.
- Testes ajustados (contagens e `mounts: []`): unitários de mercado/integridade/coleções, e2e de catálogo, editor, efeitos, mercado e ações.

## Como verificar

```
cd /d/Github/Misadventure_Backend_V3
npm test
npm run test:e2e        # com o Postgres no ar
npm run validate:content -- test/fixtures/content
```

## Checks (2026-11-25)

- `domain-guard --all` OK; `typecheck` OK; `format:check` OK; `build` OK.
- `npm test`: 125 arquivos, 1670 testes passando. `npm run test:e2e`: 58 arquivos, 297 testes passando.
- `validate:content`: fixture com 30 cartas válida; `content` com 16 cartas válida.
- `lint`: 73 erros, todos nos `test/prepare-*.cjs` e já existentes antes da tarefa (mesma contagem sem as mudanças).

## Ponte com o frontend

Nenhuma ação agora: o contrato v0.90 já tem tudo. O aviso vai na `implementado (BE)` da FEAT-18 (T-80).

## Commit sugerido

`feat/add mount content, stable editor and lab settings (t-74)`
