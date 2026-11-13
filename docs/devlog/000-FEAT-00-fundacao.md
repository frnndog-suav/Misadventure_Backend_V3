# 000 — FEAT-00 — Fundação: agentes, skills, guardas, spec

- **Data:** 2026-11-13
- **Status:** aguardando revisão
- **Spec:** 0.1 · **Contrato:** 0.2 · **Roadmap:** 0.2

## Objetivo
Montar o sistema de trabalho do backend (spec-anchored, TDD, uma etapa por vez) seguindo `docs/PROMPT-AGENTES-E-SKILLS.md` (fases 1 a 4), adaptado a um motor de regras autoritativo em NestJS + DDD/hexagonal, com a organização do projeto de referência do autor (NestJS + DDD) registrada na spec. Nenhum código, nenhuma instalação.

## Decisões
- **D-02** domínio em classes `Entity`/`AggregateRoot` com portas (`Rng`, `Clock`, `IdGenerator`); sem registro global de eventos (`pullDomainEvents()`); casos de uso sem decorators do Nest. Desvios conscientes em relação à referência: lá o `UniqueEntityID` gera UUID, `DomainEvents` é estático global e os casos de uso usam `@Injectable` — os três quebram determinismo ou pureza.
- **D-03** PostgreSQL via Drizzle; e2e com schema isolado por execução (padrão do `setup-e2e` da referência).
- **D-04** cartas todas versionadas em `content/`.
- **D-01** códigos de erro = CONTRATO §4.
- Módulos: Núcleo + ponte com o frontend + Conteúdo reduzido (`/validar-cartas`, `content-author`). Sem UI/Visual. `/converter-<fonte>` e `/padronizar-texto` ficam para quando houver fonte externa de cartas.
- Agentes de desenvolvimento separados por camada: `domain-dev` (core/domain) e `infra-dev` (Nest/Drizzle/HTTP/Docker).
- Contrato §1 e §2 confirmados sem mudanças (`acordado`, v0.2).

## Passos e comandos
1. Leitura: `docs/PROMPT-AGENTES-E-SKILLS.md`, README Parte II, III e Apêndice B, ROADMAP, CONTRATO, projeto de referência (árvore, `package.json`, configs, core, um caso de uso, um controller, `database.module.ts`, `setup-e2e.ts`) e o `CLAUDE.md` + skills de ponte do frontend (para espelhar o aviso).
2. Perguntas ao autor: estilo do domínio, conteúdo versionado, banco, confirmação do contrato.
3. Geração dos arquivos abaixo.
4. Verificação:
   - `grep -rn "{{" CLAUDE.md .claude docs/SPEC-BACKEND.md docs/devlog` → nenhum.
   - `node .claude/hooks/domain-guard.mjs --all` → "src/core e src/domain ainda não existem; nada a checar." (exit 0).
   - Arquivo temporário `src/domain/_guardtest/bad.ts` com `any`, `Math.random()` e import de `@nestjs/common` → `--all` exit 1 com 3 violações; modo hook (JSON no stdin, caminho absoluto Windows, `D:/…` e relativo) exit 2. Arquivo limpo → exit 0. Pasta temporária apagada.

## Arquivos
- Criados: `CLAUDE.md`, `docs/SPEC-BACKEND.md`, `docs/devlog/README.md`, `docs/devlog/000-FEAT-00-fundacao.md`, `.claude/settings.json`, `.claude/hooks/domain-guard.mjs`, `.claude/skills/{tarefa,mudar-spec,checar,testar,registrar-etapa,contrato,retorno-frontend,validar-cartas}/SKILL.md`, `.claude/agents/{test-writer,domain-dev,infra-dev,spec-reviewer,content-author}.md`.
- Alterados (compartilhados): `docs/CONTRATO.md` 0.1 → 0.2 (§1, §2 `acordado`; histórico); `docs/ROADMAP.md` 0.1 → 0.2 (FEAT-00 BE `pronto`; histórico).

## Como verificar
Reiniciar o Claude Code; `/` lista as 8 skills; `node .claude/hooks/domain-guard.mjs --all` responde sem erro.

## Problemas
- O hook usava `CLAUDE_PROJECT_DIR` para achar a raiz; no Git Bash do Windows a variável pode vir como `/d/...`, que o Node resolve errado. Solução: a raiz é derivada do caminho do próprio script (`import.meta.url`).
- Testes do hook com JSON escrito no shell quebravam pelas barras invertidas; o teste final usou um script Node que gera o JSON.

## Checks
- Placeholders: 0. Frontmatter: 13/13 com `name` igual à pasta/arquivo. Guarda: os dois modos conferidos (acima).

## Ponte com o frontend
AVISO DE FRONTEND emitido: levar `docs/CONTRATO.md` v0.2 e `docs/ROADMAP.md` v0.2.

## Commit sugerido
`chore/backend foundation with agents, skills and spec`
