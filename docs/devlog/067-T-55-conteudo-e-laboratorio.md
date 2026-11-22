# 067 — T-55 — Conteúdo e laboratório

- Data — 2026-11-22
- Status — concluída
- Spec — v0.66, REQ-135
- Contrato — v0.74, FEAT-15 acordada
- Horas — a preencher pelo autor

## Objetivo

Entregar os critérios acordados de conteúdo, laboratório e compatibilidade com saves anteriores à FEAT-15. Os testes vieram primeiro. O autor confirmou as 17 falhas esperadas antes da implementação.

## Arquivos

- `src/infra/content/quest-content.test.ts` exercita parsers e casos de uso do editor com armazenamento em memória. Cobre referências editoriais e publicadas, erros por campo, combate embutido, conteúdo legado, validação de dimensão, exclusão, filtro e contagens.
- `src/infra/http/presenters/lab-config-presenter/quest-config.test.ts` cobre os dez padrões e limites, atualização em lote, a preservação de valores em lote inválido e o reset.
- `src/domain/campaign/application/use-cases/create-party/index.test.ts` cobre a recusa de dimensão inconsistente, o snapshot do laboratório e a proteção da missão em uso.
- `src/infra/database/drizzle/mappers/drizzle-party-mapper.test.ts` cobre os padrões e as listas vazias na projeção de um save v9.
- `src/infra/content/{card-schemas,load-content,content-messages}.ts` aceita os novos formatos, normaliza conteúdo legado e traduz erros por campo.
- `src/domain/catalog/enterprise/{catalog-integrity,card-validation,class-validation,dimension-composition,editor-collection}/index.ts` e os casos de uso do catálogo aplicam escopo editorial, escopo publicado, unicidade, proteção de referências e contagens de `zoneQuest`.
- `src/domain/lab/enterprise/value-objects/game-config/defaults.ts` acrescenta os dez ajustes às regras de atualização e restauração existentes.
- `src/domain/campaign/application/use-cases/create-party/index.ts`, `src/domain/campaign/enterprise/{entities/party,map-assembly}/index.ts` e `src/infra/database/drizzle/mappers/drizzle-party-mapper.ts` validam o conjunto publicado, preservam a ordem do deck por zona e protegem o conteúdo de missão no save. Os campos novos são aditivos no JSON do save v9.
- Presenters de carta, classe e grupo em `src/infra/http/presenters/` e expectativas de respostas das rotas e fixtures afetadas.

## Como verificar

No Git Bash, os testes unitários usam fixtures e dispensam banco, Docker e backend em execução.

```bash
cd /d/Github/Misadventure_Backend_V3
npm test -- --reporter=dot
```

Resultado esperado após a implementação é a suíte unitária sem falhas. O caso de borda do lote mistura um ajuste válido, valores fora da faixa e um decimal. O lote deve ser recusado e a consulta seguinte deve devolver o estado anterior integralmente.

## Checks e pendências

- Antes da implementação, o filtro `REQ-135` executado pelo autor registrou 17 falhas em quatro arquivos. O autor confirmou as falhas esperadas.
- TypeScript, ESLint nos arquivos alterados, build e `git diff --check` passaram. O validador de conteúdo aprovou `content` (1 coleção, 16 cartas) e `test/fixtures/content` (1 coleção, 24 cartas).
- A primeira execução unitária após a implementação passou 1.284 de 1.286 testes. Duas expectativas legadas foram atualizadas para incluir `zoneQuest`: a lista de arquivos reconhecidos em `load-content.test.ts` e as contagens da coleção vazia em `create-collection/index.test.ts`. O autor confirmou que todos os testes unitários passaram na nova execução.
- O autor confirmou que todos os testes de ponta a ponta selecionados para as rotas afetadas passaram com o PostgreSQL local. O retorno não incluiu a contagem de testes.

## Retomada

A próxima etapa é a T-56, quadro, ações de zona e save, conforme REQ-131 e D-111 da spec v0.66. A validação integrada da FEAT-15 está planejada para a T-60.

Commit sugerido — `feat/add quest content and lab settings (t-55)`
