# 081 — T-66 — Campanhas determinísticas da FEAT-16

- Data — 2026-11-23
- Status — aguardando validação do frontend
- Spec — v0.80, T-66, REQ-136 a REQ-144
- Contrato — v0.81, FEAT-16 `implementado (BE)`
- Horas — registro automático

## Objetivo

Preparar o catálogo temporário e as campanhas independentes da FEAT-16 no padrão da T-60, para o frontend validar contra o backend real com o MSW desligado. A FEAT-16 fica `implementado (BE)`. A T-66 fecha quando o frontend registrar `validado`.

## Decisões

- **D-123 revista (decisão do autor, 2026-11-23):** o comportamento fica como está. Excluir uma coleção citada por `boosterCollectionId` não é recusado, e o booster órfão dá `boosterEmpty` ao abrir. Não há mudança de contrato.
- `test/prepare-feat-16.cjs` tem os mesmos três modos da T-60: `content`, `campaigns [nomes]` e `snapshot <id>`. A API vem de `FEAT16_API_URL` (padrão `http://localhost:3333`). O banco vem de `DATABASE_URL`, depois `.env.test`, depois `.env`.
- O catálogo temporário é a fixture mais `fixture.t66-outpost` (Posto da Fronteira, urbana): mercado **sem singles**, com estoque de poção e flechas. São 27 cartas, validadas.
- Os pontos de partida são gravados no banco:
  - mapa Posto–Porto–Mina, RNG `[0,0,0,10]`, rodada 6 e 3 PA;
  - mercados fixos com fator 100 nos dois;
  - vitrine do Porto [Espada Curta 6, Força 5, Moeda da Sorte 15, vazio]; para repor, o Porto ainda tem Escudo de Carvalho ×2 e Resistência ×1.
- Não há e2e novo: os cenários do contrato já estão cobertos pelos e2e das T-61 a T-65. `vaultFull` com 23 slots fica só nos testes unitários (D-128 g).

## Arquivos

- `test/prepare-feat-16.cjs` (novo).
- `docs/CONTRATO.md` v0.81, `docs/ROADMAP.md` v0.71, `docs/SPEC-BACKEND.md` v0.80 (D-123 e histórico), `src/infra/http/contract-version.ts` 0.78 → 0.81 (estava atrasado desde a FEAT-15).

## Campanhas (IDs entregues ao frontend)

| Campanha | ID | Início |
| --- | --- | --- |
| mercado-singles | `98d27914-5779-415e-a045-01cfabad9d25` | Porto, 300 de ouro |
| mercado-sem-singles | `c3aa1516-e80d-46a6-b07a-c6912478e65c` | Posto, 100 de ouro |
| venda | `91c88e78-4c7b-40a8-80a7-45fe0461267c` | Porto, 0 de ouro, inventário com Moeda, Espada e 20 Flechas; pasta com 2 Força |
| ouro-perdido | `334f2a53-092b-49df-9347-130d1f827eac` | Porto, 290 de ouro, Moeda no inventário |
| expansoes | `6da7afc3-895b-4a2f-ad75-4ae251402118` | Porto, 300 de ouro |
| booster-inventario | `70f2813a-a07e-4c19-8e99-ecec77843d13` | Porto, booster no inventário |
| booster-pasta-cheia | `a3ac4845-ccd1-4516-a70a-0512e496a63f` | Porto, booster no inventário, 23 Força na pasta |
| booster-pendente | `32b93ed0-8331-4db1-8a2d-7f94e4f62dbc` | Porto, inventário com 1 vaga, ocupada pelo booster |
| booster-cofre | `b7f1bc2c-f7df-4438-b24c-696d392e34e4` | Porto, booster no cofre |
| fora-do-mercado | `f3f28fd9-bb5d-4d0f-8294-51c9bc3d29f4` | Mina Velha, 100 de ouro |
| legado | `e96f7574-4a93-4580-a036-73e15233c3c6` | Porto, save sem mercados sorteados |

## Ações e resultados esperados

Todos foram executados pelo agente em cópias das campanhas (o mesmo preparador, IDs descartáveis), com estes resultados:

