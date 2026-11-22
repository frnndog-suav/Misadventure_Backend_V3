# 069 — T-57 — Tentativas, contadores e entrega de zona

- Data — 2026-11-22
- Status — concluída
- Spec — v0.66, REQ-132 e D-111
- Contrato — v0.76, FEAT-15 acordada após aceite da v0.75 pelo frontend
- Horas — a preencher pelo autor

## Cobertura inicial

O frontend aceitou os ajustes de Pico e a regra de conclusão da FEAT-15. Em `src/infra/database/drizzle/mappers/zone-quest.test.ts`, dois cenários exercitam a entrega final com o inventário cheio. O primeiro usa o ganho de zona padrão, de 3. O segundo usa um passo explícito de 7 após a oferta da carta. A conclusão e o Pico devem aparecer no primeiro `finishQuest`, com Vigor 4, e persistir na leitura do save, na reabertura e após `resolveReward`. Repetir `finishQuest` após a entrega deve devolver `questNotOpen`.

## Implementação da entrega final

- `src/domain/campaign/enterprise/entities/party/`, `party-member/` e `rewards/` registram a conclusão por jogador e dimensão no primeiro `finishQuest`, aplicam o Pico e reutilizam a entrega pendente com fonte `quest`. O ganho explícito substitui o ajuste e é aplicado antes de qualquer pausa. O Vigor permanece igual.
- `take-party-action/index.ts` carrega os itens da entrega pelos decks e referências. O mapper Drizzle e o repositório de teste preservam os passos e o cursor da entrega, inclusive quando a carta do catálogo mudar.
- `game-config/defaults.ts` acrescenta os dois ajustes de Pico ao laboratório e aos snapshots. O mapper usa os padrões quando as chaves estão ausentes. Os testes exercitam a ausência no save legado, o zero explícito, a substituição do valor 9 por um ganho de 7 e a aplicação do ouro restante depois da escolha.

## Como verificar

```bash
cd /d/Github/Misadventure_Backend_V3
npm test -- --reporter=dot
```

Sem serviços locais. A suíte deve passar. Nos três cenários de entrega pendente, o Pico esperado após a conclusão é 13, 17 ou 10, conforme o snapshot e a recompensa. O ouro sobe de 10 para 12 ao resolver a escolha, e a repetição de `finishQuest` devolve `questNotOpen`.

## Verificações e pendências

- TypeScript, ESLint no arquivo de teste e `git diff --check` passaram.
- Antes da implementação, o autor confirmou as duas falhas esperadas em `finishQuest`, com os dez testes da T-56 filtrados.
- Após implementar a entrega, TypeScript, ESLint nos arquivos alterados e `git diff --check` passaram. O autor confirmou que a suíte unitária passou.
- A v0.76 registra o acordo documental. A validação integrada da FEAT-15 depende do backend real.

## Retomada

### Testes pendentes de tentativa e progresso

`src/infra/database/drizzle/mappers/zone-quest.test.ts` cobre a carta reservada e o vínculo da tentativa após restaurar o save, êxito e revés, combate embutido com vitória, derrota e fuga, e progresso simultâneo dos contadores de zona até seus limites. A vitória por Reflexão fatal deve completar a etapa no POST que abre a entrega pendente, preservar o contador de vitórias e manter esse estado no GET, na reabertura e após a escolha que conclui o respawn.

TypeScript, ESLint no arquivo alterado e `git diff --check` passaram. A execução dos sete cenários pelo autor está pendente. Esperam-se seis recusas com `questWrongStage` em `continueQuest` e um teste de progresso divergindo no primeiro POST de êxito, com os contadores em zero em vez de um. A implementação depende da confirmação desse resultado.

Na primeira execução pelo autor, os sete cenários falharam e os treze demais foram filtrados. A divergência dos dois contadores foi confirmada. A mensagem genérica das outras seis falhas ocultou a ação e o motivo da recusa. O helper do teste passou a exibir esses detalhes. A segunda execução confirmou as seis recusas `questWrongStage` em `continueQuest`. O autor autorizou a implementação.

Sem serviços locais, execute no terminal do backend:

```bash
cd /d/Github/Misadventure_Backend_V3
npm test -- src/infra/database/drizzle/mappers/zone-quest.test.ts -t 'tentativas e progresso de missão de zona'
```

### Implementação das tentativas e dos contadores

- O agregado em `src/domain/campaign/enterprise/entities/party/index.ts` reutiliza a antecipação e a entrada de combate. Liga a tentativa à missão e à etapa, reserva a carta referenciada ou usa o combate embutido e preserva o deck e o descarte de eventos. A etapa volta a `ready` em revés, derrota ou fuga e fica `completed` em êxito ou vitória.
- `src/domain/campaign/enterprise/zone-quests/index.ts` projeta o estado da etapa e os contadores gravados. O agregado aplica o progresso às etapas elegíveis no primeiro desfecho, limitado pelas metas. A Reflexão fatal conclui a etapa de combate com o contador de vitórias intacto.
- `src/domain/campaign/application/use-cases/take-party-action/index.ts` carrega as referências da tentativa, os passos do encontro e as missões abertas pelo catálogo. O mapper Drizzle e o repositório em memória preservam o vínculo, a etapa e os contadores durante a entrega e a reabertura. Saves antigos usam `ready` e contadores em zero quando os campos estiverem ausentes.
- TypeScript, ESLint nos arquivos alterados e `git diff --check` passaram. O domínio continua usando o RNG semeado e recebe horário e IDs pelas portas.
- A primeira execução após a implementação teve 1.302 testes aprovados e quatro falhas na mesma asserção de abertura do combate. A projeção trazia `combat.card.id` e omitia `combat.cardId`, previsto na FEAT-15. A projeção passou a incluir `cardId` no combate vinculado à missão. Após a correção, o autor confirmou que a suíte unitária passou.

Para validar a implementação, execute `npm test -- --reporter=dot` na raiz do backend. Espera-se que a suíte passe, incluindo os sete cenários acima. No caso de borda da Reflexão fatal, a vitória completa a etapa imediatamente, com o jogador caído e a recompensa pendente. A escolha final conclui o respawn e preserva a etapa e o contador.

Commit sugerido após a verificação — `feat/link zone quest attempts and progress (t-57)`.

Commit da entrega final — `87db4b7` (`feat/persist zone quest completion rewards (t-57)`).

A próxima tarefa é a T-58 (REQ-133 e REQ-132), provação e mentor. A validação integrada da FEAT-15 está planejada para a T-60.
