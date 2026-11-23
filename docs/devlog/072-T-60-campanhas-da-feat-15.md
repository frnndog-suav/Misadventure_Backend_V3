# 072 — T-60 — Campanhas determinísticas da FEAT-15

- Data — 2026-11-23
- Status — concluída em 2026-11-23 (FEAT-15 validada no CONTRATO v0.78)
- Spec — v0.70, T-60, REQ-131 a REQ-135
- Contrato — v0.76 no roteiro, `implementado (BE)` na v0.77, `validado` na v0.78
- Horas — a preencher pelo autor

## Objetivo

Preparar o catálogo temporário e as campanhas independentes da FEAT-15 no padrão do devlog 064, para o frontend validar os REQ-66 a REQ-70 do devlog 091 com MSW desligado. Esta etapa **não** marca `implementado (BE)` nem `validado`: dependem das verificações do autor e do retorno integrado.

## Decisões

- `test/prepare-feat-15.cjs` tem os mesmos três modos da T-54: `content`, `campaigns [nomes]` e `snapshot <id>`. A API vem de `FEAT15_API_URL` (padrão `http://localhost:3333`) e o banco de `.env.test`.
- O catálogo temporário copia `test/fixtures/content` e acrescenta: `fixture.wisdom-basic`; quatro especializações do Guerreiro (`knight` Cavaleiro com adicional `wisdom` e reforço `endurance`, `guardian`, `berserker`, `duelist`); a classe `mage` (essencial `wisdom`, sem especializações); onze missões de zona (`fixture.t60-*`); o evento `fixture.t60-toll` (só `payGold`, entrega a picareta). A Mina Velha ganha `questDeck` [A, B, C, D, E]. São 36 cartas em uma coleção (`fixture`), validadas por `npm run validate:content`.
- Nenhuma carta nova na fixture oficial: o conteúdo fica só na pasta temporária, como na T-54.
- Os pontos de partida são gravados no PostgreSQL de teste (mapa de duas zonas, RNG `[0,0,0,10]`, rodada 6, 3 PA salvo indicação). O preparador confere a projeção inicial pela API (quadro, missões abertas, PA, zona) antes de imprimir uma linha JSON por campanha.
- Fuga bem-sucedida não tem campanha própria (exige sorteio de fuga); fica coberta pelos testes unitários do REQ-132. Os cenários do editor de conteúdo e do laboratório são executados pelo frontend direto na API (sem campanha).

## Arquivos

- `test/prepare-feat-15.cjs` (novo).

## Como verificar

Pré-requisitos do autor (o agente não sobe Docker nem servidor):

Git Bash, com o Docker Desktop aberto e o Postgres de pé. Terminal 1 (pare antes o backend que estiver rodando, com Ctrl+C):

```bash
cd /d/Github/Misadventure_Backend_V3
export CONTENT_DIR="$(node test/prepare-feat-15.cjs content)"
LAB_ENABLED=true npm run start:dev
```

Terminal 2:

```bash
cd /d/Github/Misadventure_Backend_V3
curl http://localhost:3333/catalog/classes
node test/prepare-feat-15.cjs campaigns
```

O `curl` deve listar `mage` e as quatro especializações do Guerreiro. O preparador usa `DATABASE_URL` do ambiente, depois `.env.test`, depois `.env`, e escreve `Banco usado: …` na saída de erro. Precisa ser o mesmo banco do backend. Esperado: uma linha JSON por campanha (13), sem erro. Para uma só: `node test/prepare-feat-15.cjs campaigns quadro`.

Em 2026-11-23 a primeira tentativa do autor falhou de dois jeitos: o comando estava em sintaxe PowerShell e o `.env.test` não existe, então faltava `DATABASE_URL`. O preparador passou a cair no `.env`. O backend rodava na 3333 com a fixture oficial, sem o catálogo temporário.

## Campanhas e resultados esperados

