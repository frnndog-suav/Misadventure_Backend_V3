# 001 — T-01 — Ferramentas e esqueleto NestJS

- **ID:** T-01 (FEAT-01) · **Data:** 2026-11-14 · **Status:** aguardando revisão
- **Spec:** v0.3 · **Contrato:** v0.4

## Objetivo

Instalar as bibliotecas autorizadas em D-05 (fixando versões), criar as configurações do projeto (TypeScript, Nest CLI, Vitest, Prettier, ESLint com as regras do domain-guard) e o esqueleto mínimo (`src/infra/main.ts` + `app.module.ts`) subindo na porta do env, com os scripts npm de CLAUDE.md (menos `validate:content`, que nasce na FEAT-04).

## Decisões

- **D-05 autorizado** (spec v0.3): a ordem do autor de executar a T-01 — cujo texto é "instalar as bibliotecas de D-05" — vale como a autorização que D-05 aguardava.
- **`@nestjs/config` 12.x:** o pacote segue major próprio (não existe 11.x); instalado o estável mais novo da família autorizada.
- **TypeScript fixado em 5.x (5.9.3):** o TS 7 recém-lançado conflita com o peer range do `typescript-eslint` (`<6.1.0`) e deprecia `baseUrl`; 5.x é o major que o Nest 11 suporta.
- **ESLint mantido em 9.x** (deprecation warning na instalação indica que existe major mais novo): D-05 autoriza 9.x; subir de major exige nova autorização.
- **`tsconfig.build.json` com `rootDir: "./src"`:** sem isso o tsc infere `rootDir = src/infra` (únicos arquivos hoje) e achata a saída, quebrando o `entryFile: infra/main` do nest-cli.
- **Sem `incremental`:** o `deleteOutDir: true` do nest build apaga `dist/` a cada build, mas o `tsconfig.build.tsbuildinfo` fica na raiz; o tsc incremental então "pula" a emissão e `dist/` não é gerado. Cache removido (build pequeno).
- **Sem `baseUrl`:** depreciado no TS 7 (diagnóstico do VSCode); `paths` resolve relativo ao tsconfig desde o TS 4.1.
- **Porta padrão 3333** quando `PORT` não está no env (lido direto em `main.ts`; o env validado por Zod nasce na T-02). O contrato não fixa porta.
- **`passWithNoTests: true`** nos dois configs do Vitest: `npm test` fica verde antes do primeiro teste existir (os primeiros nascem na T-03, TDD).
- **`test:e2e` sem `dotenv -e .env.test` por enquanto:** `.env.test` e `test/setup-e2e.ts` nascem na T-02; rodar `npm run test:e2e` antes disso falha por falta do setup (esperado).
- **`.prettierignore` cobre `docs/`, `CLAUDE.md`, `.claude/` e `.vscode/`:** `npm run format` nunca pode reformatar arquivos compartilhados (proibido alterar sem avisar o autor) nem o tooling.
- **ESLint ignora `.claude/`:** o hook `domain-guard.mjs` é script Node de tooling, não código do projeto (acusava `no-undef` de `process`/`console`).

## Passos e comandos

```
npm init -y
npm install @nestjs/common@11 @nestjs/core@11 @nestjs/platform-express@11 @nestjs/config reflect-metadata rxjs zod dotenv drizzle-orm pg
npm install -D @nestjs/cli@11 @nestjs/testing@11 typescript@5 @types/node vitest unplugin-swc @swc/core vite-tsconfig-paths supertest@7 @types/supertest prettier@3 eslint@9 typescript-eslint drizzle-kit dotenv-cli
```

(Primeira tentativa com `@nestjs/config@11` falhou com ETARGET — ver decisão acima; `typescript` sem pin resolvia para 7.0.2 e dava ERESOLVE com `typescript-eslint`.)

