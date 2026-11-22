# 066 — FEAT-15 — Planejamento solo no backend

- Data — 2026-11-22
- Status — concluída
- Spec — v0.66, REQ-131 a REQ-135, D-111 e T-55 a T-60
- Contrato — v0.74, seção FEAT-15 acordada na v0.73
- Horas — a preencher pelo autor

## Escopo e sequência

A T-54 foi encerrada com a FEAT-14 validada. O autor autorizou planejar a FEAT-15 e confirmou o aceite com MSW registrado no devlog 091 do frontend. A entrega começa pelo conteúdo e laboratório (T-55), passa pelo quadro e ações de zona, desfechos e recompensas, provação e mentor, e ativação pela build. A T-60 prepara campanhas independentes no banco de teste e entrega a URL da API, os IDs das campanhas e o ID da coleção para o frontend validar os REQ-66 a REQ-70 com MSW desligado.

## Arquivos e verificação

- `docs/SPEC-BACKEND.md` registra critérios, persistência e tarefas em ordem de dependência.
- `docs/ROADMAP.md` v0.66 registra o frontend pronto com MSW e o planejamento no backend.
- O índice do devlog aponta para esta entrada. Conferência documental com as regras, a seção FEAT-15 do contrato e os retornos do autor. `git diff --check` passou. Etapa documental.

## Pendências

- A primeira implementação é a T-55, após autorização do autor. Seu escopo são os formatos de conteúdo e os dez ajustes acordados.
- O Apêndice A do README define Pico por conclusão de missão de zona (+3) ou genérica (+5) como ajustável. O contrato descreve os passos de Pico da carta e os dez ajustes, sem explicitar como representar esses dois ganhos de conclusão no laboratório. Antes dos testes que dependam desse ganho na T-57 e na T-58, conciliar a regra com o contrato e obter acordo se houver alteração da interface pública. A T-55 pode seguir com os ajustes já acordados.

Commit sugerido: `docs/plan solo quests and class progression (feat-15)`
