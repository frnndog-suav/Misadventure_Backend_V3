# 075 — FEAT-16 — Contrato do Mercado acordado

- Data — 2026-11-23
- Status — concluída
- Spec — v0.74
- Contrato — v0.80 (seção FEAT-16 `acordado`)
- ROADMAP — v0.70 (FEAT-16: FE `a fazer`, BE `a fazer`)

## Objetivo

Receber o retorno do frontend (`/retorno-frontend`) sobre a proposta da FEAT-16 (CONTRATO v0.79) e liberar a T-61.

## Decisões

- O frontend aceitou a seção sem mudanças de formato. A seção passa a `acordado`.
- Decisão só de tela no frontend: cada slot da vitrine entra no máximo uma vez por lote, e o valor cobrado é lido de `lastMarketVisit`. O backend não muda nada por isso: um lote com o mesmo slot duas vezes continua válido para o backend (o contrato diz que o slot é reposto na hora, em `buySingle`).

## Passos e comandos

- Conferência do aviso colado contra `docs/CONTRATO.md` v0.79 e `docs/ROADMAP.md` v0.69 daqui: só mudam o cabeçalho, a situação da seção FEAT-16 e as linhas de histórico (CONTRATO 0.80, ROADMAP 0.70).
- As três mudanças aplicadas em cada arquivo com `sed`, sem regravar o arquivo inteiro.

## Arquivos

- `docs/CONTRATO.md`: v0.80, seção FEAT-16 `acordado`, histórico.
- `docs/ROADMAP.md`: v0.70, FEAT-16 FE `a fazer`, histórico.
- `docs/SPEC-BACKEND.md`: v0.74, linha de base da FEAT-16 (contrato acordado, T-61 liberada), histórico.
- `docs/devlog/README.md`: índice (074 `concluída`, 075 nova); `docs/devlog/074-FEAT-16-contrato-proposto.md` (status).

## Como verificar

`git diff docs/` mostra só os cabeçalhos, a situação da FEAT-16 e as linhas de histórico.

## Checks

Não se aplicam (só documentos).

## Ponte com o frontend

Nada a levar: as versões daqui agora são iguais às do frontend (CONTRATO v0.80, ROADMAP v0.70). O próximo aviso é o de `implementado (BE)` ao fim da T-66, com as campanhas preparadas e a cópia exata das cartas novas da fixture.

## Commit sugerido

`docs/market contract agreed (feat-16)`
