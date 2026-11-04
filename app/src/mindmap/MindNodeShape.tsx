import {
  BaseBoxShapeUtil, HTMLContainer, RecordProps, T, TLBaseShape, TLShapeId, Editor,
  createShapeId, stopEventPropagation, useEditor, useValue,
} from 'tldraw'

/** Nó de mapa mental (estilo XMind): texto, cor, pai na árvore e estado recolhido. */
export type MindNodeShape = TLBaseShape<'mind-node', {
  w: number; h: number; text: string; color: string
  parent: string            // id do nó pai ('' = tópico central)
  collapsed: boolean
}>

export class MindNodeUtil extends BaseBoxShapeUtil<MindNodeShape> {
  static override type = 'mind-node' as const
  static override props: RecordProps<MindNodeShape> = {
    w: T.number, h: T.number, text: T.string, color: T.string, parent: T.string, collapsed: T.boolean,
  }
  override canEdit = () => true
  override getDefaultProps(): MindNodeShape['props'] {
    return { w: 180, h: 56, text: 'Tópico central', color: '#4f6bed', parent: '', collapsed: false }
  }

  component(shape: MindNodeShape) {
    return <MindNodeView shape={shape} />
  }
  indicator(shape: MindNodeShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={14} />
  }
}

function MindNodeView({ shape }: { shape: MindNodeShape }) {
  const editor = useEditor()
  const isEditing = useValue('editing', () => editor.getEditingShapeId() === shape.id, [editor, shape.id])
  const childCount = useValue('children', () => getChildren(editor, shape.id).length, [editor, shape.id])
  const isRoot = !shape.props.parent
  const { w, h, color, text, collapsed } = shape.props

  return (
    <HTMLContainer style={{ pointerEvents: 'all' }}>
      <div style={{
        width: w, height: h, boxSizing: 'border-box', borderRadius: 14, display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: '0 14px',
        background: isRoot ? color : 'var(--color-panel)', color: isRoot ? '#fff' : 'var(--color-text)',
        border: `2.5px solid ${color}`, fontWeight: isRoot ? 700 : 500, fontSize: isRoot ? 18 : 15,
        boxShadow: '0 2px 6px rgba(0,0,0,.12)',
      }}>
        {isEditing ? (
          <input autoFocus defaultValue={text} onPointerDown={stopEventPropagation}
            onBlur={(e) => editor.updateShape({ id: shape.id, type: 'mind-node', props: { text: e.currentTarget.value } })}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur() }}
            style={{ all: 'unset', width: '100%', textAlign: 'center' }} />
        ) : <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</span>}
      </div>

      {/* Botão expandir/recolher — como no XMind */}
      {childCount > 0 && (
        <button
          onPointerDown={stopEventPropagation}
          onClick={() => editor.updateShape({ id: shape.id, type: 'mind-node', props: { collapsed: !collapsed } })}
          style={{
            position: 'absolute', right: -13, top: h / 2 - 12, width: 24, height: 24, borderRadius: 12,
            border: `2px solid ${color}`, background: collapsed ? color : 'var(--color-panel)',
            color: collapsed ? '#fff' : color, fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0,
          }}>
          {collapsed ? childCount : '−'}
        </button>
      )}
    </HTMLContainer>
  )
}

// ---------- Lógica de árvore ----------

export const isMind = (s: any): s is MindNodeShape => s?.type === 'mind-node'

export function getChildren(editor: Editor, id: TLShapeId) {
  return editor.getCurrentPageShapes().filter((s) => isMind(s) && s.props.parent === id) as MindNodeShape[]
}

/** Oculto se algum ancestral estiver recolhido. Setas seguem seus nós. */
export function getShapeVisibility(shape: any, editor: Editor): 'hidden' | 'inherit' {
  if (isMind(shape)) {
    let p = shape.props.parent
    while (p) {
      const parent = editor.getShape(p as TLShapeId) as MindNodeShape | undefined
      if (!parent) break
      if (parent.props.collapsed) return 'hidden'
      p = parent.props.parent
    }
  }
  if (shape.type === 'arrow' && shape.meta?.mindEdge) {
    const child = editor.getShape(shape.meta.mindEdge as TLShapeId)
    if (child && getShapeVisibility(child, editor) === 'hidden') return 'hidden'
  }
  return 'inherit'
}

/** Paleta por ramo, igual aos mapas coloridos do XMind */
const BRANCH_COLORS = ['#e8590c', '#2f9e44', '#1971c2', '#9c36b5', '#e03131', '#f08c00', '#0c8599']

