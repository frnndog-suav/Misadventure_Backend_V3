# 084 — T-68 — Estado do equipamento e save v10

- Data — 2026-11-24
- Status — aguardando revisão
- Spec — v0.84 (REQ-147, REQ-148, D-131; nova D-137)
- Contrato — v0.85, FEAT-17 `acordado` (sem mudança)

## Objetivo

Cada cópia de equipamento guarda seu estado (refino, encantamentos, marcas de reparo, quebrado). O refino e os encantamentos ligados passam a contar nos modificadores efetivos e no combate. O presenter mostra esse estado e o save passa para a v10. Fora do escopo: as ações do ferreiro e da Oficina (T-69 a T-71) e a venda (T-72).

## Fluxo

1. Testes primeiro:
   - `equipment-state/index.test.ts`
   - casos REQ-148 em `effective-modifiers`
   - bônus de elemento em `combat.test.ts`
   - `party/equipment-state.test.ts` (equipar, desequipar e cofre)
   - mapper v10
   - `party-presenter/equipment-state.test.ts`
2. Implementação na sessão principal.
3. Revisão pelo `spec-reviewer`: aprovado, sem bloqueantes. Dois ajustes aplicados:
   - `failedMinimums` agora exige `refineBonusPercent`.
   - D-137 (h): a venda e os movimentos ainda inexistentes (oferecer, abdicar).

## Decisões

- D-137 (a) a (h): ver a spec. A limitação conhecida (g): `quantityOf` não aplica o refino.

## Arquivos

- **Domínio:**
  - novo: `equipment-state/index.ts`
  - alterados: `effective-modifiers`, `inventory`, `vault`, `party-member`, `party/index.ts`, `combat/index.ts`, `combat/abilities.ts`, `random-event`
- **Infra:**
  - `drizzle-party-mapper.ts` (v10)
  - `card-schemas.ts` (export de `blacksmithEnchantment`)
  - `party-presenter/index.ts`
- **e2e:** as versões esperadas do save passaram de 9 para 10; `equipmentState` e `equipmentStates` nas fixtures de prepare e create-party.

## Problemas

- No Git Bash o Vitest falha (`reading 'config'`, módulo duplicado pelo caminho `/d/`). No PowerShell, funciona.

## Checks

- typecheck, lint (só os erros antigos de `test/prepare-feat-13.cjs`), format e build: ok.
- `npm test`: 1588 testes passando.
- e2e: pendentes, precisam do Docker.

## Commit sugerido

`feat/add equipment state and save v10 (t-68)`
