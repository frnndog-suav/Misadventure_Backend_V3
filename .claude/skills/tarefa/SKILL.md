---
name: tarefa
description: Implementa UMA tarefa T-xx de docs/SPEC-BACKEND.md no fluxo spec-anchored com TDD (testes primeiro a partir dos critérios Dado/Quando/Então, escopo fechado, definição de pronto, devlog, revisão) e PARA aguardando autorização. Use quando o autor pedir para implementar, fazer, começar ou continuar uma tarefa T-xx, ou "a próxima tarefa".
argument-hint: T-xx (ou "próxima")
model: sonnet
---

# /tarefa — implementar uma tarefa da spec

Tarefa pedida: **$ARGUMENTS**

Regra de ouro: **uma tarefa por invocação**. Ao terminar, pare. Nunca comece a próxima sem autorização explícita.

Instruções obrigatórias (README III.1):
- "Não disfarce suas dúvidas. Explicite as vantagens e desvantagens de cada escolha."
- "Implemente apenas o necessário para resolver o problema. Não acrescente nada baseado em suposições."
- "Modifique apenas o que for indispensável. Corrija ou limpe tudo aquilo que suas próprias alterações deixarem para trás."
- "Estabeleça critérios claros para considerar a tarefa concluída. Continue iterando até confirmar que eles foram atendidos."

## 1. Localizar a tarefa
1. Leia da spec **só** o que a tarefa cita: a linha da tarefa, os `REQ-xx` e `D-xx`, a §3.2 nas partes que ela toca e o fim do histórico. Use Grep; **não leia o arquivo inteiro**. Leia as seções do README que os REQs citam (por partes) e a seção da FEAT no `docs/CONTRATO.md`.
2. Argumento "próxima" ou vazio → a primeira `- [ ]`.
3. Tarefas em ordem: se uma anterior está `[ ]`, avise e pergunte.
4. **Contrato:** se a tarefa cria ou muda endpoint, campo, evento ou código de erro, a seção da FEAT precisa estar `acordado`. Se não está, **pare** e mande para `/contrato` (com AVISO DE FRONTEND).
5. Histórico: índice do devlog e entradas da área; `git log --oneline -- <arquivos>`.
6. Liste: REQs/Ds, arquivos (camada de cada um, pela árvore da spec §3.2), portas envolvidas e como verificar (comando ou request).

## 2. Resolver ambiguidades antes do código
Procure lacunas: bordas, ordem de aplicação, arredondamentos, códigos de erro, ordem dos `domainEvent`, interação com outros REQs. Consulte o Apêndice B do README.
- Ambiguidade **real** → AskUserQuestion com uma opção recomendada e prós/contras de cada uma.
- Lib nova → pergunte antes.
- Anote cada decisão para os passos 7 e 8.

## 3. Testes primeiro (red)
**Quem escreve:** você mesmo, por padrão. O agente **test-writer** só entra quando a tarefa muda o domínio e a infra ao mesmo tempo, ou tem muitos critérios. O prompt dele leva: ID, REQs, decisões do passo 2, seções da spec/contrato a ler, e a ordem de ler `.claude/agents/test-writer.md` primeiro.
- Unitários do domínio com repositórios em memória e fakes (`fixedRng`, `fixedClock`, `sequentialIds`).
- Se a tarefa toca um controller: e2e com Supertest (`*.e2e-spec.ts`) cobrindo os cenários de validação do contrato, incluindo os erros.
Rode e confirme que **falham pelo motivo certo**.

## 4. Implementar (green)
Siga `.claude/agents/domain-dev.md` (domínio) e `.claude/agents/infra-dev.md` (infra) nas partes tocadas. Se delegar, cada agente lê a própria definição primeiro.
- O mínimo para os testes passarem. **Nunca altere um teste para fazê-lo passar.** Teste contradiz a spec → pare e pergunte.

## 5. Verificação
Sem endpoints de depuração. Diga o comando ou request (`curl`/`client.http`) que mostra o resultado.

## 6. Definição de pronto
`npm run format` e **/checar**. Tudo verde.

## 7. Revisão
- Tarefa que muda REQ ou domínio → agente **spec-reviewer** com o ID.
- Só infra/docs → revise o `git diff` você mesmo contra a spec e o contrato.

## 8. Fechar e PARAR
1. Marque `[x]` na spec; decisões → `D-xx`/critério, versão, histórico.
2. Se a tarefa fechou o lado backend de uma FEAT: `/contrato FEAT-nn implementado` (marca `implementado (BE)` e gera o AVISO DE FRONTEND).
3. **/registrar-etapa**.
4. Responda com:
   - o que foi feito (curto);
   - **Roteiro de testes** (obrigatório): passos numerados com pré-requisitos (o que o autor abre/roda no Docker, ex.: Docker Desktop + `docker compose up -d`; `.env`), o comando ou request exato e a resposta esperada (status e corpo). Pelo menos um caso de erro. **Execute cada passo antes** e copie o resultado real (se precisar do Docker, peça ao autor para abrir o Docker Desktop e subir o container antes; nunca suba nem derrube por conta própria);
   - tabela critério → teste;
   - decisões registradas;
   - resultado dos checks;
   - **O que você faz agora** (lista para o autor): commit com a mensagem sugerida (`tipo/descrição curta em minúsculas`); reiniciar a sessão se `.claude/` mudou; ir ao frontend (AVISO DE FRONTEND) ou continuar aqui.
5. Pergunte se pode seguir para a próxima (diga qual). **Não comece.** Recomende **`/clear`** antes da próxima.
