import { useEffect, useState } from 'react'
import { Editor, useEditor } from 'tldraw'
import { Action, actionsForFiles, actionsForSelection } from './converters'

/**
 * Anel de ações em volta do ponteiro.
 *  - Arraste arquivos segurando Shift  → anel de conversões (em vez de inserir direto)
 *  - Botão direito / pressionar e segurar 600ms com algo selecionado → anel de exportação
 *  - Botão "Converter" da barra → escolhe arquivos e abre o anel
 */
type State = { x: number; y: number; actions: Action[] } | null
let open: (s: State) => void = () => {}
let current: State = null
export const openRadial = (s: State) => open(s)

export function RadialMenu() {
  const editor = useEditor()
  const [state, setState] = useState<State>(null)
  const [busy, setBusy] = useState<string | null>(null)
  open = (s) => { current = s; setState(s) }

  useEffect(() => installTriggers(editor), [editor])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setState(null)
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc)
  }, [])
  if (!state) return null

  const n = state.actions.length, R = Math.max(96, n * 12)
  return (
    <div onPointerDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) setState(null) }}
      style={{ position: 'fixed', inset: 0, zIndex: 500, pointerEvents: 'all', background: 'rgba(0,0,0,.08)' }}>
      <div style={{ position: 'absolute', left: Math.min(Math.max(state.x, R + 40), window.innerWidth - R - 40), top: Math.min(Math.max(state.y, R + 30), window.innerHeight - R - 30) }}>
        <div style={{ position: 'absolute', left: -22, top: -22, width: 44, height: 44, borderRadius: 22, background: '#ff922b', boxShadow: '0 2px 10px rgba(0,0,0,.25)', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 18 }}>{busy ? '⏳' : '✕'}</div>
        {state.actions.map((a, i) => {
          const ang = (i / n) * Math.PI * 2 - Math.PI / 2
          return (
            <button key={a.id} disabled={!!busy}
              onClick={async () => { const before = current; setBusy(a.id); try { await a.run() } catch (e) { alert('Falhou: ' + (e as Error).message) } setBusy(null); if (current === before) setState(null) }}
              style={{
                position: 'absolute', left: Math.cos(ang) * R - 38, top: Math.sin(ang) * R - 26, width: 76, minHeight: 52,
                borderRadius: 16, border: 'none', background: 'var(--color-panel)', color: 'var(--color-text)',
                boxShadow: '0 3px 12px rgba(0,0,0,.2)', cursor: 'pointer', fontSize: 11, lineHeight: 1.2,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                opacity: busy && busy !== a.id ? 0.5 : 1, animation: `rabisco-pop .18s ${i * 0.02}s both`,
              }}>
              <span style={{ fontSize: 18 }}>{a.icon}</span>{a.label}
            </button>
          )
        })}
      </div>
      <style>{'@keyframes rabisco-pop{from{transform:scale(.3);opacity:0}to{transform:scale(1);opacity:1}}'}</style>
    </div>
  )
}

function installTriggers(editor: Editor) {
  const container = editor.getContainer()
  // 1) Shift + soltar arquivo → conversões
  const onDrop = (e: DragEvent) => {
    if (!e.shiftKey || !e.dataTransfer?.files.length) return
    e.preventDefault(); e.stopPropagation()
    const files = [...e.dataTransfer.files]
    const at = editor.screenToPage({ x: e.clientX, y: e.clientY })
    open({ x: e.clientX, y: e.clientY, actions: actionsForFiles(editor, files, at) })
  }
  // 2) botão direito com seleção → exportar
  const onContext = (e: MouseEvent) => {
    const ids = editor.getSelectedShapeIds()
    if (!ids.length || !e.altKey) return // Alt+clique direito; o menu normal do tldraw continua no clique direito simples
    e.preventDefault(); e.stopPropagation()
    open({ x: e.clientX, y: e.clientY, actions: actionsForSelection(editor, ids) })
  }
  // 3) toque longo (mobile) com seleção → exportar
  let timer: ReturnType<typeof setTimeout> | undefined
  const onDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return
    const { clientX: x, clientY: y } = e
    timer = setTimeout(() => {
      const ids = editor.getSelectedShapeIds()
      if (ids.length && !editor.inputs.isDragging) open({ x, y, actions: actionsForSelection(editor, ids) })
    }, 600)
  }
  const cancel = () => clearTimeout(timer)
  container.addEventListener('drop', onDrop, true)
  container.addEventListener('contextmenu', onContext, true)
  container.addEventListener('pointerdown', onDown, true)
  container.addEventListener('pointerup', cancel, true)
  container.addEventListener('pointermove', cancel, true)
  return () => {
    container.removeEventListener('drop', onDrop, true)
    container.removeEventListener('contextmenu', onContext, true)
    container.removeEventListener('pointerdown', onDown, true)
    container.removeEventListener('pointerup', cancel, true)
    container.removeEventListener('pointermove', cancel, true)
  }
}
