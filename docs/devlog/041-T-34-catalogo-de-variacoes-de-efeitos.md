# 041 — T-34 — Catálogo de variações de efeitos

- **Data:** 2026-11-18
- **Status:** aguardando revisão
- **Spec:** v0.49 (REQ-97, D-96) · **Contrato:** v0.48 (sem mudança) · **Roadmap:** v0.53

## Objetivo
Escrever `docs/EFEITOS-CATALOGO.md` (REQ-97): cada variação de gatilho, custo, ativação e duração de README 13.1 a 13.4 (e 13.6) como um `kind` com parâmetros e faixas, exemplo pt-BR, origem, FEAT que executa e coluna Autor vazia. Sem código. Entregue ao autor para validação (`entra`/`sai`/`depois`); o `/contrato FEAT-11` depende dessa validação.

## Decisões
- Estrutura: seções por parte do efeito, tabelas por categoria das tabelas do README (todas cobertas: 15 de gatilho, 9 de custo, 10+1 de ativação, 19 de duração). Convenções em §1: prefixos `on`/`while`/`until`/`for`/`during`, tipo `Quantidade` com `formula` + `minimum` ("mín. N" de 13.2), enums citados do CONTRATO §2.
- **"a definir"** na coluna Executa: variações cujo momento do jogo já existe (Movimentar, Recuperar, ativar recurso) mas nenhuma FEAT planejada executa — decisão deixada ao autor na validação.
- `EventPhase` (`anticipation`, `encounter`, `success`, `setback`) proposto; o glossário oficial nasce na FEAT-12.
- `whileSourceActive` incluída como duração (origem 13, tabela "Passivo") para o passivo de equipamento de REQ-102; `gainBaseHealth` marcada "nova" (9.1).
- Kinds executados na FEAT-11 alinhados às propostas de REQ-102 a REQ-105 (`consumeSelf`, `payGold`, `donateLife`, `spendVigor`, `reducePeak`, `discardFromHand`; `gainGold`/`loseGold`, `heal`/`loseLife`, `restoreVigor`, `gainPeak`, `modifierFlat`/`modifierPercent`, `drawCards`, `removeDebuffs`/`removeBuffs`; `immediate`, `whileSourceActive`, `infinite`, `untilEndOfTurn`, `untilStartOfNextTurn`, `forOwnTurns`, `untilEndOfRound`, `forRounds`, `untilLeaveZone`, `untilPartyEnd`).

## Passos
1. Leitura de README 13, 13.1–13.4, 13.6, III.3 e dos enums do CONTRATO §2 (atributos, modificadores, tipos de zona, slots, categorias de item, elementos, ações de zona, classes, inimigos).
2. Escrita de `docs/EFEITOS-CATALOGO.md` v0.1: 46 gatilhos, 11 custos, 56 ativações, 59 durações.
3. Spec v0.49: T-34 `[x]`, entrada no histórico.

## Arquivos
- Criado: `docs/EFEITOS-CATALOGO.md`
- Alterados: `docs/SPEC-BACKEND.md` (v0.49), `docs/devlog/tempo.html`, `AGENTS.md` (só formatação de tabela pelo `npm run format`; a versão commitada já falhava no Prettier)

## Como verificar
- Toda categoria das tabelas de 13.1 a 13.4 tem pelo menos uma linha no catálogo (conferido seção a seção).
- `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run build`, `node .claude/hooks/domain-guard.mjs --all` — todos verdes (tarefa sem código: nenhum teste afetado).

## Problemas
- `npm run format` realinhou as tabelas do `AGENTS.md` (a versão commitada já não passava no Prettier). Mantido e avisado ao autor.
- Hook de tempo fora do Claude Code somou 0 h; linha do `tempo.html` marcada "horas a preencher".

## Checks (2026-11-18)
guarda ✅ · typecheck ✅ · lint ✅ · format ✅ · testes (nenhum afetado) · build ✅

## Ponte com o frontend
Nenhuma: o catálogo é só do backend (D-96); o contrato da FEAT-11 será proposto depois da validação do autor.

## Commit sugerido
`docs/effects variation catalog (t-34, spec v0.49)`

## Revisão 2026-11-18 — validação do autor
O autor leu o catálogo e aprovou tudo, de forma provisória, pedindo ao agente para registrar: EFEITOS-CATALOGO **v1.0**, as 172 variações com Autor = `entra`, sem cortes. Linhas "a definir" entram no modelo sem FEAT atribuída. Spec v0.50: listas de REQ-102 a REQ-105 e D-100 sem mudança; caminho livre para o `/contrato FEAT-11`.

## Commit sugerido (revisão)
`docs/effects catalog validated by the author (spec v0.50)`
