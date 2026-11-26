# 106 — Planejamento e contraproposta da FEAT-20

- **Data** — 2026-11-26
- **Situação** — acordo confirmado e cópias integrais sincronizadas
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

## Aceite do frontend — 2026-11-26

- O autor confirmou o acordo da FEAT-20 e a liberação da T-100 com MSW. A sincronização depende das cópias integrais do CONTRATO v1.08 e do ROADMAP v0.96. A spec do backend é o próximo ponto de planejamento após a sincronização.
- Na entrega integrada para a T-104, fornecer a URL do backend real e, para cada um dos seis cenários da FEAT-20, os IDs dos saves utilizados, as sementes aplicáveis, as condições iniciais e os resultados esperados. No cenário 4, incluir os dados para conferir o corpo completo do reenvio e o estado atual do GET após uma jogada posterior. URL, IDs, sementes e resultados esperados serão preenchidos na preparação das campanhas de validação.

## Commit sugerido

`docs/sync feat-20 agreement (contract v1.08)`

## Sincronização do acordo — 2026-11-26

- CONTRATO v1.08 e ROADMAP v0.96 copiados integralmente do frontend e comparados por SHA-256. As duas cópias são idênticas às originais.
- Próxima etapa no backend: planejar os requisitos e as tarefas da FEAT-20 na SPEC-BACKEND. A T-100 está liberada com MSW no frontend.

## Proposta na SPEC-BACKEND — 2026-11-26

- **Situação** — planejamento entregue para revisão do autor. Retomada proposta na T-88 após aprovação.
- **Arquivos** — `docs/SPEC-BACKEND.md` v1.10 e esta entrada.
- **Decisões** — REQ-178 a REQ-185, D-155 a D-158 e T-88 a T-91, com base no CONTRATO v1.08 e no ROADMAP v0.96.
- **Verificação** — conferência documental dos seis cenários acordados, incluindo o replay da resposta completa e o GET após uma jogada posterior. `git diff --check` sem erros. Etapa documental.
- **Ponte com o frontend** — a T-91 prepara a entrega à T-104. URL real, IDs, sementes, ordens, rodadas e dados específicos das campanhas serão registrados nessa preparação.
- **Horas** — a preencher pelo autor.
- **Commit sugerido** — `docs/plan ai helpers (feat-20)`.
