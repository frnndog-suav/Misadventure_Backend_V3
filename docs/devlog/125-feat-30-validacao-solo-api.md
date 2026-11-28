# 125 — Ambiente da FEAT-30 para validação solo

- **ID** — FEAT-30, T-116 do frontend · **Data** — 2026-11-28 · **Status** — validada no Chrome com API real.
- **Horas** — a preencher pelo autor.

O checkout usado para a entrega foi `37737c9`. As duas instâncias responderam ao `GET /health` com 200 e `contractVersion: "1.13"`. A referência documental é o CONTRATO v1.21, seção FEAT-19.

Foram preparados dois catálogos temporários a partir de `test/prepare-feat-19.cjs`. Ambos usam Guerreiro (`warrior`), Dimensão de Teste (`fixture.test-dimension`), um Fragmento no baralho de recompensas urbano, o Viajante Ferido como único evento urbano e conclusão na Mina Velha sem chefe. Ambos os resultados do evento compram o Fragmento. O prêmio inclui 100 ouro e `fixture.blade-of-dusk`, com 25 Pico de conclusão.

| API | Sucessora | Save conferido | Resultado do GET após conclusão |
| --- | --- | --- | --- |
| `http://localhost:3333` | Rascunho | `8d4f2189-948f-4d47-9a85-a0e42c62693c` | `frozen`, recibo persistido e POST de sessão com 409 `PARTY_FROZEN` |
| `http://localhost:3335` | `fixture-next.next-dimension` publicada | `5ed4af75-1c17-4e13-9a2a-95819b9b78c7` | `inSession`, recibo persistido e personagem em `fixture-next.city` |

Em ambas as instâncias, a verificação HTTP criou um save, abriu a sessão, revelou o evento, desistiu da exigência do Viajante Ferido, obteve o Fragmento, moveu para a Mina Velha, encerrou a vez e confirmou a revisão do save no GET. Após concluir, ambos os saves ficaram na revisão 8, com 110 ouro e a carta no inventário.

## Retorno do frontend

O autor confirmou os dois desfechos no Chrome 158.0.8127.38, com MSW desligado, frontend em `e4329ed` com alterações locais da T-115 e T-116 e backend em `37737c9`. O devlog 152 do frontend reúne o roteiro e as evidências.

- Congelamento na porta 3333, save `fad89b9b-1c19-4fc2-b50c-e9a91681f077`. Reabrir retornou 409 `PARTY_FROZEN`. Após recarga, o GET retornou 200 com o recibo e o menu mostrou **Congelado**.
- Passagem na porta 3335, save `17fa8698-35b4-40df-babe-4cb501575680`. Após recarga, a interface mostrou **Em sessão** na Segunda Dimensão, em `fixture-next.city`.
- Ambos preservaram +25 Pico, +100 ouro e a Lâmina do Crepúsculo no inventário, com saldo final de 110 ouro.

Arquivos versionados desta etapa: este registro, o índice do devlog e a cópia integral do ROADMAP v1.11 recebida do frontend. A validação integrada está concluída.
