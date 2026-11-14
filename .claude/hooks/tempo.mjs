#!/usr/bin/env node
// Registro automático de tempo de trabalho (hora do sistema).
//
// Uso:
//   node tempo.mjs evento <tipo>   (hooks UserPromptSubmit/Stop) grava um carimbo em .claude/tempo.jsonl
//   node tempo.mjs fechar <ETAPA>  (skill /registrar-etapa) soma o tempo ativo desde o último
//                                  fechamento, grava o marco e imprime JSON { data, horas, inicio, fim }
//   node tempo.mjs ver             mostra o tempo ativo desde o último fechamento, sem gravar
//
// Tempo ativo: soma dos intervalos entre carimbos consecutivos; intervalos maiores que
// PAUSA_MIN contam como pausa (não somam). Nunca falha: um hook com erro não pode travar a sessão.
import { appendFileSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const PAUSA_MIN = 30
const ARQ = join(dirname(fileURLToPath(import.meta.url)), '..', 'tempo.jsonl')

const dataLocal = (d) => d.toLocaleDateString('sv-SE') // AAAA-MM-DD no fuso do sistema
const horaLocal = (d) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const gravar = (obj) => appendFileSync(ARQ, JSON.stringify(obj) + '\n')

function lerEventos() {
  if (!existsSync(ARQ)) return []
  return readFileSync(ARQ, 'utf8')
    .split('\n')
    .filter(Boolean)
    .flatMap((l) => {
      try {
        return [JSON.parse(l)]
      } catch {
        return []
      }
    })
}

function desdeUltimoFechamento() {
  const evs = lerEventos()
  let i = evs.length - 1
  while (i >= 0 && evs[i].ev !== 'fechar') i--
  const ultimo = i >= 0 ? evs[i] : null
  const carimbos = evs.slice(i + 1).filter((e) => e.ev !== 'fechar').map((e) => new Date(e.ts))
  // O próprio fechamento acontece agora: conta até este instante.
  carimbos.push(new Date())
  // O intervalo entre o fechamento anterior e o primeiro carimbo novo também conta, se curto.
  if (ultimo) carimbos.unshift(new Date(ultimo.ts))
  let ms = 0
  for (let k = 1; k < carimbos.length; k++) {
    const gap = carimbos[k] - carimbos[k - 1]
    if (gap > 0 && gap <= PAUSA_MIN * 60000) ms += gap
  }
  const horas = Math.round((ms / 3600000) * 4) / 4 // arredonda a 15 min
  const ini = carimbos[ultimo ? 1 : 0] ?? carimbos[0]
  const fim = carimbos[carimbos.length - 1]
  return { data: dataLocal(fim), horas, inicio: horaLocal(ini), fim: horaLocal(fim), carimbos: carimbos.length - 1 }
}

try {
  const [modo, arg] = process.argv.slice(2)
  if (modo === 'evento') {
    gravar({ ts: new Date().toISOString(), ev: arg ?? 'evento' })
  } else if (modo === 'fechar') {
    const r = desdeUltimoFechamento()
    gravar({ ts: new Date().toISOString(), ev: 'fechar', etapa: arg ?? '?', horas: r.horas })
    console.log(JSON.stringify({ etapa: arg ?? '?', ...r }))
  } else if (modo === 'ver') {
    console.log(JSON.stringify(desdeUltimoFechamento()))
  } else {
    console.error('uso: tempo.mjs evento <tipo> | fechar <ETAPA> | ver')
  }
} catch (e) {
  console.error('tempo.mjs: ' + (e instanceof Error ? e.message : String(e)))
}
process.exit(0)
