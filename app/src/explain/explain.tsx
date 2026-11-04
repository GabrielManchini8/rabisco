import { useEffect, useRef, useState } from 'react'
import { Box, Editor, TLShape, TLShapeId, atom, createShapeId, toRichText, useEditor, useValue } from 'tldraw'
import { startRecording, transcribe, Chunk } from '../voice/transcribe'
import { db } from '../db/local'
import { getInfo } from '../info/ShapeInfo'

/**
 * 🎬 Explicação guiada: grava a voz ENQUANTO você desenha.
 * Cada traço/figura recebe o instante em que foi criado. Ao parar:
 *  1. Whisper transcreve com tempos;
 *  2. cada trecho falado é ligado às figuras desenhadas naquele momento
 *     (vira a "Obs" delas + legenda numerada ao lado);
 *  3. tudo é envolvido numa moldura com a transcrição completa;
 *  4. ▶ Reproduzir toca o áudio e redesenha o quadro em sincronia.
 */
type Session = { start: number; created: Map<TLShapeId, number>; stop: () => Promise<Blob> }
let session: Session | null = null
const recState = atom<'idle' | 'recording' | 'processing'>('rec', 'idle')
let setStatus: (s: string) => void = () => {}

/** Durante a reprodução: figuras com t > agora ficam ocultas */
export const replay = atom<{ frame: TLShapeId; t: number } | null>('replay', null)
export function replayVisibility(shape: TLShape, editor: Editor): 'hidden' | null {
  const r = replay.get()
  if (!r) return null
  const t = (shape.meta as any)?.explainT
  if (typeof t === 'number' && (shape.meta as any)?.explainFrame === r.frame && t > r.t) return 'hidden'
  return null
}

export async function startExplain(editor: Editor) {
  if (session) return
  const rec = await startRecording()
  const created = new Map<TLShapeId, number>()
  const start = performance.now()
  const off = editor.sideEffects.registerAfterCreateHandler('shape', (s) => {
    if (s.type !== 'frame') created.set(s.id, (performance.now() - start) / 1000)
  })
  session = { start, created, stop: async () => { off(); return rec.stop() } }
  recState.set('recording')
}

export async function stopExplain(editor: Editor) {
  if (!session) return
  const s = session; session = null
  recState.set('processing')
  try {
    const blob = await s.stop()
    const audioId = crypto.randomUUID()
    await db.media.put({ id: audioId, blob, createdAt: Date.now() })
    const ids = [...s.created.keys()].filter((id) => editor.getShape(id))
    const { text, chunks } = await transcribe(blob, setStatus, undefined, true) // tempos por palavra
    fillBoard(editor, ids, s.created, chunks, text, audioId)
  } catch (e) {
    alert('Não foi possível processar a explicação: ' + (e as Error).message)
  } finally { recState.set('idle'); setStatus('') }
}

