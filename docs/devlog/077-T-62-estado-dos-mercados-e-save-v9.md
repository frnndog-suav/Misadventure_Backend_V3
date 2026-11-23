# 077 — T-62 — Estado dos mercados e save v9

- Data — 2026-11-23
- Status — aguardando revisão
- Spec — v0.76 (REQ-138, REQ-139, D-116, D-117, D-120; nova D-125)
- Contrato — v0.80, FEAT-16 `acordado` (sem mudança)
- Horas — 0,25 (registro automático)

## Objetivo

Segunda tarefa da FEAT-16. O grupo passa a guardar os mercados do mapa, o pool de singles e as expansões do jogador; sorteia tudo na criação, decai no fim de cada rodada e persiste no save v9. Não entram `visitMarket`, projeção `market`, `lastMarketVisit` nem `openBooster` (T-63 a T-65).

## Decisões (D-125 na spec)

- O agregado guarda `markets` (fator, `singles`, estoque por carta, vitrine) e `marketPool` (carta e cópias saídas). O estoque global é a soma dos mercados.
- As elegíveis vêm de fora: `CreatePartyUseCase` na criação e `TakePartyActionUseCase` antes de cada ação (só com mercado de singles). Ordenadas por id, porque o catálogo não garante ordem.
- Fisher–Yates parcial para o pool; com poucas elegíveis entram todas, sem RNG.
- Decaimento lê o slot quando a vez dele chega: um novo pool no meio da rodada pode preencher slots que ainda rolam.
- Ordem de uma saída: tirar a cópia, somar saída, tirar do pool se o global zerou, repor o slot, e só então sortear novo pool se esvaziou.
- O sorteio dos mercados é o último uso do RNG da criação. Sem domínio de evento novo (o contrato não lista).
- Save: sem nova versão; `markets`, `marketPool` e `expansions` são opcionais no v9; v2 a v8 leem vazio e 0 sem usar o RNG.

## Arquivos

- Novo: `src/domain/campaign/enterprise/markets/index.ts` (+ teste): sorteio, decaimento, `departSingle`, elegíveis, expansões.
- `entities/party/index.ts`: props, getters, `provideMarketCandidates`, criação, `decayMarkets` em `advanceTurn` (cobre o nocaute solo), `contentInUse`.
- `entities/party-member/index.ts` e `starting-player/index.ts`: `expansions`.
- `create-party` e `take-party-action`: entrega das elegíveis.
- `drizzle-party-mapper.ts`: schemas e leitura/gravação.
- Fakes: `in-memory-parties-repository.ts` (copia os mercados) e `make-party` (`expansions`).
- Testes novos: `markets/index.test.ts`, `party/markets.test.ts`, `take-party-action/markets.test.ts`; blocos novos em `create-party`, `delete-card`, `drizzle-party-mapper.test.ts` e `drizzle-parties-repository.e2e-spec.ts` (este exige Postgres).

## Como verificar

```bash
cd /d/Github/Misadventure_Backend_V3
unset CONTENT_DIR
npm test
docker compose up -d postgres
npm run test:e2e
```

Unitários: 103 arquivos, 1411 testes verdes. O e2e **não foi executado** pelo agente (Docker é do autor). Atenção: na fixture, Porto Cinzento tem mercado com singles, então `POST /parties` agora consome RNG a mais; algum e2e que dependa do sorteio posterior pode precisar de ajuste.

## Problemas

- O Bash do agente quebra o Vitest (`describe`); os testes rodaram pelo PowerShell.
- O fake `InMemoryPartiesRepository.snapshot` não copiava os mercados; corrigido.
- `npm run format` regravou todo o repositório com fim de linha LF (a cópia de trabalho estava em CRLF); o conteúdo não mudou. Inclui `AGENTS.md`, que não foi lido.
- `npm run lint` falha só em `test/prepare-feat-13.cjs` e `prepare-feat-14.cjs` (`console`/`process` indefinidos), já existente.
- O módulo `markets` foi escrito antes dos seus testes (sem fase red isolada); os demais testes tiveram red.

## Checks

`domain-guard` OK; `typecheck` OK; `format:check` OK; `build` OK; testes unitários verdes; lint com os erros pré-existentes acima.

## Ponte com o frontend

Nenhum aviso: sem mudança de contrato nem de resposta (a projeção é da T-63).

## Commit sugerido

`feat/add market state and save v9 (t-62)`

## Revisão 2026-11-23 — e2e

Primeira rodada do autor: 15 falhas em 7 arquivos de `take-party-action`. Os testes fabricam saves antigos (v2 a v8 e nocaute legado) copiando o estado v9 atual, que agora traz `markets`, `marketPool` e `expansions`. Os schemas antigos são estritos e recusavam os campos. Nos testes de nocaute legado, o mercado com singles de Porto Cinzento ainda decaía e consumia o RNG. Um save antigo de verdade nunca tem esses campos. Correção só nos testes: o helper `withoutMarkets` em `test/parties-e2e.ts` tira esses campos, e cada save fabricado passa por ele. Nenhum código de produção mudou.
