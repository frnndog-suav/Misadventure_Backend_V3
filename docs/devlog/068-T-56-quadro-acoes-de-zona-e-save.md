# 068 — T-56 — Quadro, ações de zona e save

- Data — 2026-11-22
- Status — em validação
- Spec — v0.66, REQ-131 e D-111
- Contrato — v0.74, FEAT-15 acordada
- Horas — a preencher pelo autor

## Implementação

O quadro usa a ordem inicial do deck da instância da zona. A aceitação repõe a vaga escolhida, custa 1 PA e cria a missão no fim da lista. O abandono custa 0 PA e devolve a carta à origem. A ordem das vagas e da pilha fica no save. A etapa fica na instância da missão do jogador. A reaceitação recebe outro ID e volta à etapa inicial. A projeção usa os bloqueios de encontro, combate e escolha pendente das rotas existentes.

- `src/domain/campaign/enterprise/` aplica o ciclo, as interações, as recusas e as escolhas. As mudanças de quadro e etapa usam a gravação existente do grupo. O ID vem da porta e as ações não sorteiam cartas.
- `src/domain/campaign/application/use-cases/take-party-action/index.ts` carrega o conteúdo necessário. `_errors/action-not-allowed-error.ts` envia os identificadores das recusas de alvo no envelope existente.
- `src/infra/http/presenters/party-presenter/index.ts` carrega e projeta ofertas, missões e escolhas. `src/infra/database/drizzle/mappers/drizzle-party-mapper.ts` inclui os campos opcionais no save v9.
- `src/infra/database/drizzle/mappers/zone-quest.test.ts` cobre o ciclo pelo caso de uso e pelo presenter, a ida e volta pelo mapper, as recusas e o save legado.

## Como verificar

Os testes unitários usam fixtures em memória e dispensam Docker, PostgreSQL e backend em execução.

```bash
cd /d/Github/Misadventure_Backend_V3
npm test -- --reporter=dot
```

Resultado esperado após a implementação é a suíte unitária sem falhas. No caso de borda, abandonar na zona de destino com 0 PA devolve a carta à origem. Ao voltar à origem e reaceitar, a nova missão deve ter ID diferente e começar na etapa 0.

## Verificações e pendências

- Antes da implementação, o autor executou os 10 testes da T-56. Houve 9 falhas esperadas e passou o teste de save legado. O autor autorizou prosseguir.
- TypeScript, ESLint nos arquivos alterados e `git diff --check` passaram. A suíte unitária pós-implementação aguarda o autor.
- A finalização de uma interação sem recompensa retira a carta da partida. A T-57 habilita tentativas, contadores e entrega final. A finalização de carta com recompensa fica indisponível até a entrega para preservar a missão.
- A validação integrada da FEAT-15 está planejada para a T-60.

Commit sugerido — `feat/add zone quest board and actions (t-56)`
