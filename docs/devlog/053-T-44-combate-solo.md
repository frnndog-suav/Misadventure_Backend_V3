# 053 — T-44 — Critérios e proposta de contrato do combate solo

- Data — 2026-11-20
- Status — aguardando revisão
- Spec — v0.61
- Contrato — v0.60, `proposto (BE)`
- Horas — a preencher pelo autor

## Objetivo

Planejar a FEAT-13 a partir do ROADMAP v0.60 e dos 23 cenários da FEAT-12 confirmados no devlog 052. Entregar a proposta para revisão antes da implementação.

## Decisões

- REQ-117 a REQ-123 e T-44 a T-49 registrados na spec.
- D-108 mantém o jogador caído após o desfecho. Reflexão pode combinar vitória, recompensa e queda. A FEAT-14 introduz a recuperação do jogador.
- D-109 executa habilidades nas janelas elegíveis dentro e fora de combate e usa o EFEITOS-CATALOGO para definir a cobertura.
- D-110 acrescenta a reserva executável ao fundo dos decks legados sem consumir RNG e aguarda o fechamento de escolhas já abertas.

## Passos e arquivos

1. Conferir o ROADMAP v0.60, o CONTRATO v0.59, as regras e o fechamento no devlog 052.
2. Registrar critérios e tarefas em `docs/SPEC-BACKEND.md`.
3. Publicar a proposta documental em `docs/CONTRATO.md` §3 e registrar o andamento em `docs/ROADMAP.md`.
4. Registrar a etapa neste arquivo e no índice `docs/devlog/README.md`.

## Como verificar

Revisar os nove cenários da seção FEAT-13 do contrato. No caso de borda de Reflexão fatal com inventário cheio, a resposta esperada tem `victory`, `playerDown: true` e uma escolha de recompensa recuperável. Após a escolha, o save segue consultável e o jogador caído fica sem ações de aventura.

## Problemas e checks

A FEAT-13 precisa terminar o combate com 0 PV antes de existir respawn. A decisão provisória está em D-108. A revisão documental inclui `git diff --check`. Etapa sem código ou testes executados.

## Ponte com o frontend

Levar CONTRATO v0.60 e ROADMAP v0.61 completos. A T-44 aguarda confirmação do contrato. A T-45 depende desse acordo e de autorização para iniciar.

## Commit sugerido

`docs/propose solo combat contract (t-44)`