| Campanha | Ação | Resultado |
| --- | --- | --- |
| mercado-singles | `buySingle` slot 0 | 200, ouro 294, 2 PA, Espada no inventário (`destination: inventory`, `gold: -6`); o slot 0 é reposto com Escudo de Carvalho a 5. |
| mercado-singles | `buySingle` slot 3; slot 4 | 409 `showcaseSlotEmpty`; 409 `showcaseSlotNotFound` (os dois com `operationIndex: 0`). |
| mercado-singles | lote [`buySingle` 1, `buyStock` Flechas ×2, `buyBooster` ×1] | 200, ouro 253, 1 PA. Força na pasta (−5), 20 Flechas (−6), booster no inventário (−30). |
| mercado-sem-singles | GET | `showcase: null`, estoque a 6 (poção) e 3 (flechas ×10), booster a 30. |
| mercado-sem-singles | `buySingle` 0; `buyStock` vara de pesca | 409 `singlesUnavailable`; 409 `notInMarketStock` com `cardId`. |
| mercado-sem-singles | `buyStock` poção ×1 | 200, ouro 94. |
| venda | GET `sellOffers` | Moeda 25, Espada 3, Flechas a 1 por lote de 10 (`owned: 20`), Força da pasta a 2. |
| venda | vender 15 Flechas | 409 `notLotMultiple`, `cardId` fixture.arrows. |
| venda | lote [Moeda, Espada, 2 Força da pasta, 10 Flechas] | 200, ouro 33 (+25, +3, +4, +1); sobram 10 Flechas e a pasta fica vazia. |
| ouro-perdido | vender Moeda | 200, ouro 300, `goldLost: 15`. |
| expansoes | `buyExpansion` vaultGold | 409 `notEnoughGold` (500 > 300). |
| expansoes | lote [purse, vaultSlots, tcgFolder] | 200, ouro 40. Capacidades: bolsa 600, cofre 35, pasta 40. `expansions` purse 1, vaultSlots 1, tcgFolder 1. |
| expansoes | `buyExpansion` deckSlots; encerrar e reabrir a sessão | 409 `notEnoughGold` (100 > 40); as expansões continuam salvas. |
| booster-inventario | `prepare` `openBooster` | 200, PA continuam 3. `lastBoosterOpening.via: prepare` com 8 cartas: Tônico, Armadura do Guardião, Poção e Varinha Arcana vão para o inventário; 1 Força e 3 Destreza vão para a pasta. |
| booster-inventario | `openBooster` da poção | 409 `notBooster`. |
| booster-pasta-cheia | `openBooster` | 409 `tcgFolderFull`. |
| booster-pendente | `openBooster` | 200. Tônico vai para o inventário; Armadura, Poção e Varinha ficam `pending`. `pendingRewards[0]` é a Armadura, com `source: { type: booster }` e `origin: fixed`; só `resolveReward` fica disponível. |
| booster-pendente | `openBooster` de novo; depois `resolveReward` `leave` ×3 | 409 `choicePending`. Cada `leave` abre a próxima pendência (Poção, Varinha) e, no fim, não sobra nenhuma. |
| booster-cofre | `useVault` [`openBooster`] | 200, 2 PA, `via: useVault`, as 8 cartas em `vault.slots` (6 slots distintos). |
| fora-do-mercado | GET; `visitMarket` | `market: null`, sem `visitMarket`; 409 `zoneActionUnavailable`. |
| legado | GET; `buySingle` 0 | Fator 100, `showcase: null`, estoque a 6/3/20; 409 `singlesUnavailable`. |

O sorteio do booster é determinístico pela semente: a mesma sequência aparece em todas as cópias.

## Como verificar

No Git Bash, com o Docker Desktop aberto. Terminal 1 (pare antes o backend com Ctrl+C):

```bash
cd /d/Github/Misadventure_Backend_V3
docker compose up -d postgres
export CONTENT_DIR="$(node test/prepare-feat-16.cjs content)"
LAB_ENABLED=true npm run start:dev
```

Terminal 2:

```bash
cd /d/Github/Misadventure_Backend_V3
curl http://localhost:3333/health
node test/prepare-feat-16.cjs campaigns
```

O `/health` deve mostrar `contractVersion` 0.81. O preparador imprime uma linha JSON por campanha (11).

## Problemas

- O `/health` anunciava 0.78: `contract-version.ts` não subiu com as v0.79 e v0.80. Corrigido para 0.81.
- O e2e completo das rotas afetadas, com o backend de desenvolvimento no ar, teve timeouts de 5 s que mudavam a cada execução (efeitos, eventos, Preparar, cofre, missões). Rodados sozinhos, os mesmos arquivos passam (11/11 e 45/45). Este passo não mudou nada em `src/` além da versão.

## Checks

- `node --check`, Prettier e ESLint no preparador; `npm run validate:content` na pasta temporária (27 cartas).
- `campaigns` (11) e os fluxos nas cópias: tudo como esperado.
- E2E (PowerShell): os arquivos do mercado passaram. Na execução completa das rotas afetadas, 150 de 155 testes passaram; as 5 falhas foram timeouts sob carga e passam ao rodar os arquivos sozinhos.

## Ponte com o frontend

AVISO DE FRONTEND — FEAT-16: CONTRATO v0.81 e ROADMAP v0.71. O frontend valida com as campanhas acima.

## Commit sugerido

`test/add feat-16 campaign preparer (t-66)`