function fillBoard(editor: Editor, ids: TLShapeId[], times: Map<TLShapeId, number>, chunks: Chunk[], full: string, audioId: string) {
  const when = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  editor.run(() => {
    // Moldura em volta de tudo que foi desenhado (ou no centro, se só houve fala)
    let bounds = Box.Common(ids.map((id) => editor.getShapePageBounds(id)!).filter(Boolean))
    if (!ids.length) { const c = editor.getViewportPageBounds().center; bounds = new Box(c.x - 200, c.y - 120, 400, 240) }
    const frameId = createShapeId()
    const pad = 60
    editor.createShape({ id: frameId, type: 'frame', x: bounds.x - pad, y: bounds.y - pad,
      props: { w: bounds.w + pad * 2 + 300, h: bounds.h + pad * 2, name: `🎬 Desenho guiado ${when}` },
      meta: { name: `Desenho guiado ${when}`, obs: full, explain: { audioId, chunks } } })
    editor.sendToBack([frameId])
    if (ids.length) editor.reparentShapes(ids, frameId)

    // Agrupa traços feitos em sequência (pausa < 1,5 s = mesmo "gesto") e dá a cada grupo
    // as palavras faladas desde que ele começou até o próximo grupo começar.
    const sorted = [...ids].sort((a, b) => times.get(a)! - times.get(b)!)
    const groups: { start: number; ids: TLShapeId[] }[] = []
    for (const id of sorted) {
      const t = times.get(id)!, last = groups.at(-1)
      const lastT = last ? times.get(last.ids.at(-1)!)! : -Infinity
      if (last && t - lastT < 1.5) last.ids.push(id); else groups.push({ start: t, ids: [id] })
    }
    const anchors: TLShapeId[] = []
    const LEAD = 0.8 // a gente costuma começar a falar um pouco antes de riscar
    groups.forEach((g, i) => {
      const from = i === 0 ? -Infinity : g.start - LEAD
      const to = groups[i + 1] ? groups[i + 1].start - LEAD : Infinity
      const said = chunks.filter((w) => w.timestamp[0] >= from && w.timestamp[0] < to).map((w) => w.text).join('').trim()
      if (!said) return
      for (const id of g.ids) {
        const sh = editor.getShape(id)!; const prev = getInfo(sh).obs
        editor.updateShape({ id, type: sh.type, meta: { ...sh.meta, obs: (prev ? prev + '\n' : '') + said, explainT: times.get(id), explainFrame: frameId } })
      }
      // Forma "recipiente": algo fechado que você desenhou (círculo/caixa à mão) ou uma forma pronta.
      const container = g.ids.map((id) => editor.getShape(id)!).filter((sh) => isContainer(editor, sh))
        .sort((a, b) => area(editor, b.id) - area(editor, a.id))[0]
      const num = '①②③④⑤⑥⑦⑧⑨⑩'[i] ?? `${i + 1}.`
      if (container) {
        // texto DENTRO da forma desenhada, centralizado
        let cb = editor.getShapePageBounds(container.id)!
        // área útil dentro de uma elipse/caixa à mão ≈ 70% da largura e 65% da altura
        let w = Math.max(80, cb.w * 0.7)
        const tid = createShapeId()
        editor.createShape({ id: tid, type: 'text', parentId: frameId, ...pageToFrame(editor, frameId, cb.midX - w / 2, cb.midY - 12),
          props: { richText: toRichText(said), autoSize: false, w, size: 'm', font: 'sans', textAlign: 'middle' },
          meta: { explainT: g.start, explainFrame: frameId, step: i + 1 } })
        // não coube? 1º diminui a fonte; 2º aumenta a forma desenhada (proporcional, a partir do centro)
        if (editor.getShapePageBounds(tid)!.h > cb.h * 0.65) editor.updateShape({ id: tid, type: 'text', props: { size: 's' } })
        const need = editor.getShapePageBounds(tid)!.h / (cb.h * 0.65)
        if (need > 1) {
          const k = Math.min(Math.sqrt(need) * 1.05, 3)
          editor.resizeShape(container.id, { x: k, y: k }, { scaleOrigin: cb.center, isAspectRatioLocked: true })
          cb = editor.getShapePageBounds(container.id)!
          w = Math.max(80, cb.w * 0.7)
          editor.updateShape({ id: tid, type: 'text', props: { w } })
        }
        // centraliza na vertical depois de medir a altura real
        const tb = editor.getShapePageBounds(tid)!
        editor.updateShape({ id: tid, type: 'text', ...pageToFrame(editor, frameId, cb.midX - w / 2, cb.midY - tb.h / 2) })
        anchors.push(container.id)
      } else {
        // traço aberto (seta, sublinhado, rabisco) → legenda numerada ao lado
        const gb = Box.Common(g.ids.map((id) => editor.getShapePageBounds(id)!))
        editor.createShape({ type: 'text', parentId: frameId, ...pageToFrame(editor, frameId, gb.maxX + 16, gb.y),
          props: { richText: toRichText(`${num} ${said}`), autoSize: false, w: 260, size: 's', font: 'sans', color: 'grey' },
          meta: { explainT: g.start, explainFrame: frameId, step: i + 1 } })
        anchors.push(g.ids[0])
      }
    })
    // Fluxo: conecta as formas na ordem em que você falou (só entre recipientes,
    // para não ligar rabiscos soltos; não liga se você já desenhou uma seta entre eles)
    const boxes = anchors.filter((id) => isContainer(editor, editor.getShape(id)!))
    for (let k = 0; k + 1 < boxes.length; k++) connectFlow(editor, frameId, boxes[k], boxes[k + 1], ids)
    // marca o tempo de quem não caiu em nenhum trecho (para o replay)
    ids.forEach((id) => { const sh = editor.getShape(id)!; if ((sh.meta as any).explainT === undefined)
      editor.updateShape({ id, type: sh.type, meta: { ...sh.meta, explainT: times.get(id), explainFrame: frameId } }) })
    editor.select(frameId)
  })
}
const pageToFrame = (editor: Editor, frameId: TLShapeId, x: number, y: number) => {
  const f = editor.getShape(frameId)!; return { x: x - f.x, y: y - f.y }
}

// ---------- reprodução ----------
let audioEl: HTMLAudioElement | null = null
export async function playExplain(editor: Editor, frameId: TLShapeId) {
  const f = editor.getShape(frameId); const ex = (f?.meta as any)?.explain
  if (!ex) return
  const m = await db.media.get(ex.audioId)
  if (!m) return alert('Áudio desta explicação não está neste aparelho (sincronização de áudio ainda não implementada).')
  audioEl?.pause()
  audioEl = new Audio(URL.createObjectURL(m.blob))
  editor.zoomToBounds(editor.getShapePageBounds(frameId)!, { animation: { duration: 300 } })
  replay.set({ frame: frameId, t: 0 })
  const tick = () => { if (!audioEl) return; replay.set({ frame: frameId, t: audioEl.currentTime }); if (!audioEl.paused) requestAnimationFrame(tick) }
  audioEl.onplay = tick
  audioEl.onended = () => stopReplay()
  audioEl.play()
}
export function stopReplay() { audioEl?.pause(); audioEl = null; replay.set(null) }

