# 012 — T-10 — Core: agregado, eventos, portas e RNG com semente (FEAT-05)

- **ID:** T-10 · **Data:** 2026-11-14 · **Status:** aguardando revisão
- **Spec:** v0.16 · **Contrato:** sem mudança (a T-10 não toca HTTP) · **ROADMAP:** sem mudança

## Objetivo
Criar em `src/core/` a base que o agregado `Party` (T-11) vai usar: identidade, entidade, raiz de agregado com eventos em ordem, interface de evento, portas de relógio, ids e semente, e o RNG determinístico sfc32 (D-26; parte RNG de REQ-22).

## Decisões (D-32)
Todas do agente. A revisão (spec-reviewer) aprovou sem bloqueantes.
- **Semeadura do PractRand** (a=0, b=seed, c=0, contador=1, descarta 12 saídas). Prós: é a semeadura canônica do autor do sfc32. Contra: nenhum relevante; o save guarda o estado, não a semente, então trocar a semeadura depois só mudaria grupos novos.
- **Argumento inválido lança `RangeError`** em `fromSeed`, `fromState` e `nextInt`: é erro de programação, não ação do jogador. Exceção explícita à Constituição 5. Consequência: o mapper da T-12 valida o `rngState` com Zod antes de `fromState`.
- `AggregateRoot<Props, Event>` com a união de eventos do contexto como segundo parâmetro (tipagem estrita dos eventos).
- Valores de referência do sfc32 vieram de uma implementação independente em Go (uint32 nativo). Assim, os testes não validam o código TS contra ele mesmo.
- Fakes são fábricas que devolvem subclasses das portas: `fixedClock(iso)`, `sequentialIds(prefixo)`, `fixedSeed(n)`.

## Passos e comandos
1. Red: 5 arquivos de teste. `npx vitest run src/core` falhou porque os módulos não existiam.
2. Green: implementação e fakes; `npm run format`.
3. Revisão: spec-reviewer aprovou. Acrescentados os testes que ele sugeriu para `fromState` (fração, `NaN`, valor ≥ 2^32).

## Arquivos
- **Criados:**
  - `src/core/entities/{unique-entity-id,entity}/index.ts` + `index.test.ts`
  - `src/core/events/domain-event/index.ts`
  - `src/core/pattern/aggregate-root/index.ts` + `index.test.ts`
  - `src/core/ports/{clock,id-generator,seed-generator}/index.ts`, `src/core/ports/fakes.test.ts`
  - `src/core/rng/seeded-rng/index.ts` + `index.test.ts`
  - `test/fakes/{fixed-clock,sequential-ids,fixed-seed}.ts`
- **Alterados:** `docs/SPEC-BACKEND.md`, `docs/devlog/README.md`.

## Como verificar
No PowerShell, em `D:\Github\misadventure_backend`:
- `npx vitest run src/core`: todos passam.
- `node .claude/hooks/domain-guard.mjs --all`: `domain-guard: OK.`

## Problemas
- No Git Bash, **toda** a suíte unitária falhava com "Vitest failed to find the current suite", inclusive os testes antigos. Causa: o caminho `d:` minúsculo faz o Vitest carregar duas instâncias. Pelo PowerShell (`D:`) passa. Não é defeito do projeto; registrado em D-32.

## Checks
domain-guard OK; typecheck, lint e format:check limpos; unitários 124/124 (17 arquivos; 19 testes novos); build OK (`dist/` apagado). E2E não rodado: a tarefa não toca infra.

## Ponte com o frontend
Nenhuma.

## Commit sugerido
`feat/core aggregate and seeded rng (t-10)`
