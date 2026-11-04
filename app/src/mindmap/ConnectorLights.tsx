import { Editor, TLShapeId, useEditor, useValue } from 'tldraw'
import { MindNodeShape, isMind } from './MindNodeShape'

/**
 * Estado da ligação de cada tópico com o pai (guardado no tópico filho, meta.link):
 *  - 'dead'    → morta (padrão): linha comum, sem luz
 *  - 'passive' → viva/passiva: um feixe de luz sai do bloco anterior e corre até o próximo
 *  - 'active'  → viva/ativa: o feixe vai e volta, como energia num cabo
 * Animação 100% CSS (GPU), só nas ligações visíveis na tela → leve até em celular antigo.
 */
export type LinkState = 'dead' | 'passive' | 'active'
export const LINK_LABEL: Record<LinkState, string> = { dead: '— Morta', passive: '✦ Viva · passiva', active: '⚡ Viva · ativa' }

export const getLink = (s: MindNodeShape): LinkState => ((s.meta as any)?.link as LinkState) || 'dead'

export function setLink(editor: Editor, nodeId: TLShapeId, state: LinkState) {
  const node = editor.getShape(nodeId) as MindNodeShape
  // a linha não muda de aparência; só liga/desliga o feixe de luz
  editor.updateShape({ id: nodeId, type: 'mind-node', meta: { ...node.meta, link: state } })
}

export function ConnectorLights() {
  const editor = useEditor()
  const lights = useValue('mind-lights', () => {
    const vp = editor.getViewportPageBounds()
    const out: { id: string; d: string; color: string; mode: 'passive' | 'active' }[] = []
    for (const a of editor.getCurrentPageShapes()) {
      const childId = (a.meta as any)?.mindEdge as TLShapeId | undefined
      if (a.type !== 'arrow' || !childId) continue
      const child = editor.getShape(childId)
      if (!isMind(child)) continue
      const mode = getLink(child)
      if (mode !== 'passive' && mode !== 'active') continue
      if (editor.isShapeHidden(a) || editor.isShapeHidden(child)) continue
      const b = editor.getShapePageBounds(a)
      if (!b || !b.collides(vp)) continue
      const pts = editor.getShapePageTransform(a).applyToPoints(editor.getShapeGeometry(a).vertices)
      if (pts.length < 2) continue
      const v = pts.map((p) => editor.pageToViewport(p))
      out.push({ id: a.id, d: 'M' + v.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('L'), color: child.props.color, mode })
    }
    return out
  }, [editor])
  if (!lights.length) return null

  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 150, overflow: 'visible' }}>
      <defs>
        <filter id="rabisco-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {lights.map((l) => (
        <g key={l.id} filter="url(#rabisco-glow)">
          {/* "cabo" levemente iluminado */}
          <path d={l.d} pathLength={100} fill="none" stroke={l.color} strokeOpacity={0.18} strokeWidth={6} strokeLinecap="round" />
          {/* feixe de luz */}
          <path d={l.d} pathLength={100} fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round"
            strokeDasharray="10 90" className={l.mode === 'active' ? 'rabisco-beam-active' : 'rabisco-beam-passive'} />
          <path d={l.d} pathLength={100} fill="none" stroke={l.color} strokeWidth={5} strokeOpacity={0.9} strokeLinecap="round"
            strokeDasharray="10 90" className={l.mode === 'active' ? 'rabisco-beam-active' : 'rabisco-beam-passive'} style={{ mixBlendMode: 'screen' }} />
        </g>
      ))}
      <style>{`
        .rabisco-beam-passive { animation: rabisco-flow 2.4s linear infinite; }
        .rabisco-beam-active  { animation: rabisco-pingpong 1.6s ease-in-out infinite alternate; }
        @keyframes rabisco-flow { from { stroke-dashoffset: 10 } to { stroke-dashoffset: -100 } }
        @keyframes rabisco-pingpong { from { stroke-dashoffset: 5 } to { stroke-dashoffset: -95 } }
        @media (prefers-reduced-motion: reduce) { .rabisco-beam-passive, .rabisco-beam-active { animation: none; stroke-dasharray: none; opacity: .5 } }
      `}</style>
    </svg>
  )
}
