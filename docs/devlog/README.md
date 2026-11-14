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
| 006 | T-05 | Persistência da config (`game_config`, primeira migração) | aguardando revisão |

## Como replicar
1. `CLAUDE.md` com a constituição (domínio puro, determinístico, hexagonal; contrato primeiro; AVISO DE FRONTEND; instruções do README III.1).
2. `docs/SPEC-BACKEND.md` com a arquitetura e a árvore de pastas (§3.2).
3. `.claude/hooks/domain-guard.mjs` + `.claude/settings.json` (PostToolUse em Edit/Write/MultiEdit).
4. Skills em `.claude/skills/`: `tarefa`, `mudar-spec`, `checar`, `testar`, `registrar-etapa`, `contrato`, `retorno-frontend`, `validar-cartas`.
5. Agentes em `.claude/agents/`: `test-writer`, `domain-dev`, `infra-dev`, `spec-reviewer`, `content-author`.
6. Reiniciar a sessão do Claude Code para carregar agentes e skills.
7. `docs/devlog/tempo.html`: registro de tempo (array `SESSOES`); a `/registrar-etapa` acrescenta a sessão de cada etapa, perguntando as horas ao autor.
8. Convenções do autor (2026-11-14): mensagem de commit sugerida sempre em inglês; Docker ligado só para testar e desligado ao terminar.
