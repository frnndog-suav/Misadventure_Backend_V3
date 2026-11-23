# 072 — T-60 — Campanhas determinísticas da FEAT-15

- Data — 2026-11-23
- Status — aguardando revisão (preparador pronto; falta a verificação do autor com o backend no ar)
- Spec — v0.70, T-60, REQ-131 a REQ-135
- Contrato — v0.76, FEAT-15 acordada (sem alteração nesta etapa)
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

```powershell
node test/prepare-feat-15.cjs content          # imprime a pasta temporária <CONTENT>
docker compose up -d postgres                   # Docker Desktop aberto
# banco dedicado apontado por .env.test; backend na 3334 com CONTENT_DIR=<CONTENT> e LAB_ENABLED=true
npm run start:dev
curl http://localhost:3334/health
$env:FEAT15_API_URL='http://localhost:3334'; node test/prepare-feat-15.cjs campaigns
```

Esperado: uma linha JSON por campanha (13), sem erro. Para uma só: `node test/prepare-feat-15.cjs campaigns quadro`.

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

## Checks

- `node --check` e Prettier no preparador; `npm run validate:content` na pasta temporária (1 coleção, 36 cartas).
- Não executado: o modo `campaigns` (exige Docker e backend) e os e2e de controller das T-56 a T-59.

## Pendências

- O autor sobe Docker e backend, roda os e2e e o modo `campaigns` e informa o resultado.
- Depois disso: `/contrato FEAT-15 implementado` (AVISO DE FRONTEND com URL, IDs e coleção `fixture`) e, após o retorno do frontend, `validado`.
- E2E de controller das missões continua sem escrever (pendência das T-56 a T-59).

Commit sugerido — `test/add feat-15 campaign preparer (t-60)`