// ---------- UI ----------
export function ExplainBar() {
  const editor = useEditor()
  const state = useValue(recState)
  const rp = useValue(replay)
  const [status, _set] = useState(''); setStatus = _set
  const [secs, setSecs] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval>>()
  useEffect(() => {
    if (state === 'recording') { setSecs(0); timer.current = setInterval(() => setSecs((s) => s + 1), 1000) }
    return () => clearInterval(timer.current)
  }, [state])
  const caption = useValue('caption', () => {
    const r = replay.get(); if (!r) return ''
    const ch: Chunk[] = (editor.getShape(r.frame)?.meta as any)?.explain?.chunks ?? []
    return ch.filter((c) => c.timestamp[0] <= r.t).slice(-14).map((c) => c.text).join('').trim()
  }, [editor])
  const selFrame = useValue('sel-explain', () => {
    const s = editor.getOnlySelectedShape(); return s && (s.meta as any)?.explain ? s.id : null
  }, [editor])

  const bar: React.CSSProperties = { position: 'fixed', left: '50%', transform: 'translateX(-50%)', zIndex: 420, pointerEvents: 'all',
    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 999, fontFamily: 'system-ui', fontSize: 14,
    background: 'var(--color-panel)', color: 'var(--color-text)', boxShadow: '0 4px 18px rgba(0,0,0,.25)' }
  const b: React.CSSProperties = { border: 'none', borderRadius: 999, padding: '6px 12px', cursor: 'pointer', background: '#ff922b', color: '#fff' }

  if (state === 'recording') return (
    <div style={{ ...bar, top: 12 }} onPointerDown={(e) => e.stopPropagation()}>
      <span style={{ width: 10, height: 10, borderRadius: 5, background: '#e03131', animation: 'rabisco-blink 1s infinite' }} />
      🎬 Desenho guiado — fale e desenhe
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}</span>
      <button style={b} onClick={() => stopExplain(editor)}>■ Concluir</button>
      <style>{'@keyframes rabisco-blink{50%{opacity:.2}}'}</style>
    </div>
  )
  if (state === 'processing') return <div style={{ ...bar, top: 12 }}>⏳ {status || 'Processando…'}</div>
  if (rp) return (
    <div style={{ ...bar, bottom: 120, maxWidth: 'min(700px, calc(100vw - 32px))', borderRadius: 16 }} onPointerDown={(e) => e.stopPropagation()}>
      <span style={{ flex: 1 }}>{caption || '…'}</span>
      <button style={b} onClick={stopReplay}>■</button>
    </div>
  )
  if (selFrame) return (
    <div style={{ ...bar, top: 12 }} onPointerDown={(e) => e.stopPropagation()}>
      <button style={b} onClick={() => playExplain(editor, selFrame)}>▶ Reproduzir desenho guiado</button>
    </div>
  )
  return null
}

// ---------- desenho guiado: utilitários ----------
const area = (editor: Editor, id: TLShapeId) => { const b = editor.getShapePageBounds(id); return b ? b.w * b.h : 0 }

/** Fechado = geo pronta, desenho que o tldraw fechou, ou traço cujo fim volta perto do início */
function isContainer(editor: Editor, sh: TLShape) {
  const b = editor.getShapePageBounds(sh.id)
  if (!b || b.w < 40 || b.h < 30) return false
  if (sh.type === 'geo' || sh.type === 'note' || sh.type === 'frame') return true
  if (sh.type !== 'draw') return false
  if ((sh.props as any).isClosed) return true
  const pts = editor.getShapeGeometry(sh.id).vertices
  if (pts.length < 8) return false
  // círculo/caixa à mão: o fim do traço volta para perto de algum ponto do começo
  const z = pts[pts.length - 1], tol = Math.max(b.w, b.h) * 0.3
  return pts.slice(0, Math.ceil(pts.length * 0.4)).some((a) => Math.hypot(a.x - z.x, a.y - z.y) < tol)
}

function connectFlow(editor: Editor, frameId: TLShapeId, from: TLShapeId, to: TLShapeId, drawn: TLShapeId[]) {
  // se já existe um traço seu ligando as duas, respeita o seu desenho
  const fb = editor.getShapePageBounds(from)!, tb = editor.getShapePageBounds(to)!
  const hasManual = drawn.some((id) => {
    if (id === from || id === to) return false
    const b = editor.getShapePageBounds(id)!
    return b.collides(fb.clone().expandBy(30)) && b.collides(tb.clone().expandBy(30))
  })
  if (hasManual) return
  const arrowId = createShapeId()
  editor.createShape({ id: arrowId, type: 'arrow', parentId: frameId, meta: { explainFlow: true },
    props: { color: 'orange', dash: 'dashed', size: 's', arrowheadEnd: 'arrow', bend: 0 } })
  for (const [terminal, target] of [['start', from], ['end', to]] as const)
    editor.createBinding({ type: 'arrow', fromId: arrowId, toId: target,
      props: { terminal, normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false } })
}
