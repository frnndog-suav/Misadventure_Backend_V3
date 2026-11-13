---
name: checar
description: Roda a definição de pronto do backend - guarda do domínio, tipos, lint, formatação, testes afetados (/testar) e build - e confere spec, contrato, rastreabilidade e devlog. Use ao final de qualquer tarefa, antes de marcar [x], ou quando o autor perguntar se está tudo verde.
---

# /checar — definição de pronto

Rode nesta ordem e **não pare no primeiro erro** (colete tudo). Comando que ainda não existe (antes da FEAT-01) → "não configurado".
1. `node .claude/hooks/domain-guard.mjs --all`
2. `npm run typecheck`
3. `npm run lint`
4. `npm run format:check`
5. **/testar** (só os afetados)
6. `npm run build` (apague `dist/` depois)

Confira manualmente:
- **Spec atualizada:** decisões no diff que não estão na spec.
- **Contrato:** todo endpoint, campo, evento e código de erro do diff está em `docs/CONTRATO.md` numa seção `acordado` (ou adiante). Presenter devolve exatamente os nomes do contrato.
- **Rastreabilidade:** cada `REQ-xx` da tarefa aparece em pelo menos um nome de teste (Grep).
- **Camadas:** nada de `src/infra` importado por `src/core`/`src/domain`; nenhum `@Injectable` no domínio.
- **Devlog:** entrada da tarefa existe e está no índice.
- **Segredos:** `git status` não lista `.env`.

## Saída
| Check | Resultado |
|---|---|
| guarda do domínio | ✅ / ❌ (n violações) |
| tipos | … |
| lint | … |
| formatação | … |
| testes unitários (afetados) | x passando, y falhando |
| e2e (controllers afetados) | … / "nenhum afetado" |
| build | … |
| spec atualizada | … |
| contrato | … |
| rastreabilidade | … |
| camadas | … |
| devlog | … |
| segredos fora do Git | … |

Abaixo, a saída de cada falha (arquivo:linha e mensagem). **Não corrija nada automaticamente**; quem chamou decide (exceção: formatação).
