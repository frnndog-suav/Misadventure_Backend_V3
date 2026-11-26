# 106 — Planejamento e contraproposta da FEAT-20

- **Data** — 2026-11-26
- **Situação** — revisão concluída, aguardando aceite
- **Contrato** — recebido v1.05, contraproposta v1.06
- **Roadmap** — recebido v0.93, atualizado para v0.94
- **Horas** — a preencher pelo autor

## Planejamento do backend

1. **Criação, membros e saves.** Dado um pedido com quantidade válida, preparar o humano e os ajudantes no mesmo agregado, com cidade inicial, identidades e estados independentes. Usar o RNG semeado para escolhas uniformes e o resolvedor de empate existente para o D20. Validar os limites no servidor e ler saves solo anteriores. Cobrir integração da rota pública de limites, configuração alterada entre GET e POST e projeções de membro e resumo.
2. **Prioridades e decisões.** Dada uma campanha com prioridades fotografadas, escolher ações legalmente disponíveis pela ordem do README II.7, aplicando as mesmas regras de domínio de um jogador humano. Cobrir fases de ação e combate já implementadas, desempates determinísticos, sorteios de classes e especializações e término da vez com trabalho limitado. Validar a permutação no PATCH, reset e leitura dos saves anteriores à chave.
3. **Avanço e persistência.** Dado um início/retomada ou ação que deixe IA na vez, executar até o humano ou o congelamento. Usar a trava existente por transação e projetar commits por vez com recibo da intenção e checkpoint atômicos. Cobrir autorização do ator humano, relógios desligados, sequência na virada de rodada, transição, congelamento, falhas entre commits, reenvio simultâneo e conflito de chave. O repositório atual mantém a trava até o callback terminar, portanto gravar várias vezes no mesmo callback não oferece commits por vez.
4. **Entrega integrada.** Preparar as campanhas determinísticas e o roteiro HTTP descritos no CONTRATO v1.06. Validar a duração com cinco ajudantes e entregar entradas e resultados esperados à T-104. A T-100 depende do aceite dos formatos para iniciar com MSW.

## Verificações e pendências

Revisados README §§1.3, 10.1, 11.2, 11.3, 28.1, II.7 e decisões J2, J4, J5, L4 e S2. Conferidos configuração e acesso ao laboratório, presenter público, sorteio de ordem, retomada e persistência. As propostas para API, checkpoints e prioridades aguardam aceite. Incorporar os critérios e IDs na SPEC-BACKEND após o aceite, antes de testes e implementação.

## Arquivos e ponte com o frontend

- `docs/CONTRATO.md` v1.06 e `docs/ROADMAP.md` v0.94, baseados nas cópias integrais recebidas.
- `docs/devlog/README.md` e esta entrada registram o ponto de retomada.

## Revisão da resposta e do cenário 4 — 2026-11-26

- **Arquivos** — CONTRATO v1.07 e ROADMAP v0.95, com históricos atualizados.
- **Verificação** — Conferidos o tipo de retorno do controller de ações, as expectativas existentes de `combatUpdates` e a distinção entre os POSTs e o GET no contrato. Revisão documental, sem execução de testes.
- **Roteiro** — Concluir o avanço pendente pelo POST de sessão e reenviar a intenção original. Esperar o `PartyActionResponse` completo, inclusive o lote de combate. Aplicar uma jogada com chave nova e reenviar a intenção original novamente. Esperar a mesma resposta original no POST e o estado da jogada posterior no GET, com versão, RNG e jogadas preservados durante o reenvio.
- **Ponte com o frontend** — A proposta v1.07 aguarda aceite para liberar T-100 com MSW. Os critérios do backend entram na spec após o acordo.

## Commit sugerido

`docs/refine feat-20 action replay (contract v1.07)`
