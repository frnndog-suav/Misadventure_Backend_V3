---
name: mudar-spec
description: Altera um comportamento do backend começando pela spec (docs/SPEC-BACKEND.md) - cria ou edita REQ/D/T, incrementa a versão, confere tipos, códigos de erro, contrato, validador de cartas e conteúdo de teste - e só depois alinha testes e código. Use quando o autor quiser mudar uma regra, planejar uma FEAT do roadmap em REQs e tarefas, ou quando uma carta tiver um caso que o modelo atual não expressa.
argument-hint: descrição da mudança ou FEAT-nn
---

# /mudar-spec

Mudança pedida: **$ARGUMENTS**

A ordem é sempre **spec → aprovação → testes → código**.

## 1. Entender e localizar
1. Leia da spec as partes afetadas (Grep por IDs) e as seções do README envolvidas (Apêndice B incluso).
2. **Planejar uma FEAT:** leia a linha dela no `docs/ROADMAP.md` e as seções do README que ela cita. Transforme em REQs (Dado/Quando/Então com números do README/Apêndice A), Ds e tarefas T em ordem. Na primeira tarefa da FEAT, liste o que o contrato precisa ter.
3. Identifique o impacto: REQs, Ds, agregados, portas, códigos de erro, contrato, validador de cartas, conteúdo de teste, tarefas, schema do banco.
4. Mudança vinda de uma carta específica → **generalize** a regra.
5. **Mudança de regra do jogo** (não está no README) → não decida: mostre ao autor; se aprovada, ela vai para o Apêndice B do README (arquivo compartilhado: versão, histórico, AVISO DE FRONTEND).

## 2. Editar a spec
- Critérios Dado/Quando/Então, com números exatos e a seção do README citada.
- Próximo `REQ-xx`/`D-xx`/`T-xx` livre; nunca renumere.
- Tarefas: afeta `[x]` → tarefa nova de alinhamento; afeta só `[ ]` → ajuste o texto.
- Formato salvo muda → registre migração do Drizzle na tarefa.
- Incremente a versão; linha no histórico.

## 3. Mostrar e aguardar aprovação
Diff da spec + resumo de impacto (domínio, infra/banco, contrato, cartas, saves existentes). Se o contrato precisa mudar, diga que o próximo passo é `/contrato`. Espere.

## 4. Depois de aprovado
- Contrato afetado → `/contrato FEAT-nn` (antes de qualquer código).
- Tarefa nova → **/tarefa T-xx** (com autorização).
- Termine com **O que você faz agora**: commit sugerido (`tipo/descrição curta em minúsculas`) e se precisa ir ao frontend.
