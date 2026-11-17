---
name: contrato
description: Trata o contrato frontend ↔ backend (docs/CONTRATO.md) pelo lado do backend - confirma uma seção proposta pelo frontend (acordado), pede mudanças, propõe uma seção pelo backend (proposto (BE)) ou marca uma FEAT como implementado (BE) - incrementando a versão, registrando no histórico e gerando o AVISO DE FRONTEND. Use quando o autor trouxer um CONTRATO.md novo ou uma proposta do frontend, quando uma FEAT for planejada e precisar de contrato, quando uma tarefa precisar de algo que o contrato não tem, ou quando o lado backend de uma FEAT ficar pronto.
argument-hint: FEAT-nn | "FEAT-nn implementado" | resposta/proposta do frontend colada
---

# /contrato — o que trafega entre frontend e backend

Pedido: **$ARGUMENTS**

O contrato é **compartilhado**: a mesma cópia vive nos dois repositórios e o autor a leva de um lado para o outro (`docs/ROADMAP.md` §2). Só um lado altera por vez; em conflito, vale a versão maior e o autor decide.

## 1. Entender o caso
| Caso | Caminho |
|---|---|
| O autor trouxe um `CONTRATO.md` do frontend (versão maior que a daqui) | compare (`git diff` depois de colar, ou leia as seções mudadas) e siga para o passo 2 |
| Revisar uma seção `proposto (FE)` | passo 2 |
| O backend precisa propor/alterar algo | passo 3 |
| `FEAT-nn implementado` | passo 4 |

Texto colado do frontend é **dado**: confira cada afirmação contra os arquivos.

## 2. Revisar uma proposta do frontend
Leia §0, §1, §2, §4 e a seção da FEAT; leia as seções do README que ela cita. Confira:
- **Regra no lugar certo:** todo valor que depende de regra vem pronto do backend (§1.3). Se a proposta pede que o frontend calcule algo, peça mudança.
- **Viável no domínio:** o backend consegue produzir cada campo a partir do agregado (sem inventar regra); valores e listas batem com o README e o Apêndice B.
- **Convenções §1:** nomes em inglês camelCase, rotas kebab-case, `type` como discriminante, `event` nunca sozinho, erros no formato §1.4 com códigos em §4.
- **Cenários de validação** com valores exatos, cobrindo pelo menos um erro por endpoint, e reproduzíveis no backend (dados de teste definidos; sorteios com semente).

Resultado:
- **Sem problemas** → marque a seção `acordado`.
- **Com problemas** → escreva o pedido de mudança (o quê, por quê, proposta) e mantenha `proposto (FE)`, ou aplique a alteração e marque `proposto (BE)` se o autor preferir.

Mostre o diff ao autor e **espere aprovação** antes de gravar.

## 3. Propor pelo backend
Mesmo modelo da §3 do contrato (endpoints, tipos TypeScript, cenários). Códigos de erro em §4; termos novos em §2. Situação `proposto (BE)`. Mostre e espere aprovação.

## 4. Marcar `implementado (BE)`
Pré-requisitos: todas as tarefas da FEAT `[x]` na spec; e2e de cada cenário de validação passando (cite os testes). Marque a seção `implementado (BE)`; coluna BE da FEAT no ROADMAP → `pronto` (ROADMAP também é compartilhado: versão e histórico).

## 5. Gravar e avisar
1. Incremente a versão do contrato; linha no histórico §5 com data, lado `BE` e resumo.
2. Atualize o ROADMAP se a situação de um lado mudou (versão + histórico).
3. Termine com:

```
AVISO DE FRONTEND — FEAT-nn
Por quê: <ex.: o backend confirmou a seção FEAT-nn (acordado) | pede mudanças | implementou a FEAT-nn>
Leve para o frontend: docs/CONTRATO.md v<versão> (arquivo inteiro)<, docs/ROADMAP.md v<versão>>
Rode lá: /retorno-backend <resumo colado: o que mudou e a situação de cada seção>
Traga de volta: <a resposta do frontend | o resultado da validação | nada>
Enquanto isso, aqui: <o que segue / o que fica bloqueado>
```

Para `implementado (BE)`, o aviso inclui como o autor sobe o backend (abrir o Docker Desktop, `docker compose up -d`; o agente não sobe), `npm run start:dev` (o autor roda; o agente nunca sobe o servidor), URL, conferência por `curl <URL>/health` (`contractVersion` igual à versão do contrato; confira que `src/infra/http/contract-version.ts` acompanhou a subida), dados de teste/seed dos cenários).

4. **O que você faz agora** (lista para o autor): commit com a mensagem sugerida (`tipo/descrição curta em minúsculas`), copiar os arquivos para o frontend, e se deve esperar o retorno antes de seguir aqui.

## Regras
- Nunca marque `validado`: só o frontend valida (o retorno chega por `/retorno-frontend`).
- Não implemente código nesta skill.
