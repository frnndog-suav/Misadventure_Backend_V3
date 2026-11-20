# Devlog

Registro de cada etapa, escrito para que **outra IA consiga replicar o projeto** lendo as entradas em ordem.

## Formato de uma entrada (`NNN-<ID>-<slug>.md`)
- **Cabeçalho:** ID (T-xx ou FEAT-nn), data (AAAA-MM-DD), status (`aguardando revisão` | `concluída`), versão da spec, versão do contrato.
- **Objetivo**
- **Decisões** (e onde estão na spec: `D-xx`, `REQ-xx`)
- **Passos e comandos** (comandos completos, instalações com versão)
- **Arquivos** (criados / alterados)
- **Como verificar** (comandos, requests e respostas esperadas)
- **Problemas** (e como foram resolvidos)
- **Checks** (resultado real, com números)
- **Ponte com o frontend** (avisos emitidos, versões levadas)
- **Commit sugerido**

## Índice
| Nº | ID | Título | Status |
|---|---|---|---|
| 000 | FEAT-00 | Fundação: agentes, skills, guardas, spec | concluída |
| 001 | T-01 | Ferramentas e esqueleto NestJS | concluída |
| 002 | tempo | Registro de tempo (tempo.html) | concluída |
| 003 | T-02 | Docker Compose, env e base do Drizzle | concluída |
| 004 | T-03 | `GET /health`, filtro de erros e CORS | concluída |
| 005 | T-04 | Domínio `GameConfig` (laboratório) | concluída |
| 006 | T-05 | Persistência da config (`game_config`, primeira migração) | concluída |
| 007 | T-06 | Rotas do laboratório (`/lab/config`) e FEAT-03 `implementado (BE)` | concluída |
| 008 | retorno | FEAT-03 `validado` pelo frontend (CONTRATO v0.9, ROADMAP v0.11) | concluída |
| 009 | T-07 | Domínio do catálogo (FEAT-04): tipos, integridade, porta, casos de uso | concluída |
| 010 | T-08 | Conteúdo e validador (FEAT-04): schema, leitor, `validate:content`, fixture, coleção `base` | concluída |
| 011 | T-09 | Rotas do catálogo (`/catalog/*`) e FEAT-04 `implementado (BE)` | concluída |
| 012 | T-10 | Core: agregado, eventos, portas e RNG sfc32 | concluída |
| 013 | T-11 | Domínio `campaign`: `Party`, saves, sessão, casos de uso | concluída |
| 014 | T-12 | Persistência do save (`parties`) e adaptadores Clock/Ids/Seed | concluída |
| 015 | T-13 | Rotas da campanha (`/parties`) e FEAT-05 `implementado (BE)` | concluída |
| 016 | retorno | FEAT-05 `validado` (CONTRATO v0.17, ROADMAP v0.21) | concluída |
| 017 | retorno | ROADMAP v0.22 (FEAT-30, só FE) | concluída |
| 018 | T-19 | Domínio do editor (FEAT-31): portas, 15 casos de uso, erros, fakes | concluída |
| 019 | T-20 | Armazenamento em arquivo (FEAT-31): `FileContentStore`, parser Zod, textos D-49 | concluída |
| 020 | T-21 | Rotas do editor (FEAT-31): 15 controllers, presenters, filtro; CONTRATO v0.23 `implementado (BE)` | concluída |
| 021 | FEAT-31-validada | Validação pelo frontend: CONTRATO v0.24 e ROADMAP v0.28 com a FEAT-31 `validado` | concluída |
| 022 | T-14 | Domínio do catálogo e config (FEAT-06): `arrowLayout`, Dimensão, classes, trava, REQ-26 | concluída |
| 023 | T-15 | Conteúdo, leitor e `GET /catalog/classes` (FEAT-06): `class.json`, fixture e base | concluída |
| 024 | T-16 | Domínio da preparação (FEAT-06): gerador do mapa, ordem D20, jogador inicial, `CreateParty` | concluída |
| 026 | T-18 | Editor da FEAT-06: classes, Carta de Dimensão, conteúdo em uso; CONTRATO v0.25 `implementado (BE)` | concluída |
| 027 | FEAT-06-validada | Validação pelo frontend: CONTRATO v0.26 e ROADMAP v0.31 com a FEAT-06 `validado` | concluída |
| 025 | T-17 | Save v2 e rotas da preparação (FEAT-06): migração `0002`, presenter, `DIMENSION_INVALID`, e2e | concluída |
| 028 | T-22 | Domínio do Movimentar (FEAT-07): `connectedZones`, `parsePartyAction`, `Party.move`, `TakePartyActionUseCase` | concluída |
| 029 | T-23 | Rota de ações (FEAT-07): `POST /parties/:partyId/actions`, `moveTargets`, erros de ação no filtro | concluída |
| 030 | T-24 | Domínio da vez (FEAT-08): `PartyTurn`, `Party.endTurn`, custo do `move`, `availableActions` | concluída |
| 031 | T-25 | Save v3 e rota da vez (FEAT-08): mapper v3 com leitura de v2, `turn` e `availableActions` no `Party`, `implementado (BE)`; FEAT-08 `validado` | concluída |
| 032 | T-26 | Domínio do deck (FEAT-09): config REQ-60, `starterDeckCopyLimit`, pasta, `Party.recover`/`adjustDeck`; mapper v4 adiantado | concluída |
| 033 | T-27 | Rota do deck (FEAT-09): presenter com build e pasta, e2e de REQ-60 a REQ-68, `client.http`, `implementado (BE)`; FEAT-09 `validado` | concluída |
| 034 | T-28 | Domínio de inventário, equipar e bolsa (FEAT-10): config REQ-69, inventário e equipamentos, `effectiveModifiers`, `Party.prepare`/`grant`, doação; mapper v5 adiantado | concluída |
| 035 | T-29 | Save v5, rotas e conteúdo de teste (FEAT-10): presenter com inventário/equipamentos/efetivos (D-81), rota de doação, 5 cartas na fixture, e2e; ouro de save antigo limitado (D-79); FEAT-10 `implementado (BE)`; FEAT-10 `validado` | concluída |
| 036 | T-30 | Conteúdo da FEAT-32: ferramentas (`toolKind`, `scavengeZoneTypes`), coletáveis (`scavengeTool`), `rewardDecks` na Carta de Dimensão, validação no boot e no editor, `CONTENT_REFERENCED` por deck de recompensas (D-91); fixture com 3 itens novos | concluída |
| 037 | T-31 | Domínio do cofre e do limbo (FEAT-32): config REQ-80, `Party.useVault` com 9 operações, `applyVaultOperations`, parser, eventos, `availableActions`; mapper v6 adiantado (D-92) | concluída |
| 038 | T-32 | Domínio do deck de recompensas e do Vasculhar (FEAT-32): `assembleRewardDecks`, `scavengeTargets`, `Party.scavenge`, `lastScavenge`, evento `Scavenged`, parser, `availableActions`; mapper v6 adiantado (D-93) | concluída |
| 039 | T-33 | FEAT-32 ponta a ponta: `PartyPresenter` com cofre, capacidades, `scavengeTargets`, `lastScavenge` e ações de zona; e2e da FEAT-32; mapper v6 testado; CONTRATO v0.47 `implementado (BE)` (D-94) | concluída |
| 040 | FEAT-32 | FEAT-32 validada pelo frontend: CONTRATO v0.48 `validado`, ROADMAP v0.53 | concluída |
| 041 | T-34 | Catálogo de variações de efeitos (FEAT-11): `docs/EFEITOS-CATALOGO.md` v0.1, validado provisoriamente pelo autor na v1.0 | concluída |
| 042 | FEAT-11 | Contrato da FEAT-11 proposto na v0.49 e acordado na v0.51 | concluída |
| 043 | T-35 | Domínio do modelo de efeitos (FEAT-11): tipos por `kind`, regras de REQ-99 em `checkCatalogIntegrity`, citação ao publicar, D-103; infra de conteúdo vermelha até a T-36 | concluída |
| 044 | T-36 | Conteúdo, schema e exibição (FEAT-11): `effect-schemas.ts` (espelho das 4 uniões), conversão de `content/` e da fixture (24 cartas, D-101), e2e do catálogo e do editor; D-104; reescrita de `base.misty-forest` pelo autor | concluída |
| 045 | T-37 | Passivos e status em `effectiveModifiers`, expiração por vez, rodada e movimento (REQ-102, REQ-103, D-105) | concluída |
| 046 | T-38 | Preparar: ativação, pagamento atômico, efeitos e ações disponíveis, status em memória (REQ-101, REQ-104 a REQ-107, D-106) | concluída |
| 047 | T-39 | FEAT-11 ponta a ponta: ativação HTTP, save v7, projeção de efeitos e status, Supertest, CONTRATO v0.52 e ROADMAP v0.54 | aguardando revisão |
| 048 | FEAT-12 | Contrato de eventos aleatórios e configuração do laboratório acordados, CONTRATO v0.57 e ROADMAP v0.58 | concluída |
| 049 | T-40 | [Configuração do laboratório, catálogo e decks mistos](049-T-40-configuracao-catalogo-e-decks.md) | concluída |
| 050 | T-41 | [Domínio e ações do encontro](050-T-41-encontros-aleatorios.md) | concluída |
| 051 | T-42 | [Recompensas pendentes e Vasculhar](051-T-42-recompensas-e-vasculhar.md) | concluída |
| 052 | T-43 | [Save e ações HTTP da FEAT-12](052-T-43-save-e-http.md) | concluída |
| 053 | T-44 | [Critérios e proposta de contrato do combate solo](053-T-44-combate-solo.md) | concluída |

