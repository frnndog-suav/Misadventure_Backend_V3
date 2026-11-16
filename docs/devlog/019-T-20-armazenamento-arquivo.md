# 019 — T-20 — Armazenamento em arquivo (FEAT-31)

- **ID:** T-20 (FEAT-31) · **Data:** 2026-11-16 · **Status:** aguardando revisão
- **Spec:** v0.23 · **Contrato:** v0.22 (FEAT-31 `acordado`, sem mudança) · **ROADMAP:** v0.25

## Objetivo
REQ-41 (catálogo só com publicadas) e REQ-49 (gravação em arquivo) no infra: adaptador de arquivo servindo `ContentStore` e `CardCatalog` (D-47, D-48), `ZodCardInputParser`, tabela de textos D-49, volume `./content` no Compose (D-52).

## Decisões
- **Do autor (2026-11-16):** `wrongAttributeCount` virou três motivos (`basicAttributeCount`, `enhancedAttributeCount`, `synergyAttributeCount`), para o texto do contrato "Carta básica tem exatamente 1 atributo." sair só de (motivo, caminho). Registrado em D-49.
- A tabela traduz por motivo e, quando um motivo serve a vários campos, pelo `path` (`idTaken`, `required`, `notAnObject`, `invalidFormat` em `cards`).
- O JSON gravado sai no formato do Prettier (`formatContentJson`, testado contra o próprio Prettier), para o `format:check` continuar limpo.
- `listCollections`/`findCollection` devolvem `TContentCollection` para as duas portas (como o fake de memória); o presenter do catálogo já filtra os campos.
- Limites aceitos (só dev), em D-49: renomear para outro tipo grava 2 arquivos sem atomicidade entre eles; sobras `.tmp` de um crash derrubam o boot (remover à mão).
- Revisão `spec-reviewer`: aprovado sem bloqueantes; aplicados o teste de falha na troca de pasta e o registro dos limites e dos 3 textos novos (`unknownStatus`, `repeatedParam`, `invalidReplace`), que entram no contrato no `implementado (BE)` da T-21, junto da correção "D-38 → D-49".

## Passos e comandos
1. Testes de domínio ajustados aos 3 motivos → vermelho; `checkCatalogIntegrity` com `switch` exaustivo → verde.
2. Testes novos do infra (`content-messages`, `zod-card-input-parser`, `format-content-json`, `file-content-store`, casos novos em `load-content`, e2e `catalog-published-only`) → vermelho por módulo ausente.
3. Implementação; `ContentCardCatalog` removido (substituído).
4. `npm run format`, `domain-guard --all`, `tsc`, `eslint`, `npx vitest run`, `npm run validate:content -- content`, `validate-content.cli.js test/fixtures/content`, `npm run test:e2e` (Postgres de pé pelo autor).

## Arquivos
**Criados:** `src/infra/content/{file-content-store,content-messages,zod-card-input-parser,format-content-json}.ts` (+ `.test.ts` de cada), `src/infra/content/catalog-published-only.e2e-spec.ts`.
**Alterados:** `src/domain/catalog/enterprise/catalog-integrity/index.ts` (+ testes de domínio de 5 casos de uso/integridade), `src/infra/content/{card-schemas,load-content,content.module}.ts`, `load-content.test.ts`, `docker-compose.yml`, `docs/SPEC-BACKEND.md` (v0.23, T-20 `[x]`, D-49).
**Removidos:** `src/infra/content/content-card-catalog.ts` e `.test.ts`.

## Como verificar
`npx vitest run src/infra/content` (fs em pasta temporária); `npm run test:e2e` (catálogo esconde rascunho); `npm run validate:content -- content`. Sem rotas novas (T-21).

## Problemas
- Postgres não estava de pé no primeiro `test:e2e` (`ECONNREFUSED`); o autor subiu e passou.
- Script `node -e` no Bash do Git perdeu trechos com crase em comentários; corrigido à mão.

## Checks
domain-guard OK; tsc, eslint, format:check limpos; unitários 49 arquivos / 340 testes (+1 depois da revisão); e2e 19 / 56; build e `validate:content` (content e fixture) ok.

## Ponte com o frontend
Nenhum aviso: o contrato não mudou (o catálogo só com publicadas já está na CONTRATO v0.22). A FEAT-31 fica `implementado (BE)` na T-21.

## Commit sugerido
`feat/content file storage`
