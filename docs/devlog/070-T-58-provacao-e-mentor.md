# 070 — T-58 — Provação e mentor

- Data — 2026-11-23
- Status — concluída
- Spec — v0.68, REQ-133, REQ-132 e D-112
- Contrato — v0.76, FEAT-15 acordada (sem alteração nesta etapa)
- Horas — a preencher pelo autor

## Objetivo

Entregar `takeTrialQuest` e `trainWithMentor`, as missões genéricas abertas com contadores automáticos, a finalização com Pico e as concessões inativas (especialização ou classe), reaproveitando `finishQuest` e `abandonQuest`.

## Decisões

Registradas como D-112 na spec (o contrato é omisso nestes pontos):

- Ordem de recusa: zona, alvo (classe e especialização), `genericQuestAlreadyOpen`, `questLimitReached`, Pico mínimo ou pré-requisito de especialização do mentor, `noActionPoints`, `notEnoughGold`.
- Títulos fixos em pt-BR: "Missão de provação" e "Missão do mentor". O contrato exige `title`, mas não o texto.
- `questOrder` guarda os ids na ordem de aceitação para listar zona e genéricas juntas, como o contrato pede. É podado a cada ação de missão aceita.
- A missão genérica é uma união discriminada: a provação sempre tem `specializationId`; o mentor não tem.
- As metas (3/3 e 5/5) vêm da configuração do grupo na leitura, nunca do save.
- Mentor: custo `mentorBaseGoldCost × 2 ** (n - 1)` pago na aceitação, todos os PA restantes consumidos e ouro não devolvido no abandono. O Pico de conclusão (`genericQuestPeakGain`) é a decisão da T-57 aplicada às genéricas; o Vigor fica igual.

## Arquivos

- `src/domain/campaign/enterprise/zone-quests/`: tipos das ações genéricas, missão genérica aberta, especialização concedida, títulos e `orderedQuestIds`.
- `src/domain/campaign/enterprise/entities/party/` e `party-member/`: elegibilidade, aceitação, abandono e finalização das genéricas, contadores em `recordQuestOutcome`, escolhas em `questState`.
- `src/domain/campaign/enterprise/party-action/` e `available-actions/`: validação dos campos e ordem dos tipos (`takeTrialQuest` após `finishQuest`, `trainWithMentor` antes de `saveRespawnPoint`).
- `src/domain/campaign/application/use-cases/take-party-action/`: roteia as duas ações e entrega o catálogo de classes.
- `src/infra/http/presenters/party-presenter/` e seis controllers: recebem as classes publicadas e projetam `specializations`.
- `src/infra/database/drizzle/mappers/drizzle-party-mapper.ts`: persiste `openGenericQuests`, `questOrder` e `specializations`.
- `src/infra/database/drizzle/mappers/zone-quest.test.ts`: blocos `T-58 — provação e mentor` (20 casos) e `T-58 — provação e mentor: bordas` (7 casos).

## Como verificar

```bash
cd /d/Github/Misadventure_Backend_V3
npm test -- src/infra/database/drizzle/mappers/zone-quest.test.ts
npm test
```

Sem serviços locais. Esperado: 1.333 testes aprovados. Nesta máquina o Git Bash não executa o Vitest (falha ao coletar a suíte, inclusive no HEAD); o PowerShell executa normalmente.

## Verificações

- TypeScript, ESLint nos arquivos alterados e guarda do domínio passaram.
- Antes da implementação, os 20 casos novos falharam com `unknownAction` (e o de validação com o campo ausente).
- Revisão (spec-reviewer): o bloqueio de coleta era do Git Bash; no PowerShell a suíte passa. Os sete casos de borda que ela pediu foram acrescentados depois da implementação e passaram de primeira, sem fase red: vitória de pé, contagem fora de Urbana até a meta, zona Habitada, finalizar fora de zona, `noActionPoints` nos três caminhos, mentor com genérica aberta ou limite, e a ordem com dois motivos. Também saíram o id vazio, a chave `undefined` e o `questOrder` sem poda.
- Um caso ajustado depois: a expectativa de `questChoices` com a provação aberta ignorava que o quadro ainda oferece `takeQuest`.
- Nesta etapa o Prettier rodou por engano em pastas inteiras e reformatou `take-party-action/index.test.ts`; o arquivo foi restaurado com `git checkout`.

## Pendências

- E2E dos controllers (Supertest, banco isolado) não foi escrito: as T-56 e T-57 também ficaram só com unitários. Falta cobrir o recorte na T-60.
- A trava das concessões é recalculada na T-59; aqui nasce falsa.
- O contrato não fixa os títulos nem a ordem de recusa; ver D-112.

Commit sugerido — `feat/add trial and mentor quests (t-58)`.
