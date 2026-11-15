# 013 — T-11 — Domínio `campaign`

- **Data:** 2026-11-15
- **Status:** aguardando revisão
- **Spec:** v0.17 · **Contrato:** v0.15 (FEAT-05 `acordado`, sem mudança)

## Objetivo
Implementar o domínio da FEAT-05 (regras de REQ-16 a REQ-21, REQ-23 a REQ-25; REQ-22 no repositório em memória): agregado `Party`, entidade `PartyMember`, máquina de estados `idle ↔ inSession`, eventos, porta `PartiesRepository`, seis casos de uso e três erros.

## Decisões
- D-33 (spec): validação em `Party.create`; `null` → `notString`; tamanho em unidades UTF-16 após `trim`; ids só com dados válidos; semente sorteada antes da validação; `startSession` idempotente sem gravar; `AbandonParty` devolve o grupo para o despacho; `Party.restore` sem validação; repositório em memória com cópias.

## Passos e comandos
1. Testes primeiro (red): `npx vitest run src/domain/campaign` → 7 suítes falhando por módulo inexistente.
2. Implementação (green), `npm run format`, typecheck, lint, guarda.
3. Revisão do `spec-reviewer`: bloqueante — o repositório em memória devolvia a mesma referência, então o teste do REQ-22 era vazio. Corrigido: o repositório guarda e devolve cópias (`Party.restore`), lança em `create` duplicado e `save` inexistente; testes de criar/continuar/encerrar passaram a ler o gravado.

## Arquivos
Criados:
- `src/domain/campaign/enterprise/entities/party/index.ts` (+ `index.test.ts`)
- `src/domain/campaign/enterprise/entities/party-member/index.ts`
- `src/domain/campaign/enterprise/events/party-events/index.ts`
- `src/domain/campaign/application/repositories/parties-repository/index.ts`
- `src/domain/campaign/application/use-cases/{create-party,list-parties,get-party,start-session,end-session,abandon-party}/index.ts` (+ `index.test.ts`)
- `src/domain/campaign/application/use-cases/_errors/{party-invalid,party-not-found,party-session-not-active}-error.ts`
- `test/repositories/in-memory-parties-repository.ts`, `test/factories/make-party/index.ts`

Alterados: `docs/SPEC-BACKEND.md` (T-11 `[x]`, D-33, v0.17), este índice.

## Como verificar
Sem rota nesta tarefa (as rotas são da T-13).
```
npx vitest run src/domain/campaign      # 7 arquivos, 46 testes
node .claude/hooks/domain-guard.mjs --all
```

## Problemas
- A guarda bloqueia `new Date(...)` também em testes do domínio e em cópias defensivas: datas vêm de `fixedClock(...).now()` e os getters devolvem a própria `Date`.
- `vitest.config.ts` só inclui `src/**/*.test.ts`: o teste do REQ-22 foi para `get-party/index.test.ts`.

## Checks
- Unitários: 24 arquivos, 170 testes verdes. `tsc --noEmit`, `eslint .`, `nest build` e `domain-guard --all` limpos.

## Ponte com o frontend
Nenhuma. Ponto para levar quando houver mudança de contrato: os limites 40/24 contam unidades UTF-16 (D-33).

## Commit sugerido
`feat/campaign domain and party aggregate (t-11)`
