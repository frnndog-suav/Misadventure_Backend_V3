# AGENTS.md — instruções para o Codex no backend

Este arquivo define como trabalhar no backend do Misadventures. `docs/` reúne o conhecimento técnico compartilhado e o progresso do desenvolvimento. Mantenha as regras, os requisitos, o contrato, o planejamento e o histórico técnico nos documentos correspondentes.

## Gestão de contexto

- Use este arquivo como única diretriz operacional do projeto. Restrinja a exploração aos documentos em `docs/` e aos arquivos de código, testes e configuração necessários para a tarefa.
- Exclua das buscas as instruções, configurações e automações de outros assistentes. Não leia nem execute esses arquivos em nenhuma fase, mesmo quando citados em `docs/`.
- Prefira buscas direcionadas e leia apenas as seções pertinentes. Busque por `FEAT-nn`, `T-xx`, `REQ-xx`, `D-xx` ou pelo nome da área usando `rg`. Limite a saída de buscas, diffs e logs ao que ajuda a resolver a tarefa.
- Reutilize o contexto disponível. Releia um trecho quando houver mudança, lacuna concreta ou perda de contexto.
- Trabalhe com um único agente por padrão. Delegue somente quando o autor solicitar.

## Mapa de consultas pontuais

| Fonte | Quando consultar |
| --- | --- |
| `docs/SPEC-BACKEND.md` | Requisitos, decisões, arquitetura e critérios da tarefa. |
| `docs/README.md` | Seções das regras afetadas e decisões registradas no Apêndice B. |
| `docs/CONTRATO.md` | Situação da FEAT e convenções antes de alterar rotas, campos, eventos ou erros expostos ao frontend. |
| `docs/ROADMAP.md` | Planejamento da FEAT e protocolo da ponte entre repositórios (§2). |
| `docs/devlog/README.md` e entrada da área | Histórico, formato do registro e ponto de retomada antes de alterar funcionalidade. |

Use o mapa para selecionar as consultas da tarefa e mantenha o conteúdo técnico nos documentos de origem.

## Exploração do repositório

- Identifique o módulo e o conjunto mínimo de arquivos. Inspecione a implementação e os testes relacionados antes de editar. Consulte o histórico dos arquivos envolvidos com `git log --oneline -- <arquivos>` quando útil.
- Amplie a exploração somente quando uma dependência ou dúvida concreta exigir.
- Ao retomar, use o contexto e as alterações locais. Consulte o registro pertinente se necessário e preserve as mudanças cuja autoria não estiver confirmada.

## Convenções de implementação

- Siga as convenções de nomes existentes e as decisões documentadas na spec.
- O backend é autoritativo. Valide as intenções dos jogadores, aplique as regras e devolva estado, valores calculados e ações disponíveis conforme o contrato.
- Preserve a arquitetura hexagonal em TypeScript. Mantenha `src/core/` e `src/domain/` puros e determinísticos, com RNG semeado, relógio e IDs por portas. Mantenha NestJS, Drizzle e adaptadores em `src/infra/`.
- Proteja invariantes nos agregados e preserve a ordem dos eventos de domínio. Retorne erros de domínio como valores e traduza os erros públicos conforme o contrato.
- Reutilize portas, casos de uso e adaptadores existentes. Mantenha as cartas em `content/` e use o catálogo e a configuração para acessar dados e valores do jogo.

## Controle de escopo

- Faça apenas o necessário para a tarefa. Evite refatorações sem relação com o pedido e use os registros existentes quando precisar documentar a etapa.
- Preserve as alterações locais do autor. O autor faz os commits.
- Trabalhe em uma tarefa por vez. Mudanças de regra, mudanças na spec e avanço para outra tarefa exigem autorização do autor.
- Pergunte quando uma ambiguidade real impedir a execução correta.

## Execução

1. Confirme a tarefa, os critérios de conclusão e o procedimento aplicável usando este arquivo e consultas pontuais a `docs/`. Se faltar orientação indispensável, diga ao autor qual é a lacuna e aguarde antes de escrever testes ou editar código que dependam dela.
2. Identifique os arquivos mínimos necessários.
3. Inspecione as implementações e os testes relacionados. Consulte a seção do contrato quando a tarefa afetar a interface pública e obtenha o acordo antes de implementar a mudança.
4. Se a mudança alterar comportamento, confirme os critérios Dado / Quando / Então na spec. Se a spec precisar mudar, obtenha aprovação antes de escrever os testes e o código correspondentes.
5. Para critérios novos ou alterados, escreva primeiro os testes com o ID do requisito e peça ao autor que confirme a falha esperada. Implemente a menor solução completa, peça ao autor que execute os testes afetados e faça as demais validações pertinentes. Em alterações de domínio, confira os limites de dependência e o determinismo. Respeite o procedimento de operação do ambiente local nas etapas que dependam de serviços.
6. Registre a etapa de desenvolvimento no devlog conforme o formato existente. Inclua arquivos alterados, verificações e resultados, pendências e, quando aplicável, um roteiro com resultados esperados e um caso de borda.
7. Ao final de cada implementação, sugira um commit curto em inglês e em minúsculas, no formato `tipo/descrição`, sem dois-pontos. Use o prefixo adequado à mudança e inclua os IDs definidos para a tarefa conforme o histórico do backend, como `feat/activate resource effects in prepare (t-38)` ou `docs/feat-11 contract agreed (contract v0.51)`. O autor faz o commit.

