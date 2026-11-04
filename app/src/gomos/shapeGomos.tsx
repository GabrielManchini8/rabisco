import { useEffect, useRef, useState } from 'react'
import {
  DefaultColorStyle, DefaultDashStyle, DefaultFillStyle, Editor, GeoShapeGeoStyle, TLShapeId,
  createShapeId, useEditor, useValue,
} from 'tldraw'
import { Action, actionsForSelection } from '../convert/converters'
import { openRadial } from '../convert/RadialMenu'
import { isMind } from '../mindmap/MindNodeShape'
import { openInfo } from '../info/ShapeInfo'

/**
 * "Gomos": o mesmo anel do conversor, reaproveitado para qualquer menu.
 * Um botão 🍊 aparece junto à seleção; tocar nele abre os gomos do contexto.
 */

// ---------- barra de cores (linear, não é anel) ----------
type BarTarget = 'selection' | 'next'
let setBar: (s: { x: number; y: number; target: BarTarget } | null) => void = () => {}
/** target 'next' = cor da próxima pincelada (gomos de caneta) */
export const openColorBar = (pos: { x: number; y: number } | null, target: BarTarget = 'selection') =>
  setBar(pos && { ...pos, target })
const COLORS = [
  ['black', '#1d1d1d'], ['grey', '#9fa8b2'], ['white', '#ffffff'], ['red', '#e03131'], ['light-red', '#ff8787'],
  ['orange', '#f76707'], ['yellow', '#f59f00'], ['green', '#099268'], ['light-green', '#40c057'],
  ['blue', '#4465e9'], ['light-blue', '#4ba1f1'], ['violet', '#ae3ec9'], ['light-violet', '#e599f7'],
] as const

function applyColor(editor: Editor, name: string, hex: string, target: BarTarget) {
  if (target === 'next') {
    editor.setStyleForNextShapes(DefaultColorStyle, name as any)
    if (!['draw', 'highlight', 'geo', 'arrow', 'line', 'text', 'note'].includes(editor.getCurrentToolId())) editor.setCurrentTool('draw')
    return
  }
  editor.run(() => {
    editor.setStyleForSelectedShapes(DefaultColorStyle, name as any)
    // nós do mapa mental usam hex próprio
    editor.getSelectedShapes().filter(isMind).forEach((s) =>
      editor.updateShape({ id: s.id, type: 'mind-node', props: { color: hex === '#ffffff' ? '#9fa8b2' : hex } }))
  })
}

export function ColorBar() {
  const editor = useEditor()
  const [pos, setPos] = useState<{ x: number; y: number; target: BarTarget } | null>(null)
  setBar = setPos
  const hasSel = useValue('sel', () => editor.getSelectedShapeIds().length > 0, [editor])
  useEffect(() => { if (!hasSel && pos?.target === 'selection') setPos(null) }, [hasSel])
  if (!pos) return null
  return (
    <div onPointerDown={(e) => e.stopPropagation()} style={{
      position: 'fixed', left: Math.max(8, Math.min(pos.x - 230, window.innerWidth - 470)), top: pos.y, zIndex: 400,
      display: 'flex', gap: 6, padding: 8, borderRadius: 999, background: 'var(--color-panel)',
      boxShadow: '0 4px 16px rgba(0,0,0,.2)', pointerEvents: 'all', maxWidth: 'calc(100vw - 16px)', overflowX: 'auto',
    }}>
      {COLORS.map(([name, hex]) => (
        <button key={name} title={name} onClick={() => { applyColor(editor, name, hex, pos.target); if (pos.target === 'next') setPos(null) }} style={{
          width: 28, height: 28, flex: '0 0 28px', borderRadius: 14, background: hex, cursor: 'pointer',
          border: '2px solid rgba(0,0,0,.15)',
        }} />
      ))}
      <button title="Fechar" onClick={() => setPos(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16 }}>✕</button>
    </div>
  )
}

