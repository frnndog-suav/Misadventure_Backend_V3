# T-114 — Ciclos de combate em grupo

- **Data** — 2026-11-27
- **Status** — concluída
- **Spec e contrato** — SPEC-BACKEND v1.17, REQ-188, e CONTRATO v1.19, cenários 3 e 4
- **Horas** — a preencher pelo autor

O agregado inicia o combate a partir do elenco confirmado na T-113. A ordem da campanha serve de prioridade padrão. A decisão de ordem aparece quando adiantar o humano muda um empate inicial, com a ordem relativa das IAs preservada. A prioridade escolhida fica no estado do combate e se aplica aos empates após cada recálculo de Celeridade. Os inimigos têm prioridade em empate. O turno de combate usa o membro que atua, enquanto a vez de exploração conserva o iniciador.

Os ataques, habilidades e custos reutilizam o motor existente. Inimigos escolhem entre membros de pé, conforme o perfil, e a habilidade de área resolve todos esses alvos. Nocaute remove o aliado dos alvos comuns e dos turnos enquanto estiver caído. A ressurreição restaura o aliado no elenco e limpa a condição de nocaute, com os eventos correspondentes. Se o aliado continuar caído até o fim, o agregado aplica o respawn e marca a próxima vez para ser pulada.

A fuga falha paga o Vigor da tentativa e provoca um ataque livre sem consumir o turno normal do inimigo. A fuga bem-sucedida retira apenas o participante. O limite do laboratório converte os membros de pé em fugidos e aplica a perda de Pico sem cobrar Vigor de tentativa, inclusive em Sem fuga. A derrota aplica o revés aos nocauteados. O agregado emite um único resultado coletivo com as condições anteriores ao respawn.

## Arquivos

- `src/domain/campaign/enterprise/combat/index.ts` — avanço da iniciativa, resolução por turno e alvos de área.
- `src/domain/campaign/enterprise/entities/party/index.ts` — início a partir do elenco confirmado, decisão de ordem, condições, desfecho e projeção no domínio.
- `src/domain/campaign/enterprise/entities/party/combat-recruitment.test.ts` — testes REQ-188 e atualização das expectativas da REQ-186 para o início do combate após confirmar o elenco.
- `docs/devlog/README.md`, `docs/devlog/tempo.html` e esta entrada — registro da etapa.

## Como verificar

No Git Bash do backend, com as dependências instaladas e sem serviços externos:

```bash
cd /d/Github/Misadventure_Backend_V3
npm test -- combat-recruitment.test.ts enterprise/combat take-party-action/random-event.test.ts
```

Espere 102 testes aprovados em quatro arquivos, incluindo os 12 casos da REQ-188. No cenário 3, confira que uma IA temporariamente mais rápida precede o humano no primeiro ciclo e que a preferência gravada vale no empate após o efeito expirar. Confira também a prioridade do inimigo no empate, o turno pulado e o PV restaurado para 11 de 22 quando o aliado é revivido. Na variante sem ressurreição, o aliado vai ao respawn após a vitória, conserva o ouro e perde a próxima vez.

No cenário 4, confira que o inimigo faz um ataque livre na tentativa falha e ainda tem seu ataque normal. No caso de borda com limite de um ciclo em Sem fuga, o humano de pé perde Pico e conserva os 3 de Vigor, o ajudante nocauteado sofre o revés e o resultado coletivo é derrota. Com todos de pé no limite, o resultado é fuga.

## Verificações executadas

- Os dois primeiros testes da REQ-188 falharam antes da implementação, pela ausência da decisão de ordem e do primeiro turno em grupo.
- O script padrão parou ao carregar o SWC devido às permissões do cache nativo no ambiente do Codex. A execução usou a configuração temporária do devlog 120, em `node_modules/.cache/req186.vitest.mjs`, com alias para `src` e pool de threads.
- Suítes afetadas: 102 passaram. Suíte unitária completa: 1.877 passaram e um falhou. A falha da REQ-56 sobre o ator da vez também ocorreu com os arquivos de produção do commit anterior `6adc8ce`.
- Typecheck, ESLint e Prettier dos fontes alterados e `git diff --check` passaram.

## Retomada

A próxima etapa é a T-115, recompensas e desfecho da REQ-189 e da REQ-190. Retomar das condições finais por participante e ligar a entrega de recompensas ao encerramento, incluindo o respawn após a última entrega e a conclusão da dimensão. A T-116 conecta as decisões, os eventos e o avanço automático à API e à persistência. A validação E2E do combate em grupo acompanha essa etapa.