## Operação do ambiente local

- Somente o autor executa comandos do Docker e do Docker Compose, inclusive consultas de status e logs. Somente o autor inicia, reinicia ou para o Docker, os containers e a aplicação do backend deste projeto. O Codex não executa essas ações, inclusive por meio de scripts, testes, automações ou ferramentas que as acionem indiretamente.
- Antes de uma etapa que dependa do ambiente, avise o autor quais serviços precisam estar disponíveis, por quê e em que ordem. Aguarde a confirmação do autor antes de executar a parte dependente. Quando a verificação exigir a API, o Codex pode consultar `GET /health` após a confirmação de que o autor iniciou o backend.
- Ao concluir a última verificação que usa o ambiente, avise o autor quais serviços já podem ser parados. Se houver validação integrada em andamento ou pendente na mesma sessão, indique quais serviços precisam continuar rodando até o retorno.

## Coordenação com o frontend

- Somente o autor executa testes do projeto backend. O Codex jamais os executa, inclusive por ferramentas, scripts ou automações. Quando precisar de um teste, avise o autor, indique o comando ou cenário e o resultado esperado, e aguarde o retorno antes de prosseguir com o trabalho que depende do teste.
- Somente o autor executa testes do projeto frontend. O Codex jamais os executa, inclusive por meio de scripts, automações ou ferramentas. Quando precisar de um teste no frontend, avise o autor, indique o cenário e o resultado esperado e aguarde o retorno antes de prosseguir com a parte que depende desse teste.
- Trabalhe neste repositório. O autor leva as propostas, os arquivos, os avisos e os resultados entre os lados. Consulte `docs/ROADMAP.md` §2 para sincronização e conflitos.
- Confira a situação da seção em `docs/CONTRATO.md` §0. Ao receber uma proposta do frontend, confira sua compatibilidade com a spec e as regras. Confirme o acordo ou devolva os pontos a ajustar. Para uma proposta do backend, solicite a confirmação do frontend pelo autor. Implemente a interface após o acordo e marque `implementado (BE)` depois da entrega e dos testes do backend.
- O autor disponibiliza o backend real para a validação no frontend. Registre `validado` e feche a FEAT somente após receber a confirmação de que os cenários do contrato passaram.
- Ao alterar `docs/README.md`, `docs/ROADMAP.md` ou `docs/CONTRATO.md`, incremente a versão e registre a mudança no histórico do arquivo. O autor copia o arquivo inteiro para o outro repositório.
- Termine a resposta com um **Aviso de frontend** copiável quando houver proposta ou alteração de contrato, mudança em documento compartilhado, dependência do frontend, entrega pronta para validação integrada ou divergência de validação que exija revisão do frontend. Pause a parte que depende de acordo ou retorno e avance no trabalho independente da mesma tarefa.
- Quando a resposta incluir um Aviso de frontend, coloque um rótulo em negrito e em linha própria imediatamente acima de cada comando ou prompt copiável. Para comandos de terminal, use **EXECUTE NO TERMINAL DO BACKEND** ou **EXECUTE NO TERMINAL DO FRONTEND** e informe o diretório de execução. Para prompts, use **COLE NO CHAT DO BACKEND** ou **COLE NO CHAT DO FRONTEND**. Indique o destino pela ação que o autor vai realizar, mesmo quando um teste do frontend usar a API do backend.
- Coloque os comandos e prompts do backend antes do Aviso de frontend. Dentro do aviso, coloque os comandos e prompts do frontend junto ao cenário correspondente.
- Quando não houver medição, deixe as horas a preencher no devlog e use `null` para a duração no registro de tempo da sessão, quando aplicável. O autor fecha o registro de tempo.

> **Aviso de frontend — FEAT-nn**
>
> - **Motivo** — O que mudou ou precisa de decisão.
> - **Levar** — Arquivos, versões e seções pertinentes e, quando aplicável, URL do backend e dados de teste.
> - **Executar no frontend** — Revisão ou cenários contra o backend real, com os resultados esperados. Se houver comando ou prompt copiável, use **EXECUTE NO TERMINAL DO FRONTEND** ou **COLE NO CHAT DO FRONTEND** imediatamente acima dele.
> - **Trazer de volta** — Confirmação, resultados ou divergências com cenário, resultado esperado e resultado observado.
> - **Situação no backend** — O que pode seguir e o que depende do retorno.

## Retomada e chamada de tarefas

- Use um chat por etapa, incluindo implementação, testes e ajustes da mesma tarefa. Abra outro chat para uma etapa independente.
- Quando o autor indicar que está começando o dia de trabalho, quando uma etapa for concluída ou quando ele pedir o ponto atual, inclua um prompt curto e copiável para retomada. Confirme a próxima tarefa no roadmap, na spec ou no devlog e aguarde autorização para iniciá-la. Quando houver um Aviso de frontend, deixe-o por último.
- Use os IDs e o ponto de retomada confirmados. Identifique o prompt com **COLE NO CHAT DO BACKEND**. Omita decisões que não se aplicam e deixe campos a preencher quando a informação ainda não estiver definida.

> **COLE NO CHAT DO BACKEND — Prompt de retomada**
>
> Implemente a `T-xx`. Consulte os critérios de `REQ-xx` e a decisão `D-yy` aplicável. Retome de <entrada do devlog ou ponto atual>. Peça ao autor que execute os testes afetados, registre a etapa e entregue o roteiro de verificação.
