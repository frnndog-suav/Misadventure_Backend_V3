# 005 — T-04 — Domínio `GameConfig` (laboratório)

- **ID:** T-04 (FEAT-03) · **Data:** 2026-11-14 · **Status:** aguardando revisão
- **Spec:** v0.7 · **Contrato:** v0.7 (FEAT-03 `acordado`) · **Roadmap:** v0.9

## Objetivo
Criar o primeiro domínio: o value object `GameConfig`, que guarda os valores ajustáveis do Apêndice A, com padrões e limites; a porta `GameConfigRepository`; os casos de uso Get, Update e Reset; e o erro `LabConfigInvalidError`. Cobre REQ-09 e as regras de REQ-04 a REQ-07. A parte HTTP fica na T-06; a persistência, na T-05.

## Decisões
- **D-11 (ajustado):** a porta é assíncrona (`get(): Promise<GameConfig | null>`, `save`, `delete`). O `delete()` serve ao reset, que apaga a linha (D-13).
- **D-15 (novo):** toda a validação de REQ-06 fica em `GameConfig.applyPatch(unknown)`, inclusive `invalidBody`. A ordem de `details.fields` segue a ordem das chaves no pedido, com `minAboveMax` por último, nas duas chaves e calculado sobre a config atual. Qualquer valor que não seja um `number` inteiro gera `notInteger`.
- Os padrões e limites ficam num único arquivo, `defaults.ts` (D-11/D-12), exportado para o presenter da T-06.
- A mescla do valor salvo sobre os padrões (REQ-09) e a proteção contra valor salvo fora dos limites passam para o mapper da T-05. `GameConfig.create` não revalida, e a linha da T-05 na spec já registra isso.
- Core mínimo, criado só com o que o domínio usa: `Either` (`left`/`right`), `DomainError` (`code`, `message`, `details`; não estende `Error`, porque nunca é lançado) e `ValueObject<Props>` (props congeladas).
- O import de `test/repositories` nos testes usa caminho relativo de 6 níveis. Não criei um alias `@test/*`, para não mexer em configuração fora do escopo.

## Passos e comandos
1. Testes primeiro (red): `npx vitest run src/domain` → 4 arquivos falham por módulo inexistente.
2. Implementação (green), depois `npm run format`.
3. `npx vitest related --run <arquivos do domínio>`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `node .claude/hooks/domain-guard.mjs --all`, `npm run build`.
4. Revisão pelo `spec-reviewer`.

## Arquivos
**Criados:**
- `src/core/error/either.ts`
- `src/core/error/domain-error.ts`
- `src/core/value-object/index.ts`
- `src/domain/lab/enterprise/value-objects/game-config/{defaults.ts,index.ts,index.test.ts}`
- `src/domain/lab/application/repositories/game-config-repository/index.ts`
- `src/domain/lab/application/use-cases/{get,update,reset}-game-config/{index.ts,index.test.ts}`
- `src/domain/lab/application/use-cases/_errors/lab-config-invalid-error.ts`
- `test/repositories/in-memory-game-config-repository.ts`

**Alterados:**
- `docs/SPEC-BACKEND.md` (v0.7)
- `docs/devlog/README.md`
- `docs/devlog/tempo.html`

## Como verificar
- `npx vitest run src/domain` → 4 arquivos e 30 testes passam.
- `node .claude/hooks/domain-guard.mjs --all` → `domain-guard: OK.`

Não há endpoint nesta tarefa; as rotas chegam na T-06.

## Problemas
- O alias `@/` não cobre `test/`, por isso os testes de caso de uso usam import relativo.
- O `spec-reviewer` relatou `TypeError ... reading 'config'` em todos os testes. A falha não se repetiu: duas execuções, antes e depois da revisão, deram 37/37 verdes. A suspeita é que o revisor rodou os testes enquanto os arquivos ainda eram escritos.

## Checks
- `npm test`: 5 arquivos, 37 testes, todos verdes (30 novos).
- `typecheck`, `lint`, `format:check`, `domain-guard --all` e `build`: OK.

## Ponte com o frontend
Nenhum aviso. O contrato não mudou.

## Commit sugerido
`feat/game config domain (t-04)`
