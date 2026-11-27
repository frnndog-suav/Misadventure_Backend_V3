# T-113 — Recrutamento e elenco

- **Data** — 2026-11-27
- **Status** — concluída
- **Spec e contrato** — SPEC-BACKEND v1.17 e CONTRATO v1.19
- **Horas** — a preencher pelo autor

A REQ-186 entra pelo ponto comum de abertura dos combates de evento, missão e chefe final. O agregado lista membros de pé na mesma zona, revalida os IDs escolhidos e recusa duplicatas. A IA iniciadora convida na ordem fixa das vezes da campanha. A IA convidada decide pelos PV no momento do convite, com aceite na metade exata, sem RNG. O humano convidado responde explicitamente durante a vez do iniciador.

A confirmação emite `combatRosterConfirmed`. Com apenas o iniciador, o agregado chama o combate solo existente e emite `combatStarted` antes do primeiro turno. Com mais participantes, o elenco confirmado fica disponível no snapshot para a T-114 iniciar os ciclos de grupo. O caso de uso atual continua selecionando a entrada solo até a T-116 conectar as decisões à API, à persistência e ao avanço automático.

## Arquivos

- `src/domain/campaign/enterprise/entities/party/index.ts` — recrutamento, respostas, confirmação, snapshot e entrada compartilhada.
- `src/domain/campaign/enterprise/combat/index.ts` — tipos das atualizações de convite e elenco.
- `src/domain/campaign/application/use-cases/take-party-action/index.ts` — seleção temporária da entrada solo no fluxo da aplicação.
- `src/domain/campaign/enterprise/entities/party/combat-recruitment.test.ts` — cenários de domínio da REQ-186.
- `docs/devlog/README.md`, `docs/devlog/tempo.html` e esta entrada — registro da etapa.

## Como verificar

Execute no Git Bash do backend. O teste de domínio roda sem serviços externos.

```bash
cd /d/Github/Misadventure_Backend_V3
npm test -- combat-recruitment.test.ts
```

Espere dez cenários aprovados. Confira a borda com dois candidatos na mesma zona quando a vez já está com zero PA. A IA com 11 de 22 PV aceita, a de 10 de 22 PV recusa e o custo permanece em 1 PA do iniciador. ID duplicado ou candidato que mudou de zona preserva a decisão, o RNG e o custo. Quando todos recusam, o combate solo começa após a confirmação. Quando a IA convida o humano, a resposta preserva o dono, a rodada e os PA da vez.

## Verificações executadas

- O Vitest padrão falhou antes de carregar a suíte porque o SWC rejeitou as permissões do cache nativo no ambiente do Codex. Para executar os unitários, foi usada uma configuração temporária de Vitest com alias para `src` e pool de threads, em `node_modules/.cache/req186.vitest.mjs`. O arquivo fica fora do controle de versão.
- Seis cenários iniciais falharam pelos comportamentos esperados antes da implementação. Os dez cenários finais da REQ-186 passaram.
- Suíte unitária completa com a configuração temporária. 1.865 testes passaram e um falhou. O caso da REQ-56 sobre o ator da vez apresentou o mesmo resultado com os arquivos de produção carregados de `a164388`.
- `npm run typecheck`, ESLint e Prettier nos fontes alterados e `git diff --check` passaram.
- A verificação dos novos fluxos ficou no domínio. A T-116 cobre as decisões por HTTP e E2E. A T-117 prepara a entrega para a T-112 no frontend.

## Retomada

A próxima etapa é a T-114, ciclos de combate em grupo conforme a REQ-188. Retomar a partir do elenco confirmado no snapshot do agregado.
