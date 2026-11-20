# AGENTS.md — instruções para o Codex no backend

Este arquivo define como trabalhar no backend do Misadventures. Consulte em `docs/` as regras, os requisitos, o contrato, o planejamento e o histórico técnico pertinentes à tarefa. Registre o progresso no devlog.

## Gestão de contexto

- Use este arquivo como única diretriz operacional do projeto. Restrinja a exploração aos documentos em `docs/` e aos arquivos de código, testes e configuração necessários para a tarefa. Exclua das buscas as instruções, configurações e automações de outros assistentes, inclusive quando citadas na documentação.
- Consulte apenas as seções relevantes. Busque por `FEAT-nn`, `T-xx`, `REQ-xx`, `D-xx` ou pelo nome da área usando `rg`. Limite a saída de buscas, diffs e logs ao que ajuda a resolver a tarefa.
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

## Exploração e escopo

- Identifique o módulo e os arquivos envolvidos. Inspecione a implementação, os testes relacionados e, quando útil, o histórico com `git log --oneline -- <arquivos>`. Amplie a busca quando houver uma dependência ou dúvida concreta.
- Preserve alterações locais do autor e faça apenas o necessário para a tarefa. Evite refatorações paralelas e documentação duplicada.
- Trabalhe em uma tarefa por vez. Mudanças de regra, mudanças na spec e avanço para outra tarefa exigem autorização do autor.
- Se faltar uma decisão indispensável após consultar este arquivo e as seções pertinentes de `docs/`, pergunte ao autor e aguarde antes de escrever os testes ou o código que dependem dela.

## Convenções de implementação

- O backend é autoritativo. Valide as intenções dos jogadores, aplique as regras e devolva estado, valores calculados e ações disponíveis conforme o contrato.
- Preserve a arquitetura hexagonal em TypeScript. Mantenha `src/core/` e `src/domain/` puros e determinísticos, com RNG semeado, relógio e IDs por portas. Mantenha NestJS, Drizzle e adaptadores em `src/infra/`.
- Proteja invariantes nos agregados e preserve a ordem dos eventos de domínio. Retorne erros de domínio como valores e traduza os erros públicos conforme o contrato.
- Reutilize portas, casos de uso e adaptadores existentes. Mantenha as cartas em `content/` e use o catálogo e a configuração para acessar dados e valores do jogo.

## Execução

1. Confirme o escopo, os critérios de conclusão e a situação do contrato. Acorde mudanças na interface pública antes de implementá-las.
2. Para mudanças de comportamento, confirme os critérios Dado / Quando / Então na spec. Quando houver critérios novos ou alterados, escreva primeiro os testes com o ID do requisito e confirme a falha esperada.
3. Implemente a mudança e execute os testes afetados e as validações pertinentes. Para alterações de domínio, confira também os limites de dependência e o determinismo. Quando a verificação exigir Docker, o autor sobe e para os containers. Confira a disponibilidade com `docker compose ps`.
4. Registre a etapa de desenvolvimento no devlog conforme o formato existente. Inclua arquivos alterados, verificações e resultados, pendências e, quando aplicável, um roteiro com resultados esperados e um caso de borda. Deixe as horas a preencher quando não houver medição.
5. Ao final de cada implementação, sugira um commit curto em inglês e em minúsculas, no formato `tipo/descrição`, sem dois-pontos. Use o prefixo adequado à mudança e mantenha os IDs aplicáveis conforme o histórico do backend, como `feat/activate resource effects in prepare (t-38)` ou `docs/feat-11 contract agreed (contract v0.51)`. O autor faz o commit.

## Coordenação com o frontend

- Trabalhe neste repositório. O autor leva as propostas, os arquivos, os avisos e os resultados entre os lados. Consulte `docs/ROADMAP.md` §2 para sincronização e conflitos.
- Confira a situação da seção em `docs/CONTRATO.md` §0. Ao receber uma proposta do frontend, confira sua compatibilidade com a spec e as regras. Confirme o acordo ou devolva os pontos a ajustar. Para uma proposta do backend, solicite a confirmação do frontend pelo autor. Implemente a interface após o acordo e marque `implementado (BE)` depois da entrega e dos testes do backend.
- O autor disponibiliza o backend real para a validação no frontend. Registre `validado` e feche a FEAT somente após receber a confirmação de que os cenários do contrato passaram.
- Ao alterar `docs/README.md`, `docs/ROADMAP.md` ou `docs/CONTRATO.md`, incremente a versão e registre a mudança no histórico do arquivo. O autor copia o arquivo inteiro para o outro repositório.
- Termine a resposta com um **Aviso de frontend** copiável quando houver proposta ou alteração de contrato, mudança em documento compartilhado, dependência do frontend ou uma entrega pronta para validação integrada. Pause a parte que depende do retorno e avance no trabalho independente da mesma tarefa.

> **Aviso de frontend — FEAT-nn**
> - **Motivo** — O que mudou ou precisa de decisão.
> - **Levar** — Arquivos, versões e seções pertinentes e, quando aplicável, URL do backend e dados de teste.
> - **Executar no frontend** — Revisão ou cenários contra o backend real, com os resultados esperados.
> - **Trazer de volta** — Confirmação, resultados ou divergências com cenário, resultado esperado e resultado observado.
> - **Situação no backend** — O que pode seguir e o que depende do retorno.

## Retomada e chamada de tarefas

- Use um chat por etapa, incluindo implementação, testes e ajustes da mesma tarefa. Abra outro chat para uma etapa independente.
- Quando o autor começar o dia de trabalho, concluir uma etapa ou pedir o ponto atual, inclua um prompt curto e copiável para retomada. Confirme a próxima tarefa no roadmap, na spec ou no devlog e aguarde autorização para iniciá-la. Quando houver um Aviso de frontend, deixe-o por último.

> Implemente a `T-xx`. Consulte os critérios de `REQ-xx` e a decisão `D-yy` aplicável. Retome de <entrada do devlog ou ponto atual>. Rode os testes afetados, registre a etapa e entregue o roteiro de verificação.