| Campanha | Início | Ação | Resultado esperado |
| --- | --- | --- | --- |
| quadro | Mina Velha, 3 PA, inventário cheio, quadro [A,B,C], pilha [D,E] | `takeQuest` B; depois `finishQuest` na Mina; `move` ao Porto; `finishQuest` | Quadro [A,D,C], 2 PA, `openQuests[0]` da Entrega; 409 `questWrongZone`; 1 PA; 200 com 0 PA, q removida e `pendingRewards[0].source` `quest`; `resolveReward` `leave` conserva a conclusão. |
| abandono-cheio | Mina, 0 PA, B aberta, quadro [A,D,C], pilha [E] | `abandonQuest` | 200, 0 PA, B ao fundo da pilha, quadro igual. |
| abandono-vazio | Mina, 0 PA, B aberta, quadro [A,vazio,C], pilha vazia | `abandonQuest` | 200, B volta à vaga. Para reaceitar: `endTurn` e `takeQuest` (novo ID, etapa 0). |
| provacao | Porto, Pico 30, 3 PA, objetivos 0/3 abertos, evento `t60-toll` | `takeTrialQuest` warrior/knight; nova genérica; `finishQuest`; `startEvent`, `revealEvent`, `payEventRequirement` `gold` | Contadores 0/3; 409 `genericQuestAlreadyOpen`; 409 `questObjectivesIncomplete`; êxito com recompensa pendente já mostra `randomEventSuccesses` 1 na provação e na etapa; GET e `resolveReward` preservam 1. |
| limite | Porto, Pico 30, três zonas abertas | `takeTrialQuest` | 409 `questLimitReached`. |
| vitoria-reflexao | Mina, 2 PV, caça espelhada, provação com 1 vitória | `continueQuest`, depois `combatAttack` | Vitória com `playerDown: true`, etapa `completed`, provação em 1. |
| vitoria-de-pe | Mina, caça simples, provação com 1 vitória | `continueQuest`, depois `combatAttack` | Etapa `completed`, provação em 2. |
| derrota | Mina, 2 PV, caça perigosa, provação com 1 vitória | `continueQuest`, depois `endCombatTurn` | Derrota, etapa volta a `ready`, provação em 1. |
| sequencia | Mina, 3 PA, inventário cheio, q1 com duas etapas, sem quadro | Tabela "Tentativa e entrega em sequência" do contrato | PA e `questChoices` conforme a tabela; `finishQuest` final soma 5 de ouro. |
| concessoes | Porto, Pico 30, provação 3/3, pasta com 10 Força e 20 Sabedoria | `finishQuest`; `adjustDeck` Resistência 14, Força 40, Sabedoria 6 | Especialização `knight` com `deckLockMet: false`; após salvar, Guerreiro e Cavaleiro `true`. |
| mentor-aceite | Porto, 2 PA, 200 de ouro, Cavaleiro concedido | `trainWithMentor` mage; `abandonQuest`; `endTurn`; `trainWithMentor` | 0 PA e 50 de ouro; abandono mantém 50; 409 `notEnoughGold`. |
| mentor-concessao | Porto, 2 PA, mentor 5/5, pasta com 20 Sabedoria e 10 Destreza | `finishQuest`; depois `adjustDeck` | Mage concedido inativo. Ambas ativas: Resistência 14, Força 26, Sabedoria 20. Só Mage: Força 30, Sabedoria 20, Destreza 10. Nenhuma: Resistência 3, Força 30, Sabedoria 17, Destreza 10. Modificadores: Guerreiro, Mago, padrões. |
| legado | Porto, save sem as chaves da FEAT-15 | `GET` | Quadro, missões, escolhas e especializações vazios; padrões nas chaves ausentes. |

As builds de `mentor-concessao` e `concessoes` foram calculadas à mão contra as travas (Guerreiro mínimo 10 por essencial; Cavaleiro soma 4 em Resistência e exige 6 em Sabedoria; Mago exige 18 em Sabedoria) e a pasta de 30; **ainda não foram executadas contra a API**.