// ---------- catálogos de gomos ----------
const GEO: [string, string, string][] = [
  ['rectangle', '▢', 'Quadrado'], ['ellipse', '◯', 'Círculo'], ['triangle', '△', 'Triângulo'], ['diamond', '◇', 'Losango'],
  ['star', '★', 'Estrela'], ['hexagon', '⬡', 'Hexágono'], ['cloud', '☁', 'Nuvem'], ['heart', '♥', 'Coração'],
  ['oval', '⬭', 'Oval'], ['arrow-right', '➜', 'Seta'], ['check-box', '☑', 'Check'], ['trapezoid', '⏢', 'Trapézio'],
]

function shapeGomos(editor: Editor): Action[] {
  return GEO.map(([geo, icon, label]) => ({
    id: geo, icon, label, run: async () => {
      editor.run(() => {
        const sel = editor.getSelectedShapes()
        const geos = sel.filter((s) => s.type === 'geo')
        if (geos.length) editor.setStyleForSelectedShapes(GeoShapeGeoStyle, geo as any)
        else {
          // nada geométrico selecionado (ex.: desenho à mão) → cria a forma no lugar
          const b = editor.getSelectionPageBounds()!
          const id = createShapeId()
          editor.createShape({ id, type: 'geo', x: b.x, y: b.y, props: { geo: geo as any, w: Math.max(b.w, 40), h: Math.max(b.h, 40) } })
          editor.select(id)
        }
      })
    },
  }))
}

const styleGomos = (editor: Editor): Action[] => [
  { id: 'none', icon: '◻', label: 'Sem fundo', run: async () => { editor.setStyleForSelectedShapes(DefaultFillStyle, 'none') } },
  { id: 'semi', icon: '◩', label: 'Suave', run: async () => { editor.setStyleForSelectedShapes(DefaultFillStyle, 'semi') } },
  { id: 'solid', icon: '◼', label: 'Sólido', run: async () => { editor.setStyleForSelectedShapes(DefaultFillStyle, 'solid') } },
  { id: 'pattern', icon: '▨', label: 'Hachura', run: async () => { editor.setStyleForSelectedShapes(DefaultFillStyle, 'pattern') } },
  { id: 'draw', icon: '〰', label: 'À mão', run: async () => { editor.setStyleForSelectedShapes(DefaultDashStyle, 'draw') } },
  { id: 'solid-l', icon: '—', label: 'Linha', run: async () => { editor.setStyleForSelectedShapes(DefaultDashStyle, 'solid') } },
  { id: 'dashed', icon: '╌', label: 'Tracejado', run: async () => { editor.setStyleForSelectedShapes(DefaultDashStyle, 'dashed') } },
  { id: 'dotted', icon: '┈', label: 'Pontilhado', run: async () => { editor.setStyleForSelectedShapes(DefaultDashStyle, 'dotted') } },
]

/** Gomos principais da seleção. Gomos com ▸ abrem um sub-anel. */
export function mainGomos(editor: Editor, at: { x: number; y: number }): Action[] {
  const ids = editor.getSelectedShapeIds()
  const sub = (actions: Action[]) => openRadial({ ...at, actions: [back(editor, at), ...actions] })
  return [
    { id: 'info', icon: '✎', label: 'Nome / Obs', run: async () => openInfo(ids[0]) },
    { id: 'forma', icon: '⬟', label: 'Forma ▸', run: async () => sub(shapeGomos(editor)) },
    { id: 'cor', icon: '🎨', label: 'Cor', run: async () => openColorBar({ x: at.x, y: at.y + 130 }) },
    { id: 'estilo', icon: '▨', label: 'Estilo ▸', run: async () => sub(styleGomos(editor)) },
    { id: 'conv', icon: '🔁', label: 'Exportar ▸', run: async () => sub(actionsForSelection(editor, ids)) },
    { id: 'dup', icon: '⧉', label: 'Duplicar', run: async () => { editor.duplicateShapes(ids, { x: 24, y: 24 }) } },
    { id: 'front', icon: '⬆', label: 'Frente', run: async () => { editor.bringToFront(ids) } },
    { id: 'back', icon: '⬇', label: 'Trás', run: async () => { editor.sendToBack(ids) } },
    { id: 'lock', icon: '🔒', label: 'Travar', run: async () => { editor.toggleLock(ids) } },
    { id: 'del', icon: '🗑', label: 'Apagar', run: async () => { editor.deleteShapes(ids as TLShapeId[]) } },
  ]
}
const back = (editor: Editor, at: { x: number; y: number }): Action =>
  ({ id: 'voltar', icon: '↩', label: 'Voltar', run: async () => openRadial({ ...at, actions: mainGomos(editor, at) }) })

