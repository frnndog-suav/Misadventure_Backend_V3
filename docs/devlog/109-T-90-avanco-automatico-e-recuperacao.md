# 109 — T-90 — Avanço automático e recuperação

- **Data** — 2026-11-26
- **Situação** — implementação pronta para testes do autor
- **Spec** — v1.12, REQ-183 a REQ-185, D-157
- **Contrato** — v1.08, FEAT-20 acordada
- **Horas** — a preencher pelo autor

## Primeira bateria de testes

- `docs/SPEC-BACKEND.md` registra a conclusão da T-89 com base no devlog 108.
- `take-party-action/ai-advance.controller.e2e-spec.ts` exercita os gatilhos HTTP com dois ajudantes e usa o executor interno `TakePartyActionUseCase.executeAiTurn` para observar a ordem, ler o save entre as vezes e interromper a segunda vez automática. A retomada usa a mesma chave ou o POST de sessão. A suíte também verifica chave ausente ou inválida, conflito de corpo, recusa de chave nova durante a pendência, concorrência, reenvio histórico e preservação do save.
- Typecheck e `git diff --check` passaram. A execução do E2E aguarda o autor. Com o PostgreSQL de teste disponível conforme `.env.test` (ou `.env` na ausência de override), o Supertest cria a aplicação e o setup isola o schema.

```bash
cd /d/Github/Misadventure_Backend_V3 && npm run test:e2e -- src/infra/http/controllers/take-party-action/ai-advance.controller.e2e-spec.ts
```

- Esperado: sete falhas e um teste passando. O início para na vez da IA e a ação humana não chama o executor. As duas chaves inválidas são aceitas com 200. Os dois cenários de interrupção retornam 200 porque não chegam ao executor. No reenvio simultâneo, o segundo POST recebe 409 porque a vez segue com a IA. O fluxo solo deve passar.
- O log enviado pelo autor mostrou exatamente sete falhas e um teste passando, com os resultados esperados acima. Os avisos do Vite não impediram a execução.

## Implementação

- `src/infra/http/party-advance.service.ts`, `campaign.module.ts` e os controllers de sessão e ações ligam os dois POSTs ao avanço com `executeAiTurn`. Cada vez automática relê o save sob a trava e confirma estado, RNG e lote público antes da próxima. A última transação guarda a resposta pública completa para reenvio. GET segue lendo o estado atual.
- `take-party-action/index.ts` reutiliza a validação e a execução da intenção humana. O executor reúne as transições de combate na ordem em que ocorrem e encerra a vez ao mudar de dimensão, inclusive quando o novo sorteio coloca o mesmo ajudante em primeiro na nova rodada. `party-action/index.ts`, `action-advance-errors.ts` e `domain-error-status.ts` ligam a validação da chave e os conflitos de recuperação aos erros acordados.
- `drizzle-parties-repository.ts`, `database.module.ts`, `schema/parties.ts` e a migração `0003_party_action_receipts.sql` com seus metadados persistem os recibos sob a trava do save. A migração é aditiva e a exclusão do save remove seus recibos. A chave estrangeira resolve a tabela pelo schema da conexão para funcionar também no isolamento do E2E.
- `ai-advance.controller.e2e-spec.ts` distingue os cenários de passagem simples do cenário com combate. Cobre interrupção logo após o commit humano, novo corte após o combate, retomada pela sessão e reenvio após outra jogada. Também cobre sucessora com IA na primeira vez, progressão individual e congelamento sem sucessora.

## Verificações e pendências

- Passaram o typecheck, o ESLint dos arquivos TypeScript alterados, `git diff --check` e a checagem dos metadados do Drizzle. O domínio continua usando o RNG do save e as portas de relógio e IDs.
- O E2E pós-implementação aguarda o autor. Com o PostgreSQL indicado em `.env.test` disponível, ou `.env` na ausência de override, executar no Git Bash. O setup cria um schema isolado e aplica as migrações. O Supertest monta a aplicação no processo de teste.

```bash
cd /d/Github/Misadventure_Backend_V3 && npm run test:e2e -- src/infra/http/controllers/take-party-action src/infra/http/controllers/start-session src/infra/http/controllers/create-party/ai-player-priorities.controller.e2e-spec.ts src/infra/database/drizzle/repositories/drizzle-parties-repository.e2e-spec.ts
```

- Esperado: 11 cenários da nova suíte e as regressões passam. No replay histórico, a resposta mantém o lote original e o save mantém a jogada posterior. Ao tentar reabrir a última dimensão concluída, a API devolve `409 PARTY_FROZEN`.
- A aplicação da migração no ambiente do backend ainda não foi verificada. A confirmação dos testes encerra a T-90. A T-91 fica para uma etapa autorizada após esse retorno.

## Ajustes após a primeira execução

- O autor executou 202 testes E2E. Passaram 196 e falharam seis. Os testes chegaram à execução das asserções no schema isolado com a migração nova.
- Cinco regressões montavam saves v2 a v6 a partir da configuração atual. A fábrica compartilhada `test/factories/remove-post-v6-config.ts` agora também remove `aiPlayerPriorities` dessas fixtures. Isso preserva a validação estrita do mapper e exercita a leitura histórica com os padrões.
- No cenário de checkpoint de combate, a carta de Lobos Uivantes tinha somente texto nos desfechos. A fixture do E2E agora declara as duas listas de passos vazias para tornar o encontro executável. O teste continua verificando a ordem do lote, a retomada e o replay após uma jogada posterior.
- Typecheck, ESLint dos arquivos ajustados e `git diff --check` passaram. Repetir o comando E2E acima e aguardar 202 testes passando.