Laboratório e editor: seguem o contrato (cenários "Laboratório" e "Referências de conteúdo no editor"), com a coleção `fixture` do catálogo temporário.

## Execução em 2026-11-23

O autor subiu o backend na 3333 com o catálogo temporário e rodou o modo `campaigns`. Banco: `localhost:5432/misadventures`, o do `.env` (não existe `.env.test` nesta máquina). As 13 campanhas passaram na conferência inicial. IDs entregues ao frontend:

| Campanha | ID |
| --- | --- |
| quadro | `0ee36f74-8cd0-4434-a12e-dad45029dc12` |
| abandono-cheio | `2dacfea1-f59f-478a-8319-07c10bcda9b4` |
| abandono-vazio | `84ccbed0-f8ad-41ee-a4f4-6f5e5591cf6b` |
| provacao | `362e5579-6c6f-4090-a2c3-202124526f28` |
| limite | `b2a1c9d0-83a0-4ade-acf2-ff90fa4d5bca` |
| vitoria-reflexao | `c314c414-ddb2-4487-b99e-a7c3ea69837a` |
| vitoria-de-pe | `47a682e2-fed2-42dc-9fae-705c48700c43` |
| derrota | `1d4227f1-a6f1-4f6f-b4ee-6110120c02d0` |
| sequencia | `61f05217-6110-4e7a-9090-2a21fa91292a` |
| concessoes | `7c1ba5ca-af69-4a96-acd2-71606b509efe` |
| mentor-aceite | `a8f9e301-0cc2-4647-bd26-a939f12a95fd` |
| mentor-concessao | `26883b2d-b898-4b3d-a98e-ae25928121bd` |
| legado | `e8e16818-0b30-4405-a007-809cf39686e3` |

Para não gastar esses IDs, o agente criou uma segunda cópia de cada campanha e executou todos os fluxos da tabela acima pela API. Todos deram o resultado esperado:

- **quadro:** `takeQuest` deixou [clue, herbs, escort] e 2 PA. O `finishQuest` na Mina deu 409 `questWrongZone` com `questId`. No Porto, com 1 PA, deu 200, 0 PA, Pico +3 e a picareta pendente com `source.type: quest`. Encerrar e reabrir a sessão preservou a escolha, e `leave` limpou a pendência.
- **abandono-cheio:** o quadro ficou igual e o banco mostra a pilha [lost-tool, delivery].
- **abandono-vazio:** B voltou à vaga. Depois de `endTurn`, a reaceitação gerou um ID novo na etapa 0.
- **provacao:** aceitou com contadores 0/3 e 0/3. A segunda genérica deu 409 `genericQuestAlreadyOpen`; finalizar cedo deu 409 `questObjectivesIncomplete`. O pagamento com recompensa pendente já trouxe 1 na provação e na etapa de objetivos, e reabertura e `resolveReward` preservaram o valor.
- **limite:** 409 `questLimitReached`.
- **vitoria-reflexao:** `victory` com `playerDown: true`, etapa `completed`, provação em 1/3 e respawn no Porto.
- **vitoria-de-pe:** etapa `completed`, provação em 2/3.
- **derrota:** etapa volta a `ready`, provação em 1/3.
- **sequencia:** PA, etapas e `questChoices` iguais à tabela do contrato, linha a linha. O `finishQuest` deu +5 de ouro e +3 de Pico.
- **concessoes:** Cavaleiro concedido com `deckLockMet: false`. A build Resistência 14, Força 40 e Sabedoria 6 ativou Guerreiro e Cavaleiro, com os modificadores do Guerreiro.
- **mentor-aceite:** 0 PA e 50 de ouro. O abandono manteve 50, e a nova tentativa deu 409 `notEnoughGold`.
- **mentor-concessao:** Mago concedido inativo. Com as duas classes ativas, ficam os modificadores do Guerreiro; só com o Mago, os do Mago; sem nenhuma, os padrões. A reabertura preservou o resultado.
- **legado:** listas vazias.

