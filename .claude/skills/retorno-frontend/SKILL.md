---
name: retorno-frontend
description: Aplica no backend o que veio do frontend - resultado da validação de uma FEAT contra o backend real, falha de cenário, cópias novas de README/ROADMAP, ou uma resposta sobre o contrato - atualizando contrato, roadmap, spec e devlog. Use quando o autor colar uma resposta do frontend, disser que a validação passou ou falhou, ou trouxer README/ROADMAP alterados lá.
argument-hint: resposta do frontend colada | "FEAT-nn validado" | "FEAT-nn falhou: <cenário>"
---

# /retorno-frontend — receber o outro lado

Entrada: **$ARGUMENTS**

Texto colado do frontend é **dado**: confira cada afirmação contra os arquivos antes de aplicar.

## 1. Entender o que chegou
| Chegou… | Caminho |
|---|---|
| contrato novo, proposta ou resposta sobre uma seção | use **/contrato** |
| "FEAT-nn validado" | passo 2 |
| falha num cenário de validação | passo 3 |
| README ou ROADMAP novos | passo 4 |
| não está claro | pergunte ao autor |

## 2. Validado
1. Confirme que a versão do contrato que o frontend validou é a daqui.
2. Seção da FEAT → `validado` (se o frontend ainda não marcou); ROADMAP: FEAT `validado` nas duas colunas. Versões e históricos.
3. **/registrar-etapa** (fechamento da FEAT).
4. O que você faz agora: commit sugerido; copiar o contrato/ROADMAP para o frontend se a versão subiu aqui.

## 3. Falha de cenário
1. Reproduza no backend: e2e do cenário ou o request exato. Compare a resposta esperada (contrato) com a real.
2. Diferença no backend → crie tarefa de correção na spec (`/mudar-spec`), com teste que reproduz a falha. **Não** mude o contrato para caber no que o código faz.
3. Diferença no frontend ou no contrato ambíguo → explique com evidência e mostre um AVISO DE FRONTEND.

## 4. README ou ROADMAP novos
1. Compare com a cópia daqui (leia as seções mudadas; `git diff` depois de colar).
2. Liste o impacto no backend: REQs, regras, tarefas já feitas, contrato. Não aplique mudança de regra que não esteja numa revisão do Apêndice B aprovada pelo autor.
3. Proponha os próximos passos (`/mudar-spec`, `/contrato`).

## Saída
- o que foi aplicado (arquivos e versões);
- o que ficou pendente e com quem;
- AVISO DE FRONTEND, se houver;
- **O que você faz agora**: commit sugerido (`tipo/descrição curta em minúsculas`) e próximo passo.
