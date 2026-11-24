# 089 — T-73 — Campanhas determinísticas da FEAT-17

- Data — 2026-11-24
- Status — aguardando validação do frontend
- Spec — v0.89, T-73, REQ-145 a REQ-154
- Contrato — v0.86, FEAT-17 `implementado (BE)`
- Horas — registro automático

## Objetivo

Preparar o catálogo temporário e as campanhas independentes da FEAT-17 no padrão da T-66, para o frontend validar contra o backend real com o MSW desligado. A FEAT-17 fica `implementado (BE)`. A T-73 fecha quando o frontend registrar `validado`.

## Decisões

- `test/prepare-feat-17.cjs` tem os mesmos modos da T-66: `content`, `campaigns [nomes]` e `snapshot <id>`. A API vem de `FEAT17_API_URL` (padrão `http://localhost:3333`); o banco, de `DATABASE_URL`, `.env.test` ou `.env`.
- O catálogo temporário é a fixture com estes acréscimos (29 cartas, validadas):
  - o Guerreiro renomeado para Artífice (`artificer`), como no e2e da T-71 (D-140 g);
  - quatro especializações, porque o conteúdo exige quatro ou nenhuma: Ferreiro Arcano (`arcaneSmith`, D-139 a), Engenhoqueiro, Inventor e Construtor (as três sem regra, D-134);
  - a Lâmina Rúnica (`fixture.t73-runeblade`), com um slot de elemento sem requisito e um de efeito em +3;
  - no Porto Cinzento, além do `ember-edge`: `frost-edge` (água, 15%, 1 Fragmento) e `guard-rune` (efeito +20% de Defesa, 2 Minérios).
- Os pontos de partida são gravados no banco: mapa Porto–Mina, RNG `[0,0,0,10]`, rodada 6, 3 PA e laboratório padrão. O Ferreiro Arcano é gravado com a trava cumprida; se o deck mudar, a trava é recalculada.
- O ouro inicial respeita a bolsa (300).
- Não há e2e novo: os cenários do contrato estão cobertos pelos e2e das T-67 a T-72.

## Arquivos

- `test/prepare-feat-17.cjs` (novo).
- `docs/CONTRATO.md` v0.86, `docs/ROADMAP.md` v0.79, `docs/SPEC-BACKEND.md` v0.89, `src/infra/http/contract-version.ts` 0.82 → 0.86 (estava atrasado desde a v0.83).

## Campanhas (IDs entregues ao frontend)

IDs da 2ª entrega (2026-11-24, depois da correção do `replaced`); os da 1ª foram consumidos na validação.

| Campanha | ID | Início |
| --- | --- | --- |
| ferreiro | `86d9a7ac-810e-41c8-b234-420fc46f53c4` | Porto, 300 de ouro, Espada Curta em uso (+0); inventário: Lâmina Rúnica, 8 Minérios, 2 Fragmentos |
| quebra-mais-6 | `94f44897-0328-4f42-98d0-77d0c9430e9f` | Porto, 300 de ouro, Espada em uso a +6, 3 Minérios |
| substituir | `60d161d3-2b9d-4bec-9804-20c0792fde7c` | Porto, 300 de ouro, Lâmina Rúnica +3 com `ember-edge` no slot 0, 1 Fragmento |
| conserto-receita | `c616d8b5-38f9-4751-8795-04fa847d5e59` | Porto, 100 de ouro, Espada em uso +4 quebrada; Projeto e 2 Minérios |
| oficina | `756f1d18-1931-4c15-b5c1-384a59874685` | Artífice na Mina Velha, 100 de ouro; Espada +4 quebrada (slot 0), Espada +6 (slot 1), 3 Minérios |
| ferreiro-arcano | `14cbf1b7-fa2d-41d5-9452-0af9fc85c7c6` | Artífice com Ferreiro Arcano no Porto, 300 de ouro, Espada em uso (+0), 2 Fragmentos |
| venda | `fd0caa06-4691-4f35-a8c5-d44ec755183f` | Porto, 0 de ouro, save sem mercados sorteados; 4 Espadas: +3 com `ember-edge`, +2 quebrada, 2 marcas de reparo e padrão |

## Ações e resultados esperados

Executados pelo agente em cópias (o mesmo preparador, IDs descartáveis). O RNG tem semente fixa, então as rolagens se repetem em todas as cópias.

