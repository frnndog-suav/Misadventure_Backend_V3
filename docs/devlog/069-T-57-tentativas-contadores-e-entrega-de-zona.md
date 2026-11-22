# 069 — T-57 — Tentativas, contadores e entrega de zona

- Data — 2026-11-22
- Status — aguardando revisão
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

Seguir na T-57 (REQ-132 e D-111) com o vínculo das tentativas de zona, o progresso dos contadores e o cenário de Reflexão fatal com recompensa pendente. A entrega final de zona está verificada.

Commit da entrega final — `87db4b7` (`feat/persist zone quest completion rewards (t-57)`).
