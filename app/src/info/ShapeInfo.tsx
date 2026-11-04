import { useEffect, useState } from 'react'
import { Editor, TLShape, TLShapeId, useEditor, useValue } from 'tldraw'

/**
 * Nome + Observação em qualquer figura, desenho, imagem, PDF ou arquivo.
 * Guardado em shape.meta → sincroniza junto (Yjs) e vai para a busca/exportação.
 */
export type ShapeInfo = { name?: string; obs?: string }
export const getInfo = (s: TLShape): ShapeInfo => (s.meta ?? {}) as ShapeInfo

let setOpen: (id: TLShapeId | null) => void = () => {}
export const openInfo = (id: TLShapeId) => setOpen(id)

/** Arquivos importados já nascem com o nome do arquivo */
export function registerAutoNames(editor: Editor) {
  return editor.sideEffects.registerBeforeCreateHandler('shape', (shape) => {
    if ((shape.meta as ShapeInfo)?.name) return shape
    const assetId = (shape.props as any).assetId
    if (!assetId) return shape
    const asset = editor.getAsset(assetId) as any
    const name = asset?.props?.name ? String(asset.props.name).replace(/#(\d+)$/, ' — pág. $1') : ''
    return name ? { ...shape, meta: { ...shape.meta, name } } : shape
  })
}

/** Painel de edição (abre pelo gomo ✎ Info ou duplo toque no rótulo) */
export function InfoPanel() {
  const editor = useEditor()
  const [id, setId] = useState<TLShapeId | null>(null)
  setOpen = setId
  const shape = useValue('info-shape', () => (id ? editor.getShape(id) : undefined), [editor, id])
  const [name, setName] = useState(''); const [obs, setObs] = useState('')
  useEffect(() => { if (shape) { const i = getInfo(shape); setName(i.name ?? ''); setObs(i.obs ?? '') } }, [id])
  if (!id || !shape) return null

  const save = () => {
    editor.updateShape({ id, type: shape.type, meta: { ...shape.meta, name: name.trim(), obs: obs.trim() } })
    setId(null)
  }
  const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: 8, borderRadius: 8, border: '1px solid var(--color-muted-2)', background: 'var(--color-background)', color: 'var(--color-text)', font: 'inherit' }
  return (
    <div onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') setId(null) }}
      style={{ position: 'fixed', left: '50%', top: 70, transform: 'translateX(-50%)', zIndex: 450, pointerEvents: 'all',
        width: 'min(380px, calc(100vw - 32px))', background: 'var(--color-panel)', color: 'var(--color-text)', borderRadius: 16,
        padding: 16, boxShadow: '0 8px 30px rgba(0,0,0,.25)', fontFamily: 'system-ui', fontSize: 14, display: 'grid', gap: 8 }}>
      <b>✎ Informações</b>
      <label>Nome<input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} style={field} placeholder="Ex.: Planta do 2º andar" /></label>
      <label>Observação<textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={4} style={field} placeholder="Anotações, contexto, pendências…" /></label>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={() => setId(null)} style={{ ...field, width: 'auto', cursor: 'pointer' }}>Cancelar</button>
        <button onClick={save} style={{ ...field, width: 'auto', cursor: 'pointer', background: '#ff922b', color: '#fff', border: 'none' }}>Salvar</button>
      </div>
    </div>
  )
}

/** Rótulos no quadro: nome acima da figura + 📝 quando há observação (toque mostra a obs). */
export function InfoLabels() {
  const editor = useEditor()
  const [peek, setPeek] = useState<TLShapeId | null>(null)
  const labels = useValue('info-labels', () => {
    if (editor.getZoomLevel() < 0.15) return [] // muito longe: esconde para não poluir
    const vp = editor.getViewportPageBounds()
    const out: { id: TLShapeId; x: number; y: number; name?: string; obs?: string }[] = []
    for (const s of editor.getCurrentPageShapes()) {
      const { name, obs } = getInfo(s)
      if (!name && !obs) continue
      if (editor.isShapeHidden(s)) continue
      const b = editor.getShapePageBounds(s)
      if (!b || !b.collides(vp)) continue // só o que está na tela (leve em RAM/CPU)
      const p = editor.pageToViewport({ x: b.x, y: b.y })
      out.push({ id: s.id, x: p.x, y: p.y, name, obs })
    }
    return out
  }, [editor])

  return (
    <>
      {labels.map((l) => (
        <div key={l.id} style={{ position: 'absolute', left: l.x, top: l.y - 24, zIndex: 200, pointerEvents: 'all',
          display: 'flex', gap: 4, alignItems: 'center', maxWidth: 260, fontFamily: 'system-ui', fontSize: 12 }}
          onPointerDown={(e) => e.stopPropagation()}>
          {l.name && (
            <span onDoubleClick={() => openInfo(l.id)} title="Duplo clique para editar"
              style={{ background: 'var(--color-panel)', color: 'var(--color-text)', padding: '2px 8px', borderRadius: 6,
                boxShadow: '0 1px 4px rgba(0,0,0,.18)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {l.name}
            </span>
          )}
          {l.obs && (
            <button onClick={() => setPeek(peek === l.id ? null : l.id)} title={l.obs}
              style={{ border: 'none', background: '#fff3bf', borderRadius: 6, padding: '2px 5px', cursor: 'pointer', fontSize: 12 }}>📝</button>
          )}
          {peek === l.id && l.obs && (
            <div onClick={() => openInfo(l.id)} style={{ position: 'absolute', top: 24, left: 0, width: 240, background: '#fff9db', color: '#333',
              padding: 10, borderRadius: 8, boxShadow: '0 4px 14px rgba(0,0,0,.2)', whiteSpace: 'pre-wrap', cursor: 'pointer' }}>
              {l.obs}
            </div>
          )}
        </div>
      ))}
    </>
  )
}
