# 025 — T-17 — Save v2 e rotas da preparação (FEAT-06)

- **ID:** T-17 (FEAT-06) · **Data:** 2026-11-17 · **Status:** concluída
- **Spec:** v0.28 · **Contrato:** v0.24 (FEAT-06 `acordado`, sem mudança) · **ROADMAP:** v0.29

## Objetivo
Levar a preparação da T-16 até o HTTP e o banco: REQ-31 e REQ-35 a REQ-37 de ponta a ponta, save v2 (D-43) e `DIMENSION_INVALID` → 409 (D-44).

## Decisões
- **D-59 (nova):**
  - a migração `0002` é custom e só apaga os saves;
  - o presenter calcula as contagens do deck e do descarte e não expõe `deck` nem `build`;
  - o e2e de dimensão inválida roda sobre uma cópia da fixture, um arquivo por cenário;
  - sem Carta publicada, a resposta também traz o problema da Urbana.

## Passos e comandos
1. Testes primeiro (e2e):
   - `create-party`: REQ-31, 32, 34, 35 e 37;
   - `index.no-dimension` e `index.arrival-zone`: REQ-36;
   - Drizzle: `schemaVersion` 2, ida e volta do REQ-37 e efeito da `0002`;
   - os helpers mandam `playerClass`.
2. Comando: `npx drizzle-kit generate --custom --name=parties_v2` → `DELETE FROM "parties"`.
3. `PartyPresenter` com `dimension`, `turnOrder` e `player`; `DIMENSION_INVALID` em `DOMAIN_ERROR_STATUS`; `client.http`.
4. Primeira rodada do e2e: 2 falhas, ambas nos testes:
   - a expectativa de `problems` estava errada;
   - dois apps num mesmo arquivo não funcionam (`CONTENT_DIR` é lido uma vez por arquivo).
   Corrigidas no teste, sem mudar o código.
5. `spec-reviewer`: **APROVADO**. Aplicados:
   - invariantes do mapa no REQ-32;
   - título do REQ-37;
   - constante duplicada.
   Ficam registrados: o limite de tentativas tem só teste unitário, e o teste da `0002` roda o SQL do arquivo direto.

## Arquivos
- **Criados:**
  - `src/infra/database/drizzle/migrations/0002_parties_v2.sql` e `meta/0002_snapshot.json`;
  - `src/infra/http/controllers/create-party/index.{no-dimension,arrival-zone}.controller.e2e-spec.ts`.
- **Alterados:**
  - `src/infra/http/presenters/party-presenter/index.ts`;
  - `src/infra/http/errors/domain-error-status.ts`;
  - `migrations/meta/_journal.json`;
  - e2e de `create-party`, `abandon-party`, `list-parties` e `drizzle-parties-repository`;
  - `test/parties-e2e.ts`, `test/content-app.ts`;
  - `client.http`, `docs/SPEC-BACKEND.md`.

## Como verificar
Docker com `postgres`, `npm run db:migrate`, `npm run start:dev` e depois os `curl` do roteiro (porta 3333).

## Problemas
- O dev usa `content/base`: o mapa da dimensão provisória tem só 2 zonas.

## Checks
- `npm test`: 446 testes verdes.
- `npm run test:e2e`: 37 arquivos, 122 testes verdes.
- `typecheck`, `lint`, `format`, `build` e `domain-guard --all`: OK.
- `drizzle-kit generate`: "No schema changes".

## Ponte com o frontend
Nenhuma ação agora. A FEAT-06 fica `implementado (BE)` ao fim da T-18, com os textos de `problems` no contrato.

## Commit sugerido
`feat/save v2 and match setup routes`
