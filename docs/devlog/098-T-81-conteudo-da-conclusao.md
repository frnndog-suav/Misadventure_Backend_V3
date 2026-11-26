# 098 — T-81 — Conteúdo da conclusão e Pico no laboratório

- Data — 2026-11-26
- Status — concluída
- Spec — v1.03, REQ-164 e REQ-165
- Contrato — v0.96, FEAT-19 `acordado`
- Horas — a preencher pelo autor

## Objetivo

Aceitar e projetar `completionItem` e `completion`, validar a conclusão no catálogo e no editor e disponibilizar os ajustes de Pico do laboratório. O uso de `bossPeakGain` em combate pertence à T-83.

## Arquivos e implementação

- `value-objects/card`, `catalog-integrity`, `dimension-composition`, `validate-dimension` e `delete-card` — tipos, validação de zona, requisito, prêmio e chefe, proteção do item citado e verificação de conteúdo publicado. O chefe reutiliza a validação de execução do combate.
- `card-schemas.ts`, `content-messages.ts` e `CardPresenter` — leitura e projeção dos padrões legados, caminhos e mensagens em pt-BR. `ContentReferencedError` identifica a referência de conclusão.
- `game-config/defaults.ts` e `drizzle-party-mapper.ts` — chaves inteiras de 0 a 1000, padrões 25 e 15 e normalização de snapshots legados pelo mecanismo de configuração opcional do save.
- `dimension-completion-content.test.ts`, testes de `update-game-config` e `drizzle-party-mapper` — conteúdo, mensagens, referências, configuração e leitura legada.

## Verificação

O autor confirmou o vermelho inicial com 12 falhas novas e 8 casos existentes aprovados. Após a implementação, TypeScript e ESLint nos arquivos alterados passaram. O validador de conteúdo aceitou a fixture com 1 coleção e 30 cartas.

Na primeira execução após a implementação, 66 testes passaram e 15 casos legados do mapper falharam. A factory partilhada `test/factories/remove-post-v6-config.ts` mantinha as chaves novas ao simular saves v2 a v6. Ela agora remove as duas chaves de Pico, de modo que as fixtures representem os formatos históricos e continuem sujeitas à validação estrita dos saves.

```bash
cd /d/Github/Misadventure_Backend_V3
npm test -- src/infra/content/dimension-completion-content.test.ts src/domain/lab/application/use-cases/update-game-config/index.test.ts src/infra/database/drizzle/mappers/drizzle-party-mapper.test.ts src/infra/database/drizzle/mappers/drizzle-party-mapper.mount.test.ts src/domain/catalog/application/use-cases/validate-dimension/index.test.ts
```

Esperado — suítes verdes. Um PATCH que combina Pico de conclusão válido com Pico de Chefe fracionário deve preservar a configuração inteira. A validação unitária dispensa serviços locais.

Resultado — o autor confirmou que todos os testes das cinco suítes passaram após a correção da factory. O total de testes da execução final ficou sem registro.

## Pendências

- D-60(j) foi revisada. A duplicação de dimensão continua como pendência do fluxo preexistente e exige decisão própria caso seja alterada.
- Retomada na T-82 após autorização do autor. Implementar a área de itens de conclusão (REQ-166, REQ-172).
- Os cenários de integração e o registro das mensagens finais no contrato ficam na T-86.

## Commit sugerido

`feat/add dimension completion content (t-81)`