/** Botão 🍊 que acompanha a seleção (funciona com toque, caneta e mouse) */
export function GomoButton() {
  const editor = useEditor()
  const pos = useValue('gomo-pos', () => {
    if (editor.getEditingShapeId() || !editor.getSelectedShapeIds().length) return null
    if (!editor.isIn('select.idle')) return null // some enquanto arrasta/redimensiona
    const b = editor.getSelectionRotatedScreenBounds()
    const vp = editor.getViewportScreenBounds()
    if (!b) return null
    // mantém o botão sempre visível, mesmo com a figura na borda ou maior que a tela
    return { x: Math.min(Math.max(b.maxX + vp.x + 18, vp.x + 24), vp.x + vp.w - 24), y: Math.min(Math.max(b.minY + vp.y - 18, vp.y + 60), vp.y + vp.h - 24) }
  }, [editor])
  if (!pos) return null
  return (
    <button title="Gomos (formas, cor, estilo, exportar…)" onPointerDown={(e) => e.stopPropagation()}
      onClick={() => { const at = { x: pos.x, y: pos.y + 110 }; openRadial({ ...at, actions: mainGomos(editor, at) }) }}
      style={{
        position: 'fixed', left: pos.x - 16, top: pos.y - 16, width: 32, height: 32, borderRadius: 16, zIndex: 350,
        border: 'none', background: '#ff922b', color: '#fff', fontSize: 16, cursor: 'pointer', pointerEvents: 'all',
        boxShadow: '0 2px 8px rgba(0,0,0,.25)',
      }}>🍊</button>
  )
}

/**
 * Quadrinho "cor atual / cor anterior" ao lado do 🍊.
 * Toque troca as duas — bom para alternar, p.ex., azul ↔ vermelho ao anotar.
 */
const HEX: Record<string, string> = Object.fromEntries(COLORS)
export function ColorSwap() {
  const editor = useEditor()
  const current = useValue('next-color', () => editor.getStyleForNextShape(DefaultColorStyle), [editor])
  const [prev, setPrev] = useState<string>(() => { try { return localStorage.getItem('rabisco:prevColor') || 'red' } catch { return 'red' } })
  const last = useRef(current)
  useEffect(() => {
    if (current !== last.current) {
      setPrev(last.current)
      try { localStorage.setItem('rabisco:prevColor', last.current) } catch {}
      last.current = current
    }
  }, [current])
  const swap = () => {
    editor.setStyleForNextShapes(DefaultColorStyle, prev as any)
    // se houver seleção, pinta também (como nos apps de desenho)
    if (editor.getSelectedShapeIds().length) editor.setStyleForSelectedShapes(DefaultColorStyle, prev as any)
  }
  const sq = (c: string): React.CSSProperties => ({ position: 'absolute', width: 24, height: 24, borderRadius: 6, background: HEX[c] ?? c, border: '2px solid var(--color-panel)', boxShadow: '0 1px 4px rgba(0,0,0,.35)' })
  return (
    <button title="Trocar entre a cor atual e a anterior" onPointerDown={(e) => e.stopPropagation()} onClick={swap}
      style={{ position: 'fixed', left: 74, bottom: 70, width: 40, height: 40, zIndex: 300, border: 'none', background: 'transparent', cursor: 'pointer', pointerEvents: 'all', padding: 0 }}>
      <span style={{ ...sq(prev), right: 0, bottom: 0 }} />
      <span style={{ ...sq(current), left: 0, top: 0 }} />
      <span style={{ position: 'absolute', right: -6, top: -6, fontSize: 11 }}>⇄</span>
    </button>
  )
}
