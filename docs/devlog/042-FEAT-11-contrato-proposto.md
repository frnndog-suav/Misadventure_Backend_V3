# 042 — FEAT-11: contrato proposto pelo backend

- **Data:** 2026-11-18
- **Etapa:** `/contrato FEAT-11` (só documentos)
- **Contrato:** v0.49 · **Roadmap:** v0.53 (sem mudança)

## Objetivo
Propor a seção FEAT-11 do contrato depois da validação do catálogo de variações (T-34, `docs/EFEITOS-CATALOGO.md` v1.0).

## Decisões (aprovadas pelo autor)
1. `kind` como discriminante dentro do efeito (exceção registrada a CONTRATO §1.2; spec REQ-98).
2. Alternativas: `Quantity = number | { base, multiplier, minimum }`; "A ou B" numérico = dois campos, um `null`; parâmetros opcionais sempre presentes (`[]`/`null`).
3. `DimensionCard.effects` ganha `polarity` (REQ-98).
4. `payment` enviado sem escolha a fazer → `paymentInvalid`.
5. `fixture.pickaxe` e `fixture.fishing-rod` ficam com `effects: []` (REQ-100: texto não expressável; `toolKind` já diz isso).
6. Carta em uso e no inventário ao mesmo tempo: o `activate` usa a em uso.

## Passos
1. Rascunho mostrado ao autor e aprovado.
2. `docs/CONTRATO.md`: v0.49, glossário §2.16, seção FEAT-11 `proposto (BE)`, linha 0.49 no histórico.

## Checks
Nenhum código mudou; testes não rodados. `contract-version.ts` continua 0.47 (sobe na implementação).

## Ponte com o frontend
Levar `docs/CONTRATO.md` v0.49; esperar `acordado` ou pedido de mudança. Bloqueia T-35 a T-39 (princípio 8).

## Commit sugerido
`docs/feat-11 contract proposed (contract v0.49)`
