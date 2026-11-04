import { useState } from 'react'
import { Editor, useEditor, useValue } from 'tldraw'
import { openRadial } from '../convert/RadialMenu'
import { rootGomos } from '../gomos/toolGomos'
import { mainGomos } from '../gomos/shapeGomos'
import { openSearch } from '../search/SearchPanel'

/**
 * Régua lateral de organização (como Figma/Keynote/PowerPoint).
 * Botões ficam desabilitados quando não fazem sentido para a seleção.
 * Recolhível para liberar espaço no celular.
 */
type Item = { icon: string; label: string; key?: string; need?: number; run: (e: Editor) => void } | 'sep'

const ITEMS: Item[] = [
  { icon: '➕', label: 'Inserir', run: (e) => { const at = { x: 140, y: window.innerHeight / 2 }; openRadial({ ...at, actions: rootGomos(e, at) }) } },
  { icon: '🔍', label: 'Buscar', key: 'Ctrl+K', run: () => openSearch() },
  'sep',
  { icon: '⧉', label: 'Duplicar', key: 'Ctrl+D', need: 1, run: (e) => e.duplicateShapes(e.getSelectedShapeIds(), { x: 24, y: 24 }) },
  { icon: '▣', label: 'Agrupar', key: 'Ctrl+G', need: 2, run: (e) => e.groupShapes(e.getSelectedShapeIds()) },
  { icon: '⊟', label: 'Desagrupar', key: 'Ctrl+Shift+G', need: 1, run: (e) => e.ungroupShapes(e.getSelectedShapeIds()) },
  'sep',
  { icon: '⤒', label: 'Trazer para frente', key: ']', need: 1, run: (e) => e.bringToFront(e.getSelectedShapeIds()) },
  { icon: '↑', label: 'Avançar um', need: 1, run: (e) => e.bringForward(e.getSelectedShapeIds()) },
  { icon: '↓', label: 'Recuar um', need: 1, run: (e) => e.sendBackward(e.getSelectedShapeIds()) },
  { icon: '⤓', label: 'Enviar para trás', key: '[', need: 1, run: (e) => e.sendToBack(e.getSelectedShapeIds()) },
  'sep',
  { icon: '⫼', label: 'Alinhar / distribuir', need: 2, run: (e) => {
    const ids = e.getSelectedShapeIds(), at = { x: 170, y: window.innerHeight / 2 }
    const a = (icon: string, label: string, f: () => void) => ({ id: label, icon, label, run: async () => { e.markHistoryStoppingPoint(label); f() } })
    openRadial({ ...at, actions: [
      a('⫷', 'Esquerda', () => e.alignShapes(ids, 'left')), a('⫼', 'Centro H', () => e.alignShapes(ids, 'center-horizontal')),
      a('⫸', 'Direita', () => e.alignShapes(ids, 'right')), a('⊤', 'Topo', () => e.alignShapes(ids, 'top')),
      a('⊟', 'Centro V', () => e.alignShapes(ids, 'center-vertical')), a('⊥', 'Base', () => e.alignShapes(ids, 'bottom')),
      ...(ids.length > 2 ? [a('⇹', 'Distribuir H', () => e.distributeShapes(ids, 'horizontal')), a('⇳', 'Distribuir V', () => e.distributeShapes(ids, 'vertical'))] : []),
    ] })
  } },
  'sep',
  { icon: '🔒', label: 'Travar / destravar', key: 'Shift+L', need: 1, run: (e) => e.toggleLock(e.getSelectedShapeIds()) },
  { icon: '🍊', label: 'Mais (gomos)', need: 1, run: (e) => { const at = { x: 160, y: window.innerHeight / 2 }; openRadial({ ...at, actions: mainGomos(e, at) }) } },
  { icon: '🗑', label: 'Apagar', key: 'Del', need: 1, run: (e) => e.deleteShapes(e.getSelectedShapeIds()) },
  'sep',
  { icon: '↶', label: 'Desfazer', key: 'Ctrl+Z', run: (e) => e.undo() },
  { icon: '↷', label: 'Refazer', key: 'Ctrl+Shift+Z', run: (e) => e.redo() },
]

export function SideRuler() {
  const editor = useEditor()
  const [open, setOpen] = useState(() => { try { return localStorage.getItem('rabisco:ruler') !== '0' } catch { return true } })
  const count = useValue('sel-count', () => editor.getSelectedShapeIds().length, [editor])
  const toggle = () => { setOpen(!open); try { localStorage.setItem('rabisco:ruler', open ? '0' : '1') } catch {} }

  const wrap: React.CSSProperties = {
    position: 'fixed', left: 8, top: 52, zIndex: 300, pointerEvents: 'all',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: 4, borderRadius: 12,
    background: 'var(--color-panel)', boxShadow: '0 2px 12px rgba(0,0,0,.18)', maxHeight: 'calc(100vh - 200px)', overflowY: 'auto', scrollbarWidth: 'none',
  }
  const btn = (disabled: boolean): React.CSSProperties => ({
    width: 32, height: 26, border: 'none', borderRadius: 8, background: 'transparent', color: 'var(--color-text)',
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.3 : 1, fontSize: 15, flex: '0 0 auto',
  })
  return (
    <div style={wrap} onPointerDown={(e) => e.stopPropagation()}>
      <button style={btn(false)} title={open ? 'Recolher régua' : 'Abrir régua'} onClick={toggle}>{open ? '«' : '»'}</button>
      {open && ITEMS.map((it, i) => it === 'sep'
        ? <div key={i} style={{ width: 22, height: 1, background: 'var(--color-muted-2)', margin: '3px 0' }} />
        : <button key={it.label} style={btn((it.need ?? 0) > count)} disabled={(it.need ?? 0) > count}
            title={it.key ? `${it.label} (${it.key})` : it.label}
            onClick={() => { editor.markHistoryStoppingPoint(it.label); it.run(editor) }}>{it.icon}</button>)}
    </div>
  )
}
