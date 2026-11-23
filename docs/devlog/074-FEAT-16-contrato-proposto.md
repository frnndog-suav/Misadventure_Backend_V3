# 074 — FEAT-16 — Contrato do Mercado proposto pelo backend

- Data — 2026-11-23
- Status — concluída
- Spec — v0.73
- Contrato — v0.79 (seção FEAT-16 `proposto (BE)`)
- ROADMAP — v0.69 (FEAT-16: BE `aguardando outro lado`)
- Horas — 0,25 (auto)

## Objetivo

Propor ao frontend a seção FEAT-16 do contrato (`/contrato FEAT-16`), com tudo o que a T-61 pede: campos novos das cartas, chaves do laboratório, `visitMarket`, `openBooster`, projeção `market`, capacidades efetivas, entrega pendente do booster e motivos de recusa.

## Decisões

O autor aprovou a proposta inteira em 2026-11-23. Os pontos que foram além da spec v0.72 e entraram na v0.73:
- `lastMarketVisit` e `lastBoosterOpening` no `PlayerState` (REQ-140, REQ-142, REQ-144), no padrão do `lastScavenge`. Sem eles, o frontend não teria como mostrar o ouro perdido acima da bolsa nem as cartas que saíram do booster. Os domain events ainda não chegam à tela (CONTRATO §1.6, P-02).
- As cópias do booster na entrega pendente têm fonte `{ type: 'booster'; boosterCardId }` e origem `{ type: 'fixed' }` (REQ-144, D-122). Deixar uma carta de origem `fixed` já manda ao limbo, então uma origem nova teria o mesmo comportamento.
- O tamanho de cada expansão (+5, +1, +10) é chave do laboratório, como o preço base (REQ-137; Constituição 7).
- Saves v2 a v8, numa zona com mercado, projetam estoque e boosters com fator 100 e sem vitrine (T-62). O sorteio não pode ser feito depois da criação sem consumir RNG.
- Outras escolhas da proposta:
  - 37 chaves inteiras no laboratório, com o motivo novo `sumMismatch` para as chances do booster (soma 1.000);
  - `source` e `expansion` desconhecidos reusam `unknownOption`;
  - 8 motivos novos de recusa;
  - `visitMarket` entra em `availableActions` entre as ações de missão e `trainWithMentor` (ordem do README 12.2);
  - `market` é projetado só para o membro da vez numa zona com mercado.
- `CONTRACT_VERSION` continua `0.78`: só muda quando o backend implementa uma versão.

## Passos e comandos

- Leitura: CONTRATO §§1, 2, FEAT-03, 04, 10, 12, 14, 15 e 32; README 6.4, 12.2, 24 e Apêndice A; `src/domain/campaign/enterprise/available-actions/index.ts` (ordem das ações); cartas em `test/fixtures/content/fixture/`.
- Rascunho mostrado ao autor e aprovado; depois foi inserido com um script `node` antes de "## 4. Códigos de erro".
- `git diff --check`: sem problemas.
- `node .claude/hooks/tempo.mjs fechar FEAT-16-contrato` → 0,25 h (11:53–12:00).

## Arquivos

- `docs/CONTRATO.md`:
  - v0.79;
  - glossário §2.17 (Mercado);
  - seção FEAT-16 (`proposto (BE)`): decisões, mudanças em outras seções, ordem das recusas, tipos, preços, laboratório, `CONTENT_INVALID`, mudanças na fixture e 13 cenários;
  - histórico.
- `docs/ROADMAP.md`: v0.69, FEAT-16 BE `aguardando outro lado`, histórico.
- `docs/SPEC-BACKEND.md`: v0.73. Muda a linha de base da FEAT-16, as REQ-137, 140, 142 e 144, a D-122, as T-62, 63 e 65 e o histórico.
- `docs/devlog/README.md`: índice (073 `concluída`, 074 nova). Também muda `docs/devlog/073-FEAT-16-planejamento.md` (status).
- `docs/devlog/tempo.html`: sessão registrada.

## Como verificar

Leia a seção "FEAT-16 — Mercado" do contrato e confira as contas dos cenários com o fator fixo em 115:
- poção ⌈6 × 1,15⌉ = 7; flechas ⌈3,45⌉ = 4, com 10 por compra; vara ⌈23⌉ = 23;
- 2 compras de flechas: 100 → 92; vender 10 flechas: +1;
- tesouro Incomum +25; espada Comum × 1,2 +3; 2 Força +4;
- bolsa 290 + 25 → 300 (`goldLost: 15`);
- booster + poção = 37 > 35 → recusa no índice 1;
- bolsa 300 → 600 por 150; 2 expansões do cofre: 50 + 100 > 110.

## Problemas

O rascunho dizia "33 chaves" no laboratório; a contagem real é 37 (corrigida antes de gravar o histórico final).

## Checks

Não se aplicam (só documentos).

## Ponte com o frontend

AVISO DE FRONTEND da FEAT-16 emitido: levar `docs/CONTRATO.md` v0.79 e `docs/ROADMAP.md` v0.69. No frontend, rodar `/retorno-backend` com o resumo da proposta e trazer de volta o aceite ou os pedidos de mudança. A T-61 espera o `acordado`.

## Commit sugerido

`docs/propose market contract (feat-16)`