Observação para o roteiro do frontend: o êxito do evento aleatório dá +1 de Pico ao resolver a recompensa (FEAT-12). É independente do Pico de conclusão.

E2E (PowerShell, `npm.cmd run test:e2e -- src/infra/http/controllers/take-party-action src/infra/http/controllers/create-party src/infra/http/controllers/get-lab-config`): 11 arquivos e 94 testes passaram. No Git Bash, o Vitest falha com "failed to find the runner".

## E2E de missões

O pré-requisito de `implementado (BE)` (e2e de cada cenário) não estava cumprido desde a T-56. Por decisão do autor, os e2e foram escritos antes da marcação. O arquivo é `src/infra/http/controllers/take-party-action/index.quests.controller.e2e-spec.ts`, com 15 testes. Ele reusa o conteúdo e os pontos de partida do preparador: `test/prepare-feat-15.cjs` exporta `writeT60Content`, `scenarios` e `seed`, com tipos em `test/prepare-feat-15.d.cts`, e só executa a linha de comando quando é chamado direto.

Cobertura: quadro e entrega, os dois abandonos, provação, limite, os três desfechos de combate, a sequência do contrato, as concessões, o mentor (aceite e concessão com modificadores), o save legado, o laboratório (`questBoardSize`) e o editor (publicação e os dois `CONTENT_INVALID`). A unicidade de título no `validate-dimension` ficou com os testes unitários (`quest-content.test.ts`).

Os testes foram escritos depois do comportamento, então não houve fase red. Para conferir que eles detectam divergência, duas expectativas foram alteradas de propósito (Pico 14 e vitórias 1): os dois testes falharam e o arquivo foi restaurado. Uma terceira falha na mesma execução veio da restauração feita pelo PowerShell, que corrompeu os acentos. A codificação foi corrigida e a suíte voltou a 15/15.

## Contrato

CONTRATO v0.77 marca a FEAT-15 como `implementado (BE)`, e ROADMAP v0.67 coloca o BE em `pronto`. `src/infra/http/contract-version.ts` passou de 0.65 para 0.77: estava atrasado desde a FEAT-14.

## Checks

- `node --check` e Prettier no preparador; `npm run validate:content` na pasta temporária (1 coleção, 36 cartas).
- Modo `campaigns` com as 13 campanhas e os fluxos nas cópias: tudo verde.
- E2E: missões 15/15 e rotas afetadas (`take-party-action`, `create-party`, `get-lab-config` e `health`) com 13 arquivos e 110 testes. Unitários: 98 arquivos e 1.349 testes. Também passaram `npm run typecheck` e a guarda do domínio.
- ESLint e Prettier passaram nos arquivos novos. O preparador declara os globais do Node no topo. `npm run lint` continua acusando erros em `test/prepare-feat-13.cjs` e `test/prepare-feat-14.cjs`, que já existiam e não foram tocados.

## Pendências

Nenhuma. Ver "Fechamento".

## Fechamento (2026-11-23)

Retorno do frontend (devlog FE 093): FEAT-15 `validado` no recorte solo, sem mudança de formato. As 13 campanhas da T-60 e os cenários de laboratório e editor passaram com chamadas HTTP contra o backend real (`http://localhost:3333`, health 0.77); as telas de missões, ficha, laboratório e editor passaram no Chrome com o MSW desligado.

Observação: o save "T-60 — derrota" intacto (`1d4227f1`) terminou em vitória; a derrota foi conferida no save `0ed8c424`, do lote já usado. A derrota segue coberta pelo e2e de missões (três desfechos de combate).

Aplicado: CONTRATO v0.78 (seção `validado`), ROADMAP v0.68 (FEAT-15 `validado` nas duas colunas), SPEC-BACKEND v0.71 (T-60 `[x]`), `src/infra/http/contract-version.ts` 0.77 → 0.78.

Commits — `test/add feat-15 campaign preparer (t-60)`, `test/add feat-15 campaigns and quest e2e (t-60)` e, no fechamento, `docs/feat-15 validated (contract v0.78, roadmap v0.68)`.
