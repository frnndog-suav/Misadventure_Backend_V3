# 002 — Registro de tempo de desenvolvimento

- **ID:** tempo (fora das tarefas) · **Data:** 2026-11-14 · **Status:** aguardando revisão
- **Spec:** v0.3 · **Contrato:** v0.4

## Objetivo

Adotar no backend o registro de tempo criado no frontend: `docs/devlog/tempo.html` (página estática que soma as sessões do array `SESSOES` e mostra totais por etapa), adaptado a este repositório, e a skill `/registrar-etapa` passando a registrar a sessão de cada etapa.

## Decisões

- As sessões pré-preenchidas foram **estimadas pelos commits deste repositório** (`git log --date=iso`): 2026-11-13 com 1 commit (20:48, FEAT-00) → 1 h chutada; 2026-11-14 (contrato v0.4 + T-01, janela 00:49–01:09) → `horas: null`, porque a janela de commits subestima a sessão. O autor corrige os valores.
- `horas: null` fica fora do total (comportamento herdado do arquivo do frontend, sem mudanças na lógica).

## Passos e comandos

1. Copiado `docs/devlog/tempo.html` do frontend (trazido pelo autor).
2. Adaptado: título e subtítulo "(backend)", comentário de cabeçalho, array `SESSOES` zerado e pré-preenchido pelas janelas de commit locais.
3. `.claude/skills/registrar-etapa/SKILL.md`: novo passo 7 — perguntar as horas ao autor (AskUserQuestion) e acrescentar/atualizar a linha da sessão em `tempo.html` (`null` se ainda não souber; mesma data+etapa → atualizar, não duplicar).

## Arquivos

Criados: `docs/devlog/tempo.html`, esta entrada. Alterados: `.claude/skills/registrar-etapa/SKILL.md`, `docs/devlog/README.md` (índice e Como replicar).

## Como verificar

Abrir `docs/devlog/tempo.html` no navegador: cartões de total/dias/período e as duas sessões (13/11 com 1 h; 14/11 sem horas, fora do total).

## Problemas

Nenhum.

## Checks

Só docs e skill; nenhum comando de código afetado. (`tempo.html` e `docs/` estão no `.prettierignore` — formatação não os toca.)

## Ponte com o frontend

Nenhum aviso: o arquivo veio **do** frontend e a adaptação é local; nada para levar de volta.

## Commit sugerido

`docs/registro de tempo (tempo.html) e passo na skill registrar-etapa`
