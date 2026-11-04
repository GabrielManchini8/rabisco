import { useEffect, useState } from 'react'
import { Editor, TLShapeId, useEditor, useValue } from 'tldraw'
import { LINK_LABEL, LinkState, getLink, setLink } from './ConnectorLights'
import { CONNECTOR_STYLES, ConnectorStyle, addChild, deleteSubtree, isMind, setConnectorStyle } from './MindNodeShape'

/** Atalhos estilo XMind: Tab = filho, Enter = irmão, Espaço = expandir/recolher, Delete = sub-árvore */
export function registerMindMapKeys(editor: Editor) {
  const onKey = (e: KeyboardEvent) => {
    if (editor.getEditingShapeId()) return
    const sel = editor.getOnlySelectedShape()
    if (!isMind(sel)) return
    if (e.key === 'Tab') { e.preventDefault(); addChild(editor, sel.id) }
    else if (e.key === 'Enter') { e.preventDefault(); addChild(editor, sel.id, true) }
    else if (e.key === ' ') { e.preventDefault(); editor.updateShape({ id: sel.id, type: 'mind-node', props: { collapsed: !sel.props.collapsed } }) }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSubtree(editor, sel.id as TLShapeId) }
  }
  window.addEventListener('keydown', onKey, { capture: true })
  return () => window.removeEventListener('keydown', onKey, { capture: true })
}

/** Barra flutuante ao selecionar um nó (essencial no mobile, onde não há Tab) */
export function MindNodeToolbar() {
  const editor = useEditor()
  const [style, setStyle] = useState<ConnectorStyle>('curva')
  useEffect(() => setConnectorStyle(style), [style])
  const sel = useValue('sel', () => {
    const s = editor.getOnlySelectedShape()
    if (!isMind(s) || editor.getEditingShapeId() || editor.isShapeHidden(s)) return null
    const b = editor.getSelectionRotatedScreenBounds()
    return b ? { id: s.id, x: b.midX, y: b.minY, root: !s.props.parent, link: getLink(s) } : null
  }, [editor])
  if (!sel) return null

  const btn = { border: 'none', background: 'transparent', padding: '6px 10px', cursor: 'pointer', fontSize: 13 }
  return (
    <div style={{
      position: 'absolute', left: sel.x, top: sel.y - 64, transform: 'translateX(-50%)', zIndex: 300,
      display: 'flex', gap: 2, background: 'var(--color-panel)', borderRadius: 10, padding: 3,
      boxShadow: '0 2px 10px rgba(0,0,0,.18)', pointerEvents: 'all',
    }} onPointerDown={(e) => e.stopPropagation()}>
      <button style={btn} onClick={() => addChild(editor, sel.id)}>＋ Filho</button>
      <button style={btn} onClick={() => addChild(editor, sel.id, true)}>＋ Irmão</button>
      <select value={style} onChange={(e) => setStyle(e.target.value as ConnectorStyle)} style={{ ...btn, background: 'transparent' }} title="Estilo da conexão">
        {Object.keys(CONNECTOR_STYLES).map((k) => <option key={k} value={k}>〰 {k}</option>)}
      </select>
      {!sel.root && (
        <select value={sel.link} title="Ligação com o tópico anterior" onChange={(e) => setLink(editor, sel.id, e.target.value as LinkState)} style={{ ...btn, background: 'transparent' }}>
          {Object.entries(LINK_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      )}
      <button style={btn} onClick={() => deleteSubtree(editor, sel.id)}>🗑</button>
    </div>
  )
}
