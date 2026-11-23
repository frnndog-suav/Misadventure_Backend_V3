# 071 — T-59 — Ativação ao salvar a build

- Data — 2026-11-23
- Status — concluída
- Spec — v0.69, REQ-134 e D-113
- Contrato — v0.76, FEAT-15 acordada (sem alteração nesta etapa)
- Horas — a preencher pelo autor

## Objetivo

Recalcular, ao salvar uma build válida (Ajustar deck e Usar cofre), a trava de cada classe e de cada especialização concedida, e escolher os modificadores base pela primeira classe **ativa** na ordem de aquisição (ou pelos padrões do snapshot se nenhuma estiver ativa).

## Decisões

Registradas como D-113 na spec:

- A trava da especialização (README 8.2) inclui a da classe: cada essencial exige o mínimo da classe (`lockOneEssential` ou `lockTwoEssentials`) mais `lockSpecializationReinforcement` só se estiver em `reinforcedAttributes`; cada adicional exige `lockSpecializationAdditional`. Vem de `isSpecializationActive`, ao lado de `isClassActive`.
- Não existe motor que aplique `effects` de classe ou especialização em runtime; "benefícios conforme a trava" fica sendo o `deckLockMet` da especialização, que a T-58 já projeta. Aplicar os efeitos é trabalho de outra tarefa.
- Modificadores: primeira classe ativa na ordem de aquisição; nenhuma ativa → `defaultModifiers`; se alguma classe do jogador não existe no catálogo, os modificadores atuais não mudam (comportamento anterior preservado).
- A chave `specializations` só é regravada quando o save já a tem; saves legados não ganham a chave ao salvar a build.
- Concessões novas continuam com trava falsa até esse próximo salvamento (T-58).

## Arquivos

- `src/domain/catalog/enterprise/class-lock/index.ts`: `isSpecializationActive`.
- `src/domain/campaign/enterprise/entities/party/index.ts`: `rebuildPlayerDeck` recalcula `specializations` e escolhe os modificadores pela primeira classe ativa. `adjustDeck` e `useVault` já passam por ele.
- `src/domain/catalog/enterprise/class-lock/index.test.ts`: bloco `isSpecializationActive` (6 casos).
- `src/infra/database/drizzle/mappers/zone-quest.test.ts`: bloco `T-59 — ativação ao salvar a build` (10 casos).

## Como verificar

```powershell
cd d:\Github\Misadventure_Backend_V3
npx vitest run src/infra/database/drizzle/mappers/zone-quest.test.ts src/domain/catalog/enterprise/class-lock
npm test
```

Sem serviços locais. Esperado: 1.349 testes aprovados. O Git Bash não executa o Vitest nesta máquina; use o PowerShell.

## Verificações

- Antes da implementação, os testes de trava da especialização falhavam por falta de `isSpecializationActive`, e os de integração falhavam com `deckLockMet: false` na especialização e com os padrões no lugar dos modificadores da segunda classe ativa.
- TypeScript, ESLint e Prettier nos arquivos alterados, guarda do domínio e `npm test` (98 arquivos, 1.349 testes) passaram.
- Revisão (spec-reviewer): aprovada sem bloqueantes. Depois dela entraram, sem fase red, o caso de classe e especialização ausentes do catálogo, a conferência dos modificadores no teste de ordem e a checagem de chave ausente (`in`) no save legado. O primeiro rascunho desse último passava `specializations: undefined` e criava a chave; corrigido no teste.
- Dois erros de teste corrigidos antes do red final: a projeção usa `classId` (não `playerClass`) e `editBuild` do cofre só enxerga build e cofre, não a pasta.

## Pendências

- E2E de controller não foi escrito (como nas T-56 a T-58); o recorte entra na T-60.
- Nenhum evento de domínio novo para a mudança de trava da especialização (D-113).

Commit sugerido — `feat/activate specializations on build save (t-59)`.
