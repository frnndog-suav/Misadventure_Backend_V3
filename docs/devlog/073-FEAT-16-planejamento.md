# 073 — FEAT-16 — Planejamento do Mercado no backend

- Data — 2026-11-23
- Status — concluída
- Spec — v0.72, REQ-136 a REQ-144, D-114 a D-122 e T-61 a T-66
- Contrato — v0.78 (sem seção FEAT-16 ainda; a propor com `/contrato FEAT-16`)
- Horas — 1,75 (auto)

## Objetivo

Transformar a linha da FEAT-16 do ROADMAP (README §24: estoque, venda, boosters, singles, serviços) em requisitos, decisões e tarefas do backend, antes do contrato e de qualquer código.

## Decisões

- O autor escolheu (2026-11-23, por pergunta com opção recomendada):
  - o valor de venda do tesouro vem da tabela por raridade do laboratório, sem campo na carta (D-114);
  - o lote do estoque (munição: 10 por compra e lotes de 10 na venda) é o campo `stockQuantity` da carta, não chave do laboratório. Assim o domínio não conhece etiqueta nem carta específica (Constituição 6; D-114);
  - `marketShowcaseModifier` fica adiado, publicável e inerte como em D-100 (D-121);
  - a reposição de slot não repete carta já mostrada em outro slot da mesma vitrine (D-117).
- O autor aprovou as demais propostas no mesmo dia:
  - D-115: chaves inteiras, chances em milésimos;
  - D-116: só a coleção da dimensão é vigente até a FEAT-19;
  - D-117: sorteios e ordem fixa;
  - D-118: visita em lote, como o `useVault`;
  - D-119: aritmética inteira dos preços, porque 5 × 1,2 em ponto flutuante arredondaria para 7;
  - D-120: cada jogador guarda só a contagem de cada expansão;
  - D-122: refazer o sorteio de raridade sem elegíveis, `boosterEmpty`, booster do cofre e entrega pendente com origem `booster`.
- Lacunas que o levantamento achou no modelo atual, e que a T-61 resolve:
  - item e atributo não têm `priceMultiplier`;
  - item não tem preço de estoque;
  - booster não diz de que coleção é;
  - a zona não lista o estoque nem a vitrine;
  - as capacidades vêm só do snapshot do grupo, não do jogador.
- Fora do escopo:
  - Estábulo e espaço da montaria (FEAT-18);
  - refino, encantamento e marcas de reparo na venda (FEAT-17);
  - coleções estendidas (FEAT-19);
  - efeitos de desconto e de mais ouro na venda (não existem no catálogo de efeitos).

## Passos e comandos

- Leitura do ROADMAP (linha FEAT-16), do README §§3.4, 5.1–5.3, 6.3–6.6, 12.2, 24, 27, 28.1, Apêndice A e Apêndice B (K5, K6, M4, O2, S3, C20, C25, F1, F2, F25).
- Leitura do código: `src/domain/catalog/enterprise/value-objects/card/index.ts`, `src/domain/campaign/enterprise/party-action/index.ts`, `inventory/`, `vault/`, `entities/party-member/`, `src/domain/lab/enterprise/value-objects/game-config/defaults.ts` e o save v8 em `src/infra/database/drizzle/mappers/drizzle-party-mapper.ts`.
- `git diff --check`: sem problemas.

## Arquivos

- `docs/SPEC-BACKEND.md`: v0.72. Contém a seção FEAT-16 nos requisitos, D-114 a D-122, as tarefas T-61 a T-66 e uma linha no histórico.
- `docs/devlog/README.md`: índice.
- `docs/devlog/tempo.html`: sessão registrada.

## Como verificar

Leitura da spec: cada REQ cita a seção do README e traz exemplos numéricos:
- estoque 6 × 115% → 7;
- single Comum 5 × 1,2 × 0,9 → 6, e com 2 saídas → 7;
- venda Comum × 1,2 → 3;
- munição de `stockPrice` 3 em lote de 10 → 1;
- bolsa 300 → 600 por 150;
- ouro do cofre 2.000 → 4.000 por 500.

## Problemas

Nenhum. Etapa documental, sem testes.

## Checks

Não se aplicam (nenhum código alterado).

## Ponte com o frontend

Nenhum arquivo compartilhado mudou. O próximo passo é `/contrato FEAT-16`, que propõe a seção (`proposto (BE)`) com a lista da T-61 e emite o AVISO DE FRONTEND. A FEAT-16 ainda está `a fazer` no ROADMAP.

## Commit sugerido

`docs/plan market (feat-16)`