**Versões instaladas (fixadas):** `@nestjs/common` 11.2.10 · `@nestjs/config` 12.1.1 · `@nestjs/core` 11.2.10 · `@nestjs/platform-express` 11.2.10 · `dotenv` 18.0.10 · `drizzle-orm` 0.45.4 · `pg` 8.23.1 · `reflect-metadata` 0.2.2 · `rxjs` 7.8.2 · `zod` 4.6.7 · `@nestjs/cli` 11.0.24 · `@nestjs/testing` 11.2.10 · `@swc/core` 1.16.22 · `@types/node` 26.6.6 · `@types/supertest` 7.2.1 · `dotenv-cli` 11.1.0 · `drizzle-kit` 0.31.11 · `eslint` 9.39.5 · `prettier` 3.10.1 · `supertest` 7.3.2 · `typescript` 5.9.3 · `typescript-eslint` 8.72.2 · `unplugin-swc` 2.0.0 · `vite-tsconfig-paths` 6.1.1 · `vitest` 5.1.0. (`@faker-js/faker` não instalado — D-05 o deixa para a FEAT que primeiro precisar.)

Ambiente: Node v22.15.0, npm 11.14.1, Windows 10.

## Arquivos

Criados: `package.json`, `package-lock.json`, `.gitignore`, `.prettierrc`, `.prettierignore`, `eslint.config.mjs`, `nest-cli.json`, `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts`, `vitest.config.e2e.ts`, `src/infra/main.ts`, `src/infra/app.module.ts`.

Alterado: `docs/SPEC-BACKEND.md` (v0.3: D-05 autorizado, T-01 `[x]`, histórico).

Scripts npm: `build`, `start:dev`, `test`, `test:e2e`, `typecheck`, `lint`, `format`, `format:check`.

## Como verificar

```
npm install
npm run typecheck   # sem erros
npm run lint        # sem erros
npm run format:check# All matched files use Prettier code style!
npm run build       # gera dist/infra/main.js (rodar duas vezes: deve gerar nas duas)
npm run start:dev   # sobe; GET http://localhost:3333/ responde 404 do Nest
```

O 404 ainda é o padrão do Nest (`{"message":"Cannot GET /","error":"Not Found","statusCode":404}`); o corpo do CONTRATO §1.4 nasce com o filtro de erros na T-03.

## Problemas

1. `@nestjs/config@11` não existe (ETARGET) → instalado 12.x (major próprio do pacote).
2. `typescript@7.0.2` conflita com `typescript-eslint` (ERESOLVE) → pinado `typescript@5`.
3. ESLint acusava `no-undef` no hook `.claude/hooks/domain-guard.mjs` → `.claude/**` ignorado no `eslint.config.mjs`.
4. `nest start --watch` quebrava com `Cannot find module dist\infra\main`: tsc achatava a saída (`rootDir` inferido como `src/infra`) → `rootDir: "./src"` no `tsconfig.build.json`.
5. `nest build` passava mas não gerava `dist/`: `tsbuildinfo` na raiz + `deleteOutDir` tornavam o cache incremental incoerente → `incremental` removido do `tsconfig.json`.

## Checks

| Check | Resultado |
|---|---|
| guarda do domínio | ✅ (src/core e src/domain ainda não existem) |
| tipos (`typecheck`) | ✅ 0 erros |
| lint | ✅ 0 erros |
| formatação | ✅ |
| testes unitários | ✅ 0 testes (passWithNoTests; os primeiros nascem na T-03) |
| e2e | nenhum afetado (configurado; funcional após T-02) |
| build (2x seguidas) | ✅ `dist/infra/main.js` gerado |
| `start:dev` | ✅ sobe na 3333 e responde |
| segredos fora do Git | ✅ (`.env*` no `.gitignore`; nenhum `.env` existe) |

## Ponte com o frontend

Nenhum aviso: a T-01 não toca contrato, README nem ROADMAP. O AVISO DE FRONTEND da FEAT-01 sai na T-03 (`implementado (BE)`).

## Commit sugerido

`chore/ferramentas e esqueleto nestjs (t-01)`
