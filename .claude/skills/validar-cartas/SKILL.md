---
name: validar-cartas
description: Valida um arquivo de cartas em content/ (ou test/fixtures/content/) contra o schema e as regras de integridade da spec - ids únicos, referências que existem, valores dentro das faixas do README, categorias e etiquetas conhecidas - e explica como corrigir cada problema. Use quando o autor pedir para validar, checar ou revisar cartas, ou depois de escrever ou alterar um arquivo de conteúdo.
argument-hint: caminho/do/arquivo.json
---

# /validar-cartas

Arquivo: **$ARGUMENTS** (vazio → pergunte e sugira os arquivos de `content/`).

## 1. Rodar
`npm run validate:content -- <arquivo>` (sai com código 1 só quando há erro).
Se o validador ainda não existe (antes da FEAT-04), diga isso e pare: a regra é não validar "de olho".

## 2. Interpretar
Agrupe por carta (id); separe **erros** (bloqueiam) de **avisos**. Para cada um, causa provável e correção:

| Problema | Causa comum | Correção |
|---|---|---|
| *(preenchida com os códigos reais do validador na FEAT-04)* | | |

## 3. Regras
- Carta que não cabe no modelo: **não force** com gambiarra no dado. Descreva o caso de forma genérica e sugira **/mudar-spec**.
- Termos devem seguir o glossário (CONTRATO §2 e README 2.2).
- Só corrija o arquivo se o autor pedir; por padrão, relate.
- Ao final: **O que você faz agora** (commit sugerido se algo foi corrigido).