/** "Enfeites do fio condutor": estilo da conexão pai→filho */
export const CONNECTOR_STYLES = {
  curva:    { bend: 40, dash: 'solid',  arrowheadEnd: 'none' },
  reta:     { bend: 0,  dash: 'solid',  arrowheadEnd: 'none' },
  seta:     { bend: 30, dash: 'solid',  arrowheadEnd: 'triangle' },
  tracejada:{ bend: 30, dash: 'dashed', arrowheadEnd: 'none' },
  pontilhada:{ bend: 30, dash: 'dotted', arrowheadEnd: 'dot' },
  desenhada:{ bend: 35, dash: 'draw',   arrowheadEnd: 'arrow' },
} as const
export type ConnectorStyle = keyof typeof CONNECTOR_STYLES
let currentConnector: ConnectorStyle = 'curva'
export const setConnectorStyle = (s: ConnectorStyle) => { currentConnector = s }

export function addChild(editor: Editor, parentId: TLShapeId, asSibling = false) {
  let parent = editor.getShape(parentId) as MindNodeShape
  if (asSibling && parent.props.parent) parent = editor.getShape(parent.props.parent as TLShapeId) as MindNodeShape
  const siblings = getChildren(editor, parent.id)
  const isRootParent = !parent.props.parent
  const color = isRootParent ? BRANCH_COLORS[siblings.length % BRANCH_COLORS.length] : parent.props.color
  const id = createShapeId()
  const last = siblings.at(-1)

  editor.run(() => {
    if (parent.props.collapsed) editor.updateShape({ id: parent.id, type: 'mind-node', props: { collapsed: false } })
    editor.createShape<MindNodeShape>({
      id, type: 'mind-node',
      x: parent.x + parent.props.w + 90,
      y: last ? last.y + last.props.h + 24 : parent.y,
      props: { text: 'Novo tópico', color, parent: parent.id, w: 160, h: 44, collapsed: false },
    })
    connect(editor, parent.id, id, color)
    editor.select(id)
    editor.setEditingShape(id)
  })
  return id
}

function connect(editor: Editor, from: TLShapeId, to: TLShapeId, color: string) {
  const arrowId = createShapeId()
  const st = CONNECTOR_STYLES[currentConnector]
  const dy = editor.getShapePageBounds(to)!.midY - editor.getShapePageBounds(from)!.midY
  editor.createShape({
    id: arrowId, type: 'arrow', meta: { mindEdge: to },
    // curva "S" suave: dobra para o lado oposto ao deslocamento vertical
    props: { bend: -Math.sign(dy) * Math.min(st.bend, Math.abs(dy) / 3), dash: st.dash, arrowheadStart: 'none', arrowheadEnd: st.arrowheadEnd, color: nearestTlColor(color), size: 'm' },
  })
  // Bindings: a seta acompanha os nós quando eles são arrastados
  for (const [terminal, target] of [['start', from], ['end', to]] as const) {
    editor.createBinding({
      type: 'arrow', fromId: arrowId, toId: target,
      props: { terminal, normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false },
    })
  }
  editor.sendToBack([arrowId])
}

// O tldraw usa paleta nomeada para setas; mapeamos o hex do ramo.
function nearestTlColor(hex: string) {
  const map: Record<string, string> = {
    '#e8590c': 'orange', '#2f9e44': 'green', '#1971c2': 'blue', '#9c36b5': 'violet',
    '#e03131': 'red', '#f08c00': 'yellow', '#0c8599': 'light-blue', '#4f6bed': 'blue',
  }
  return (map[hex] ?? 'black') as any
}

/** Apagar um nó apaga sua sub-árvore e conexões. */
export function deleteSubtree(editor: Editor, id: TLShapeId) {
  const ids: TLShapeId[] = []
  const walk = (n: TLShapeId) => { ids.push(n); getChildren(editor, n).forEach((c) => walk(c.id)) }
  walk(id)
  const arrows = editor.getCurrentPageShapes().filter((s) => s.type === 'arrow' && ids.includes((s.meta as any)?.mindEdge))
  editor.deleteShapes([...ids, ...arrows.map((a) => a.id)])
}

export function createMindMap(editor: Editor) {
  const c = editor.getViewportPageBounds().center
  const id = createShapeId()
  editor.createShape<MindNodeShape>({ id, type: 'mind-node', x: c.x - 90, y: c.y - 28 })
  editor.select(id)
  return id
}
