# 097 — T-80 — Campanhas determinísticas da FEAT-18

- Data — 2026-11-25
- Status — aguardando validação do FE
- Spec — v1.01, T-80, REQ-155 a REQ-163
- Contrato — v0.93, FEAT-18 `implementado (BE)`
- Horas — registro automático

## Objetivo

Preparar o catálogo temporário e as campanhas da FEAT-18 no padrão da T-73, para o frontend validar contra o backend real com o MSW desligado. A FEAT-18 fica `implementado (BE)`. A T-80 fecha quando o frontend registrar `validado`.

## Decisões

- `test/prepare-feat-18.cjs` tem os modos da T-73: `content`, `campaigns [nomes]` e `snapshot <id>`. A API vem de `FEAT18_API_URL` (padrão `http://localhost:3333`); o banco, de `DATABASE_URL`, `.env.test` ou `.env`.
- O catálogo temporário é a cópia da `fixture`, sem acréscimos (30 cartas, validadas): ela já tem a Mina Velha Rural com o Estábulo (`fixture.plow-horse`) e o `fixture.war-pony`.
- Pontos de partida gravados no banco: RNG `[0,0,0,10]`, rodada 6, 3 PA, classe Ladino e um mapa de 4 zonas: Porto–Mina, Porto–Bosque, Mina–Curva e Bosque–Curva. A Curva fica a 2 travessias do Porto por dois caminhos.
- O fator de todos os mercados é fixado em 115% (o do cenário do contrato): o preço do Cavalo é 322 em toda campanha, sem depender do sorteio da criação.
- Bolsa em 1000 nas campanhas que passam de 300 de ouro (D-151 d).
- Sem e2e novo: os cenários do contrato estão cobertos pelos e2e das T-74 a T-79.
- `contract-version.ts` estava em 0.87 (atrasado desde a v0.88); passou para 0.93.

## Arquivos

- `test/prepare-feat-18.cjs` (novo).
- `docs/CONTRATO.md` v0.93, `docs/ROADMAP.md` v0.84, `docs/SPEC-BACKEND.md` v1.01, `src/infra/http/contract-version.ts` 0.87 → 0.93.

## Campanhas (IDs entregues ao frontend)

| Campanha | ID | Início |
| --- | --- | --- |
| estabulo | `b73e7c4e-f53f-4f76-b780-076b5ae2e79e` | Mina Velha, 400 de ouro, bolsa 1000, sem montaria |
| montaria-com-conteudo | `f92d2e1f-788d-4ba8-a054-a7074552ff9c` | Mina Velha, 200 de ouro, bolsa 1000; Cavalo com 2 Poções no inventário extra e 1 Força na pasta extra |
| inventario-cheio | `7e4e5e18-d316-4bef-a36f-6615d3765e4a` | Porto, 50 de ouro, inventário de 1 slot com a Espada, Força na pasta; Pônei de Guerra vazio com 1 slot extra |
| dois-caminhos | `75e00baf-af56-44e0-93a2-c0919bcd43b7` | Porto, Cavalo vazio |
| sem-montaria | `a676dd47-d44b-4896-87af-f1b0ce585f4a` | Porto, sem montaria |

## Ações e resultados esperados

Executados pelo agente em cópias (o mesmo preparador, IDs descartáveis).

| Campanha | Ação | Resultado |
| --- | --- | --- |
| estabulo | GET | `market.stable = { offers: [{ plow-horse, 322 }], currentMount: null }`; `moveRoutes` Porto e Curva, `direct: true`, `via: []`. |
| estabulo | `move` Porto com `viaZoneId` Curva; `viaZoneId: "x"`; `[sellMount]` | 409 `noMount`; 400 `viaZoneId` `zoneNotInMap`; 409 `noMount` (`operationIndex: 0`). |
| estabulo | `[buyMount plow-horse]`; de novo | 200, ouro 78, `mount` vazia (capacidade 4/10), `results [{ buyMount, -322 }]`, `currentMount { 140, sellable: true }`; 409 `mountAlreadyOwned`. |
| montaria-com-conteudo | GET; `[sellMount]` | `currentMount.sellable: false`; `moveRoutes` inclui o Bosque (`direct: false`, `via` Porto e Curva); 409 `mountNotEmpty`. |
| montaria-com-conteudo | `transferMount fromMount inventory` Poção ×2; `fromMount tcgFolder` Força ×1; `[sellMount, buyMount plow-horse]` | 200, 200 (PA igual); `sellable: true`; 200, ouro 18 (+140, −322), 2 PA, `mount` vazia. |
| inventario-cheio | GET | `activatableEffects` com `source: "mount"`; `usableAbilities` com `mountAbility: true` (`pony-rest`). |
| inventario-cheio | doar Poção; doar Espada | 200, Poção em `mount.inventory`; 409 `LAB_GRANT_NO_SPACE` `inventoryFull`. |
| inventario-cheio | `transferMount fromMount inventory` Poção ×1; `toMount tcgFolder` Força ×1; `direction: "up"`; `useAbility` com `equipmentSlot` e `mountAbility` | 409 `inventoryFull`; 200; 400 `direction` `unknownOption`; 400 `mountAbility` `invalidItem`. |
| dois-caminhos | GET; `move` Curva com `viaZoneId` Porto; `move` Curva sem `viaZoneId` | Curva `direct: false`, `via` Mina e Bosque; 409 `notConnected`; 200, zona Curva, 2 PA. |
| sem-montaria | `move` Mina com `viaZoneId` Bosque; `useAbility mountAbility`; `[buyMount plow-horse]` | 409 `noMount`; 409 `noMount`; 409 `mountNotOffered`. |

## Como verificar

No Git Bash, com o Docker Desktop aberto. Terminal 1 (pare antes o backend com Ctrl+C):

```bash
cd /d/Github/Misadventure_Backend_V3
docker compose up -d postgres
export CONTENT_DIR="$(node test/prepare-feat-18.cjs content)"
LAB_ENABLED=true npm run start:dev
```

Terminal 2:

```bash
cd /d/Github/Misadventure_Backend_V3
curl http://localhost:3333/health
node test/prepare-feat-18.cjs campaigns
```

O `/health` deve mostrar `contractVersion` 0.93. O preparador imprime uma linha JSON por campanha (5).

## Problemas

- O Postgres estava parado na 1ª subida (`ECONNREFUSED`); o autor subiu o container.
- O preço do Estábulo variava por campanha (fator sorteado na criação): o fator passou a ser fixado em 115%.
- Na `montaria-com-conteudo`, 100 de ouro não pagavam vender e recomprar no mesmo lote (240 < 322): ouro 200 e bolsa 1000.

## Checks

- `node --check`, Prettier e ESLint no preparador; `npm run validate:content` na pasta temporária (30 cartas).
- Fluxos nas cópias: tudo como esperado.
- E2E da FEAT-18: 35/35. Testes de `src/infra/http`: 24/24. Typecheck OK.

## Ponte com o frontend

AVISO DE FRONTEND — FEAT-18: CONTRATO v0.93 e ROADMAP v0.84. O frontend valida com as campanhas acima.

## Commit sugerido

`test/add feat-18 campaign preparer (t-80)`
