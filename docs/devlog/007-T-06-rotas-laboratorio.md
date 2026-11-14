# 007 — T-06 — Rotas do laboratório (`/lab/config`)

- **ID:** T-06 (FEAT-03) · **Data:** 2026-11-14 · **Status:** aguardando revisão
- **Spec:** v0.9 · **Contrato:** v0.8 (FEAT-03 `implementado (BE)`) · **Roadmap:** v0.10

## Objetivo
Expor o laboratório por HTTP (REQ-04 a REQ-08): `GET /lab/config`, `PATCH /lab/config` e `POST /lab/config/reset`, que só existem com `LAB_ENABLED=true`. Inclui o mapeamento de `DomainError` para status HTTP no filtro global. Com esta tarefa, o lado backend da FEAT-03 fica completo.

## Decisões (D-17)
- **`LAB_ENABLED`:** aceita só `'true'` ou `'false'`; o padrão é `'false'`, e qualquer outro valor derruba o boot.
- **Módulo condicional:** o `LabModule` entra por `ConditionalModule.registerWhen`, do `@nestjs/config`, que já estava autorizado. A flag é avaliada uma única vez, quando o `app.module` é importado. Por isso o helper `test/lab-app.ts` define a flag antes de um `import()` dinâmico. Cada arquivo de teste usa um valor só, e o Vitest isola os módulos por arquivo.
- **Controllers e corpo:** há um controller por rota. O corpo do `PATCH` chega cru (`unknown`) ao caso de uso, sem pipe, porque toda a validação é do domínio (D-15).
- **Erros de domínio:** o controller transforma o `left` em `DomainErrorException`, e o filtro responde com o status da tabela `DOMAIN_ERROR_STATUS` (`http/errors/domain-error-status.ts`).
- **JSON malformado:** o Nest transforma o `SyntaxError` do body-parser em `BadRequestException` e descarta a causa (`routes-resolver.js`, `mapExternalException`). Por isso qualquer `HttpException` 400 em `/lab/*` vira `LAB_CONFIG_INVALID` com `invalidBody`. Nenhum controller lança 400 por conta própria.
  - Desvantagem: um `URIError` (caminho com `%` inválido) em `/lab/*` também viraria `invalidBody`.
  - Alternativa descartada: um parser JSON próprio, que daria mais código para um caso de borda.
- **Compose:** `LAB_ENABLED: 'true'` no serviço `backend`.
- **`CONTRACT_VERSION`:** passa de `'0.5'` para `'0.8'` (D-06).
- **Revisão:** a tarefa só toca infra, então revisei o diff eu mesmo contra a spec e o contrato, sem `spec-reviewer`.

## Passos e comandos
1. Testes primeiro (red): e2e de REQ-04 a REQ-08 e o helper `test/lab-app.ts`. Rodei `npm run test:e2e`: 8 falharam com 404, porque as rotas não existiam. O REQ-08 já passava.
2. Implementação. Na primeira execução, o `ConditionalModule` avaliava a flag antes do helper mudá-la; corrigi com o import dinâmico. Na segunda, o JSON malformado dava 500, pela causa descartada descrita acima; corrigi no filtro.
3. O `env.test.ts` foi atualizado para a chave nova do schema, com três casos novos de `LAB_ENABLED`.
4. Rodei `npm run format`, `typecheck`, `lint`, `format:check`, `npm test` (46), `npm run test:e2e` (22), `domain-guard --all` e `build`.
5. Roteiro com `curl` contra `node dist/infra/main.js`, com a flag ligada e depois desligada (veja "Como verificar").
6. `/contrato FEAT-03 implementado`: CONTRATO v0.8 e ROADMAP v0.10.
7. `docker compose down` e Docker Desktop fechado.

## Arquivos
**Criados:**
- `src/infra/http/lab.module.ts`
- `src/infra/http/lab.module.e2e-spec.ts` (REQ-08)
- `src/infra/http/controllers/{get,update,reset}-lab-config/index.controller{.ts,.e2e-spec.ts}`
- `src/infra/http/presenters/lab-config-presenter/index.ts`
- `src/infra/http/errors/{domain-error-exception.ts,domain-error-status.ts}`
- `test/lab-app.ts`

**Alterados:**
- `src/infra/app.module.ts`
- `src/infra/env/{env.ts,env.test.ts}`
- `src/infra/http/errors/all-exceptions-filter/index.ts`
- `src/infra/http/contract-version.ts`
- `docker-compose.yml`
- `client.http`
- `docs/SPEC-BACKEND.md` (v0.9)
- `docs/CONTRATO.md` (v0.8)
- `docs/ROADMAP.md` (v0.10)
- `docs/devlog/README.md`
- `docs/devlog/tempo.html`

## Como verificar
Pré-requisitos: `docker compose up -d postgres`, `npm run db:migrate`, `npm run build`. Depois:
- Suba com `LAB_ENABLED=true node dist/infra/main.js`:
  - `GET /lab/config` → 200, com padrões e limites.
  - `PATCH {"actionPointsPerTurn":4}` → 200.
  - `PATCH {"actionPointsPerTurn":0,"foo":1}` → 400, `outOfRange` + `unknownKey`.
  - `PATCH` com JSON malformado → 400, `invalidBody`.
  - `POST /lab/config/reset` → 200, com os padrões.
- Suba com `LAB_ENABLED=false`: `GET /lab/config` → 404 `NOT_FOUND`.

## Problemas
- O `ConditionalModule` avalia a flag na importação do módulo; resolvido no helper de teste.
- O Nest descarta a causa do erro de JSON malformado; resolvido no filtro.
- Aviso preexistente do Vitest ("ESM syntax in a file loaded as CommonJS" em `vitest.config*.ts`), que não afeta os testes.

## Checks
- `npm test`: 6 arquivos, 46 testes. `npm run test:e2e`: 7 arquivos, 22 testes.
- `typecheck`, `lint`, `format:check`, `domain-guard --all` e `build`: OK.

## Ponte com o frontend
AVISO DE FRONTEND — FEAT-03 emitido. Leve `docs/CONTRATO.md` v0.8 e `docs/ROADMAP.md` v0.10 para o frontend; ele valida a tela do laboratório contra o backend real.

## Commit sugerido
`feat/lab config routes (t-06)`
