# 034 — T-28 — Domínio de inventário, equipar e bolsa (FEAT-10)

- **ID:** T-28 · **Data:** 2026-11-17 · **Status:** aguardando revisão
- **Spec:** v0.40 · **Contrato:** v0.40 (FEAT-10 `acordado`) · **Roadmap:** v0.47

## Objetivo
Levar ao domínio as REQ-69 a REQ-78 (a REQ-79 vale em memória e no mapper):
- `inventoryCapacity` e `purseCapacity` na `GameConfig`;
- inventário e equipamentos no `PlayerState`;
- empilhamento e modificadores efetivos;
- Preparar (`equip` e `unequip`);
- bolsa e doação do laboratório;
- conteúdo em uso.

## Decisões
A D-80 (nova) registra:
- **(a)** A assinatura final é `Party.grant(memberId, grant, at)`, com `grant` já resolvido no catálogo.
- **(b)** `availableActions` ganha o parâmetro `equipmentCardIds`, porque o inventário só guarda o `cardId` (D-75).
- **(c)** `inventoryFull` no `equip` segue a regra geral (J1). A REQ-74 foi reescrita assim.
- **(d)** Com várias cópias de uma carta, sai o primeiro slot.
- **(e)** Carta ausente do catálogo:
  - a carta a equipar dá `notEquipment`;
  - uma arma em uso ausente não bloqueia escudo.
- **(f)** Nomes do caso de uso da doação, dos erros e do evento.

**Adiantado da T-29** (o código não compilava sem isso):
- mapper Drizzle v5, que lê v4, v3 e v2 com o inventário vazio, nada equipado e as chaves novas nos padrões;
- testes do mapper alinhados (saves antigos sem os campos da FEAT-10) e casos REQ-79 e v4 → v5.

O presenter passa `new Set()` para `availableActions` até a T-29.

**Ponto aberto** (revisão): ao ler um save antigo, `gold` não é limitado a `purseCapacity`. Com `initialGold` acima de 300, a invariante de REQ-70 não vale nesse save. O autor decide.

## Passos e comandos
1. Testes primeiro. `npx vitest run src/domain` (PowerShell) deu 162 falhas e 4 suítes sem módulo, todas pelo motivo certo.
2. Código novo em `src/domain/campaign/enterprise/`:
   - `inventory`;
   - `effective-modifiers`;
   - `lab-grant` (parser).
3. Código alterado:
   - `party-member` (`emptyEquipment`);
   - `starting-player`;
   - `party-action` (`prepare`);
   - `available-actions`;
   - `party-events` (`EquipmentEquipped`, `EquipmentUnequipped`, `LabGrantApplied`);
   - `Party.prepare`, `Party.grant` e `contentInUse`;
   - erros `MemberNotFoundError`, `LabGrantInvalidError` e `LabGrantNoSpaceError`;
   - casos de uso `GrantToMemberUseCase` e `TakePartyActionUseCase` (`prepare`).
4. Revisão do spec-reviewer: aprovado. Ajustes feitos:
   - 2 testes de J1 (o cenário do contrato e a troca com o inventário cheio);
   - spec (REQ-74 e linha da T-29).
5. Checks: `npm run format`, `npx tsc --noEmit -p tsconfig.json`, `npm run lint`, `node .claude/hooks/domain-guard.mjs --all`, `npx vitest run`.

## Problemas
- O Vitest só roda pelo PowerShell (devlog 032). O revisor rodou no Git Bash e não conseguiu executar.
- `.vitest/json/output.json` foi restaurado com `git checkout`.
- E2E não rodados: precisam do Docker e são escopo da T-29. Espera-se falha em `get-lab-config` e `update-lab-config`, que listam a config exata, até a T-29.

## Arquivos
**Novos:**
- `src/domain/campaign/enterprise/{inventory,effective-modifiers,lab-grant}/*`
- `src/domain/campaign/enterprise/entities/party/{prepare,grant}.test.ts`
- `src/domain/campaign/application/use-cases/grant-to-member/*`
- `src/domain/campaign/application/use-cases/take-party-action/prepare.test.ts`
- `src/domain/campaign/application/use-cases/_errors/{member-not-found,lab-grant-invalid,lab-grant-no-space}-error.ts`

**Alterados:**
- domínio: os de "Passos", item 3, e a config (`defaults.ts`);
- infra: `drizzle-party-mapper{.ts,.test.ts}` e `party-presenter`;
- testes: `make-party`, `parties-repository/index.test.ts`;
- docs: spec, devlog e `tempo.html`.

## Como verificar
`npx vitest run` (PowerShell): 77 arquivos e 766 testes.

## Checks
format, typecheck, lint e domain-guard limpos. Testes unitários verdes.

## Ponte com o frontend
Nenhuma nesta etapa. O aviso vem na T-29.

## Commit sugerido
`feat/feat-10 inventory domain`
