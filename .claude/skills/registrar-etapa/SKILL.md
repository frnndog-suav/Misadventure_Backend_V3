---
name: registrar-etapa
description: Cria ou atualiza a entrada do devlog (docs/devlog/NNN-<id>-<slug>.md) de uma etapa - objetivo, decisões, passos e comandos, arquivos, como verificar, problemas, checks, ponte com o frontend e commit sugerido - e atualiza o índice. Use ao fim de cada tarefa (a /tarefa chama) e depois de qualquer trabalho fora das tarefas que mude configuração, dependências, contrato ou estrutura.
argument-hint: T-xx, FEAT-nn ou descrição da etapa
---

# /registrar-etapa

Etapa: **$ARGUMENTS**

O devlog existe para que **outra IA consiga replicar o projeto** lendo as entradas em ordem. Concreto, com comandos exatos e o porquê de cada decisão.

## Passos
1. Leia `docs/devlog/README.md` (formato e índice) e a última entrada.
2. Junte os fatos, sem inventar: `git status`, `git diff --stat` (inclua não rastreados); comandos executados (instalações com versão); decisões e onde estão na spec; versão do contrato; avisos de frontend emitidos; resultado real dos checks.
3. Número: o próximo `NNN`. Etapa com entrada já existente → acrescente "Revisão AAAA-MM-DD".
4. Crie a entrada no formato do README do devlog.
5. Atualize o índice (`aguardando revisão`). Marque como `concluída` as anteriores que já estão em commit (`git log --oneline -- docs/devlog`).
6. Se mudou agente, skill, guarda ou convenção, atualize **Como replicar**.

## Regras
- Datas absolutas (AAAA-MM-DD).
- Não copie código longo; aponte o arquivo. Comandos, por inteiro.
- Só **sugira** o commit (`tipo/descrição curta em minúsculas`).
- Nunca registre segredos (`.env`, senhas).
