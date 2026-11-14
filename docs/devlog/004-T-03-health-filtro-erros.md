# 004 — T-03 — `GET /health` e filtro de erros

- **ID:** T-03 (FEAT-01) · **Data:** 2026-11-14 · **Status:** aguardando revisão
- **Spec:** v0.5 · **Contrato:** v0.5 (FEAT-01 `implementado (BE)`) · **Roadmap:** v0.5

## Objetivo

Fechar o lado backend da FEAT-01: `GET /health` com a versão do contrato (REQ-01), 404 `NOT_FOUND` para rota desconhecida (REQ-02) e 500 `INTERNAL_ERROR` sem stack trace (REQ-03), com CORS para o frontend.

## Decisões

- **D-10** (spec v0.5): CORS por `CORS_ORIGIN` (URL `http(s)`, padrão `http://localhost:5173`, dev server do Vite); `enableCors` no `main.ts`. Prós do padrão: o `.env` atual continua válido. Contra: se o frontend rodar em outra porta, é preciso definir a variável.
- Filtro registrado como `APP_FILTER` no `HttpModule` (vale no e2e, que não passa pelo `main.ts`) e responde via `HttpAdapterHost` — evita instalar `@types/express`.
- **Dúvida registrada (D-10):** toda `HttpException` não-404 vira 500, como D-08 manda. Um JSON malformado no corpo (400 do Express) também viraria 500; hoje nenhum endpoint recebe corpo. Tratar 4xx quando o primeiro endpoint com corpo nascer.
- `CONTRACT_VERSION` = `'0.5'` (D-06), junto com a marcação `implementado (BE)`.
- REQ-03 é testado com um controller descartável declarado só no arquivo e2e (sem endpoint de depuração).
- Mensagem de commit sugerida passa a ser **em inglês** (pedido do autor, 2026-11-14).
- Docker é ligado só para testar e desligado logo depois (pedido do autor, 2026-11-14).

## Passos e comandos

Nenhuma dependência nova.

```
docker compose up -d --wait postgres
npm run test:e2e        # red: 404/500 no formato do Nest, contract-version inexistente
npm run format; npm run typecheck; npm run lint; npm test; npm run test:e2e; npm run build
node dist/infra/main    # + curl dos cenários
docker compose down     # e Docker Desktop desligado
```

## Arquivos

Criados: `src/infra/http/{contract-version.ts,http.module.ts}`, `src/infra/http/controllers/health/{index.controller.ts,index.controller.e2e-spec.ts}`, `src/infra/http/errors/all-exceptions-filter/{index.ts,index.e2e-spec.ts}`, `client.http`.
Alterados: `src/infra/app.module.ts` (importa `HttpModule`), `src/infra/main.ts` (CORS), `src/infra/env/{env.ts,env.test.ts}` (`CORS_ORIGIN`), `docs/SPEC-BACKEND.md` (v0.5), `docs/CONTRATO.md` (v0.5), `docs/ROADMAP.md` (v0.5), `docs/devlog/tempo.html`.

## Como verificar

Pré-requisito: `.env` com `PORT=3333`, `DATABASE_URL=postgresql://docker:docker@localhost:5432/misadventures` e, opcional, `CORS_ORIGIN=http://localhost:5173` (o mesmo em `.env.test`).

1. `docker compose up -d --wait postgres` e `npm run start:dev`.
2. `curl -i http://localhost:3333/health` → `200` `{"status":"ok","contractVersion":"0.5"}` com `Access-Control-Allow-Origin: http://localhost:5173`.
3. `curl -i -X POST http://localhost:3333/rota-que-nao-existe` → `404` `{"error":{"code":"NOT_FOUND","message":"Recurso não encontrado."}}`.
4. `npm run test:e2e` → 7 testes (REQ-01; REQ-02 em GET/POST/PUT/PATCH/DELETE; REQ-03).
5. `docker compose down`.

## Problemas

1. `.env`/`.env.test` não existem no repositório local (escrita bloqueada para o agente) → testes rodados com `DATABASE_URL` na sessão do shell.
2. `TS7016` ao importar tipos de `express` → filtro reescrito com `HttpAdapterHost`.
3. O container `misadventures-backend` estava rodando desde a T-02 → derrubado.

## Checks

| Check | Resultado |
|---|---|
| guarda do domínio | ✅ (sem src/core e src/domain) |
| tipos | ✅ 0 erros |
| lint | ✅ 0 erros |
| formatação | ✅ |
| unitários | ✅ 7/7 |
| e2e | ✅ 7/7 |
| build | ✅ |
| curl dos cenários | ✅ 200 e 404 conforme o contrato |

## Ponte com o frontend

AVISO DE FRONTEND — FEAT-01 emitido: levar `docs/CONTRATO.md` v0.5 e `docs/ROADMAP.md` v0.5; o frontend valida os dois cenários contra o backend real.

## Commit sugerido

`feat/health endpoint, global error filter and cors (t-03)`
