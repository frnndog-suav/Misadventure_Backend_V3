# T-115 — Recompensas e desfecho de combate em grupo

- **Data** — 2026-11-27
- **Status** — concluída
- **Spec e contrato** — SPEC-BACKEND v1.17, REQ-189 e REQ-190, CONTRATO v1.19, cenários 5 e 6
- **Horas** — a preencher pelo autor

A vitória fixa a condição dos participantes e o progresso da etapa de combate do dono da missão. Quem termina de pé recebe o Pico da carta ou o padrão, mais o bônus por Chefe derrotado, e o Vigor explícito. O iniciador de pé recebe o saque. Com o iniciador fora, o ouro é dividido para baixo e a prioridade gravada desempata a Celeridade efetiva na ordem de rodízio. O save guarda o cursor e a ordem durante a escolha humana. A IA usa o comportamento de entrega existente e deixa a carta quando ela não cabe.

As entregas emitem `combatRewardDelivered` e atualizam o resultado individual. O desfecho aplica respawn e perda da próxima vez após a última entrega, então emite `combatEnded` uma vez. Na Reflexão fatal sem sobreviventes, a vitória em grupo registra a missão aplicável e aplica os nocautes sem saque. O elenco que termina o recrutamento apenas com o iniciador conserva o fluxo solo histórico.

A vitória contra o chefe final aciona a conclusão da dimensão depois do desfecho. No resultado em grupo, o recibo de combate contém o Pico de Chefe e o recibo da dimensão contém o Pico de conclusão e o prêmio máximo. As escolhas de prêmio continuam no fluxo da FEAT-19.

## Arquivos

- `src/domain/campaign/enterprise/entities/party/index.ts`, `enterprise/combat/index.ts` e `enterprise/rewards/index.ts` — recompensas, desfecho, cursor e atualização de entrega.
- `src/domain/campaign/application/use-cases/take-party-action/index.ts` — integração da conclusão da dimensão com o desfecho coletivo.
- `src/infra/database/drizzle/mappers/drizzle-party-mapper.ts` — leitura e gravação dos campos opcionais de entrega em grupo.
- `combat-recruitment.test.ts`, `take-party-action/random-event.test.ts` e `drizzle-party-mapper.test.ts` — verificação dos cenários, do recibo e da leitura do save.

## Como verificar

No Git Bash do backend, com as dependências instaladas. A bateria usa fixtures em memória e dispensa serviços externos.

```bash
cd /d/Github/Misadventure_Backend_V3
npm test -- combat-recruitment.test.ts enterprise/combat take-party-action/random-event.test.ts drizzle-party-mapper.test.ts
```

Espere 172 testes aprovados em cinco arquivos. No cenário 5, a recompensa de 7 de ouro rende 3 para cada um dos dois sobreviventes quando o iniciador foge. Com o inventário humano cheio, a primeira carta fica pendente e as demais continuam no deck. Após resolver a primeira, confira a entrega ao ajudante e o retorno do rodízio ao humano. Confira a missão concluída mesmo se o dono fugir, e pronta para nova tentativa após derrota ou fuga coletiva. Na Reflexão fatal, compare o grupo sem sobreviventes com o elenco solo.

No cenário 6, confira Pico de Chefe para o sobrevivente e Pico de conclusão e prêmio máximo para ambos, com transição quando há sucessora e congelamento na última dimensão. A variante de Reflexão fatal conclui a dimensão após o respawn. Na fixture Sem fuga com saque pendente, a escolha mantém o ajudante caído e o save na dimensão de origem. Ao resolver a carta, confira o respawn, a perda da próxima vez e o congelamento.

## Verificações executadas

- Os testes iniciais da REQ-189 e da REQ-190 falharam antes da implementação por ausência de recompensas no desfecho coletivo.
- O script padrão parou na carga do SWC pelas permissões do cache nativo no ambiente do Codex. A execução reutilizou a configuração temporária do devlog 121 em `node_modules/.cache/req186.vitest.mjs`.
- Suítes afetadas: 172 testes passaram. Suíte unitária completa: 1.890 passaram e um falhou. A falha da REQ-56 sobre o ator da vez já está documentada no devlog 121.
- Typecheck, ESLint, Prettier dos arquivos TypeScript alterados e `git diff --check` aprovados.

## Retomada

A T-116 conecta as decisões, as projeções e o avanço automático ao fluxo HTTP. A validação da FEAT-22 pela API e a reexecução dos cenários afetados ficam para essa etapa.

## Commit sugerido

`feat/resolve group combat rewards and outcomes (t-115)`
