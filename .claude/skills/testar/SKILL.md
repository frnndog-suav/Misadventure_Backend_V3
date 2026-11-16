---
name: testar
description: Roda só os testes afetados pelo que mudou - unitários (Vitest) ligados aos arquivos alterados e e2e (Supertest) dos controllers que eles tocam - ou um contexto específico, ou a suíte inteira com "tudo". Use no fim de cada tarefa (a /tarefa e a /checar chamam), quando o autor pedir para rodar os testes, ou para conferir que uma mudança não quebrou nada.
argument-hint: (vazio) | <contexto do domínio> | tudo
---

# /testar

Pedido: **$ARGUMENTS** (vazio = o que mudou; nome de contexto = só ele; `tudo` = suíte inteira).

Regra: **não rode todos os testes toda hora.**

## 1. O que mudou
```
git diff --name-only HEAD
git ls-files --others --exclude-standard
```
**Não rodam nada:** `docs/**`, `*.md`, `.claude/**`. Se só sobrou isso, diga "nenhum teste afetado" e pare.

**Infraestrutura → suíte inteira (unitários e e2e):** `package.json`, lockfile, `tsconfig*.json`, `vitest.config*.ts`, `nest-cli.json`, `docker-compose.yml`, `drizzle.config.ts`, `src/infra/database/drizzle/schema/**`, `src/infra/database/drizzle/migrations/**`, `test/setup-e2e.ts`, `src/infra/app.module.ts`, `src/infra/main.ts`, `src/infra/env/**`.

## 2. Unitários
`npx vitest related --run <arquivos alterados> <testes vizinhos>`
- Passe sempre os testes alterados e os vizinhos (`index.ts` → `index.test.ts`).
- Mudança em `src/core/**` → rode todos os unitários de `src/domain/**` (o core é base de tudo).
- Mudança em `test/fakes/**`, `test/repositories/**`, `test/factories/**` → rode os testes que os importam (Grep).
- Mudança em `content/**` ou `test/fixtures/content/**` → testes do contexto `catalog` + `npm run validate:content`.

## 3. E2E (Supertest, `*.e2e-spec.ts`)
Pré-requisito: banco no ar. Confira só com `docker compose ps` (leitura). Se não estiver, **não suba**: pare e peça ao autor para abrir o Docker Desktop e rodar `docker compose up -d postgres`; continue quando ele confirmar. Nunca derrube containers ao terminar; diga ao autor o que ele pode derrubar.

`npm run test:e2e -- <arquivos e2e>` para:

| Mudou | Roda os e2e de |
|---|---|
| `src/infra/http/controllers/<nome>/**` | esse controller |
| `src/infra/http/presenters/<nome>-presenter/**` | controllers que usam o presenter (Grep) |
| `src/infra/http/errors/**`, `pipes/**`, `http.module.ts` | todos os controllers |
| `src/infra/database/**` (fora do schema) | controllers que usam o repositório alterado (Grep) |
| `src/domain/<contexto>/application/use-cases/<nome>/**` | controllers que chamam esse caso de uso (Grep) |
| `src/domain/<contexto>/enterprise/**` | controllers do contexto |
| arquivo fora da tabela | todos os e2e; acrescente o caso a esta tabela |

Controller sem e2e ainda → diga "o controller X ainda não tem e2e".

## 4. `tudo`
`npm test` e `npm run test:e2e`.

## Saída
| Suíte | O que rodou | Resultado |
|---|---|---|

Abaixo, a saída de cada falha. Não corrija nada: quem chamou decide.