| Campanha | Ação | Resultado |
| --- | --- | --- |
| ferreiro | GET | `enchantments`: ember-edge 50/10, frost-edge 50/10, guard-rune 100/13. Espada: `refineSteps` +1 a +3 com limiar 0, +4 com limiar 8; `enchantOptions` ember e frost com `requiresRefinement: 2`. Lâmina: ember e frost com 0, guard-rune com 3. |
| ferreiro | `visitBlacksmith` [refine W, refine W, enchant W ember-edge, enchant inv0 frost-edge, refine inv0 ×3, enchant inv0 guard-rune] | 200, ouro 10, 0 PA. Refinos sem rolagem (−10, −20 / −10, −20, −30). ember: roll 11 ≥ 10, sucesso, −50. frost: roll 12, sucesso, −50. guard-rune: roll 3 < 13, falha, −100. Espada +2 com ember (`slotIndex: 0`, `active: true`); Lâmina +3 com frost; resta 1 Minério. |
| quebra-mais-6 | GET; `visitBlacksmith` [refine W] | Passo `{ targetLevel: 7, gold: 70, threshold: 12, breaksOnFailure: true }`. 200: roll 11 < 12, `success: false`, `broke: true`, −70; ouro 230; Espada +6 com `broken: true`. |
| substituir | GET | ember e frost `replaceRequired: true`; guard-rune `replaceRequired: false`, `requiresRefinement: 0`. |
| substituir | enchant frost-edge sem `replaceIndex`; com `replaceIndex: 5` | 409 `replaceIndexRequired`; 409 `replaceIndexInvalid` (os dois com o `cardId` da Lâmina e `operationIndex: 0`). |
| substituir | enchant frost-edge com `replaceIndex: 0` | 200, roll 11, sucesso, −50, `replaced` = ember-edge com `active: true`; ouro 250; Lâmina só com frost-edge. |
| conserto-receita | GET | `repair: { gold: 13 }`; `recipes[0]` Projeto, 2 Minérios, 15 de ouro, `canCraft: true`. |
| conserto-receita | [refine W]; [craft inventorySlotIndex 1] | 409 `equipmentBroken`; 409 `recipeMissing` (`cardId` fixture.iron-ore). |
| conserto-receita | [repair W, craft 0] | 200, ouro 72 (−13, −15). Espada +4 com `repairMarks: 1`; o Projeto fica (não consumido); Espada nova padrão no slot 1; os Minérios somem. |
| oficina | GET | `availableActions` com `artificerWorkshop` e sem `visitBlacksmith`; `blacksmith.zoneId: null`, `blacksmith.blacksmith: null`. Oficina: Espada quebrada com `repair: { gold: 7 }` e `refineSteps: []`; Espada +6 com `refineSteps: []` (teto). |
| oficina | [enchant inv1]; [refine inv1] | 409 `enchantNotAvailable`; 409 `refineLevelTooHigh`. |
| oficina | [repair inv0]; depois [refine inv0] | 200, ouro 93, 2 PA, `repairMarks: 1`. Depois 200: +5 com `d20Bonus: 2`, limiar 8, roll 11, sucesso, −50; ouro 43, 1 PA. |
| ferreiro-arcano | GET | Espada +0: ember e frost com `requiresRefinement: 2`; guard-rune com `extra: true`. |
| ferreiro-arcano | enchant ember-edge `extra: true` | 200, roll 11, sucesso, −50; ouro 250; ember com `slotIndex: null` e `active: true`. |
| ferreiro-arcano | vez seguinte: enchant frost-edge `extra: true` | 409 `enchantSlotUnavailable` (o extra já foi usado). |
| venda | GET `market.sellOffers` | Uma entrada por Espada: slot 0 → 4 (⌊3 × 1,44⌋), slot 1 → 0 (quebrada), slot 2 → 2 (⌊3 × 0,76⌋), slot 3 → 3. |
| venda | `visitMarket` [sell slot 0, sell slot 2] | 200, ouro 6 (+4, +2). |

## Como verificar

No Git Bash, com o Docker Desktop aberto. Terminal 1 (pare antes o backend com Ctrl+C):

```bash
cd /d/Github/Misadventure_Backend_V3
docker compose up -d postgres
export CONTENT_DIR="$(node test/prepare-feat-17.cjs content)"
LAB_ENABLED=true npm run start:dev
```

Terminal 2:

```bash
cd /d/Github/Misadventure_Backend_V3
curl http://localhost:3333/health
node test/prepare-feat-17.cjs campaigns
```

O `/health` deve mostrar `contractVersion` 0.86. O preparador imprime uma linha JSON por campanha (7).

## Problemas

- A 1ª execução falhou na campanha `ferreiro`: o ouro foi limitado pela bolsa (300). O ouro inicial passou a 300.
- O validador recusou a classe com uma só especialização e o efeito com duração sem `mark`. Foram acrescentadas as três especializações sem regra e `mark: 'buff'`.
- `contract-version.ts` estava em 0.82. Passou para 0.86.

## Retorno do frontend (2026-11-24)

- 6 das 7 campanhas bateram. Na `substituir`, `results[0].replaced` vinha sem `active`, que é obrigatório em `AppliedEnchantment` (CONTRATO v0.86). Contrato sem mudança.
- Correção: o domínio devolve o substituído com `active` calculado sobre o estado de antes da troca (`enchantmentActive`). O save v10 grava o campo. Um save anterior sem ele é lido com `active: true`: só se substitui encantamento ligado (D-139 b), então o valor é exato. Sem isso, a campanha já consumida dava 500 no GET.
- Testes: unitário do encantar (o `replaced` exato), mapper (ida e volta e save sem `active`) e e2e `REQ-151, CONTRATO v0.86` no ferreiro.
- Arquivos: `src/domain/campaign/enterprise/blacksmith/index.ts` e `index.test.ts`, `src/infra/database/drizzle/mappers/drizzle-party-mapper.ts` e `.test.ts`, `index.blacksmith.controller.e2e-spec.ts`.
- As 7 campanhas foram geradas de novo.

## Checks

- `node --check`, Prettier e ESLint no preparador; `npm run validate:content` na pasta temporária (29 cartas).
- `campaigns` (7) e os fluxos nas cópias: tudo como esperado.
- E2E da FEAT-17 (ferreiro, Oficina, mercado e laboratório): 29/29. Depois da correção: e2e do ferreiro e da Oficina 13/13; unitários relacionados 794/794; typecheck, ESLint, Prettier e domain-guard OK.

## Ponte com o frontend

AVISO DE FRONTEND — FEAT-17: CONTRATO v0.86 e ROADMAP v0.79. O frontend valida com as campanhas acima (T-79 de lá).

## Commit sugerido

`test/add feat-17 campaign preparer (t-73)` (1ª entrega)

`fix/include active in replaced enchantment (t-73)` (correção)