## Como replicar
1. `CLAUDE.md` com a constituição (domínio puro, determinístico, hexagonal; contrato primeiro; AVISO DE FRONTEND; instruções do README III.1).
2. `docs/SPEC-BACKEND.md` com a arquitetura e a árvore de pastas (§3.2).
3. `.claude/hooks/domain-guard.mjs` + `.claude/settings.json` (PostToolUse em Edit/Write/MultiEdit).
4. Skills em `.claude/skills/`: `tarefa`, `mudar-spec`, `checar`, `testar`, `registrar-etapa`, `contrato`, `retorno-frontend`, `validar-cartas`.
5. Agentes em `.claude/agents/`: `test-writer`, `domain-dev`, `infra-dev`, `spec-reviewer`, `content-author`.
6. Reiniciar a sessão do Claude Code para carregar agentes e skills.
7. `docs/devlog/tempo.html`: registro de tempo (array `SESSOES`); a `/registrar-etapa` acrescenta a sessão de cada etapa, perguntando as horas ao autor.
8. Convenções do autor (2026-11-14): mensagem de commit sugerida sempre em inglês; Docker ligado só para testar e desligado ao terminar. Revisão 2026-11-15: o Docker é manual (o autor abre o Docker Desktop e sobe/para containers; o agente só pede e confere com `docker compose ps`).
9. No Codex, siga a seção **Operação do ambiente local** de `AGENTS.md`. As horas ficam a preencher pelo autor.
