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
| 001 | T-01 | Ferramentas e esqueleto NestJS | aguardando revisão |

## Como replicar
1. `CLAUDE.md` com a constituição (domínio puro, determinístico, hexagonal; contrato primeiro; AVISO DE FRONTEND; instruções do README III.1).
2. `docs/SPEC-BACKEND.md` com a arquitetura e a árvore de pastas (§3.2).
3. `.claude/hooks/domain-guard.mjs` + `.claude/settings.json` (PostToolUse em Edit/Write/MultiEdit).
4. Skills em `.claude/skills/`: `tarefa`, `mudar-spec`, `checar`, `testar`, `registrar-etapa`, `contrato`, `retorno-frontend`, `validar-cartas`.
5. Agentes em `.claude/agents/`: `test-writer`, `domain-dev`, `infra-dev`, `spec-reviewer`, `content-author`.
6. Reiniciar a sessão do Claude Code para carregar agentes e skills.
