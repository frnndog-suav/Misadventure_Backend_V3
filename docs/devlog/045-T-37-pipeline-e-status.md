# 045 — T-37 — Domínio do pipeline e dos status

- **Data:** 2026-11-19
- **Status:** aguardando revisão
- **Spec:** v0.54 (REQ-102, REQ-103, D-105) · **Contrato:** v0.51 (`acordado`) · **Roadmap:** v0.53

## Objetivo

Aplicar passivos de equipamentos em uso e status ao cálculo dos modificadores. Expirar status na transição prevista pela duração.

## Decisões

- D-105 registra a divisão única no fim do cálculo, a ordem de `StatusExpired` depois dos eventos da transição e a inicialização da lista vazia na leitura de saves existentes.
- D-100 exclui o passivo inteiro quando ele contém uma ativação ainda indisponível no pipeline.

## Passos e comandos

1. Escrever os testes do pipeline, da criação e da expiração. A primeira execução teve sete falhas esperadas.
2. Implementar o cálculo e as transições no domínio. Passar os status ao cálculo já usado pelo presenter.
3. Manter a gravação em v6 com os campos do schema vigente. Na leitura, inicializar `statuses` em memória.
4. Acrescentar o teste HTTP da armadura ao e2e de Preparar e rodar os testes de campanha com o PostgreSQL iniciado pelo autor.

## Arquivos

- Criados: `src/domain/campaign/enterprise/player-status/index.ts` e `src/domain/campaign/enterprise/entities/party/statuses.test.ts`.
- Alterados no domínio: `effective-modifiers`, `entities/party`, `entities/party-member`, `events/party-events`, `starting-player` e testes vizinhos.
- Alterados na infraestrutura: `drizzle-party-mapper.ts` e seu teste, `party-presenter/index.ts` e o e2e de Preparar. A factory `test/factories/make-party` passou a iniciar `statuses` vazio.

## Como verificar

- `npm test -- effective-modifiers statuses.test starting-player` cobre a fórmula, os contadores, a expiração em ordem e a recusa de um movimento para zona fora do mapa.
- Com o PostgreSQL no ar, `npm run test:e2e -- take-party-action create-party get-party list-parties start-session end-session abandon-party grant-to-member` cobre a integração. Equipar `fixture.guardian-armor` responde HTTP 200 com Defesa efetiva 19. No inventário, a Defesa fica em 5.

## Problemas

- A revisão encontrou um inteiro perdido por arredondamento intermediário (29 virava 28) e efeitos mistos aplicados parcialmente. Ambos ganharam cobertura.
- O schema estrito do save v6 recusou `statuses` quando o mapper copiava o estado do domínio inteiro. A gravação agora seleciona os campos do v6 explicitamente.
- O sandbox impediu o acesso ao cache nativo do SWC. Os testes usaram o executável do Vitest via Node com acesso autorizado ao cache. A primeira rodada e2e também atingiu o limite de tempo de inicialização em sete suítes. A reexecução concluiu todas as suítes afetadas.

## Checks

Guarda do domínio, tipos, lint, formatação e build passaram. Testes afetados: 414 unitários em 29 arquivos e 88 e2e em 13 arquivos.

## Ponte com o frontend

O contrato segue `acordado`. A ativação de efeitos entra na T-38. O save v7 e a exposição de `statuses` aos clientes entram na T-39.

## Commit sugerido

`feat/effect modifiers and status expiry (t-37)`

<!-- tempo: a preencher pelo autor -->
