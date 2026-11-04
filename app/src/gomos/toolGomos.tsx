import { useEffect } from 'react'
import { DefaultSizeStyle, Editor, createShapeId, toRichText, useEditor } from 'tldraw'
import { Action } from '../convert/converters'
import { openRadial } from '../convert/RadialMenu'
import { createMindMap } from '../mindmap/MindNodeShape'
import { pickFiles } from '../import/importFiles'
import { openColorBar } from './shapeGomos'
import { openVoice } from '../voice/VoicePanel'
import { startExplain } from '../explain/explain'
import { openSearch } from '../search/SearchPanel'

type Pt = { x: number; y: number }

// ---------- caneta ----------
function penGomos(editor: Editor, at: Pt): Action[] {
  const tool = (id: string) => async () => { editor.setCurrentTool(id) }
  const size = (s: 's' | 'm' | 'l' | 'xl') => async () => {
    editor.setStyleForNextShapes(DefaultSizeStyle, s)
    if (!['draw', 'highlight'].includes(editor.getCurrentToolId())) editor.setCurrentTool('draw')
  }
  return [
    back(editor, at),
    { id: 'draw', icon: '✏️', label: 'Caneta', run: tool('draw') },
    { id: 'hl', icon: '🖍', label: 'Marca-texto', run: tool('highlight') },
    { id: 'eraser', icon: '🧽', label: 'Borracha', run: tool('eraser') },
    { id: 'laser', icon: '🔴', label: 'Laser', run: tool('laser') },
    { id: 'select', icon: '🖱', label: 'Selecionar', run: tool('select') },
    { id: 'hand', icon: '✋', label: 'Mover', run: tool('hand') },
    { id: 's', icon: '·', label: 'Fino', run: size('s') },
    { id: 'm', icon: '•', label: 'Médio', run: size('m') },
    { id: 'l', icon: '●', label: 'Grosso', run: size('l') },
    { id: 'xl', icon: '⬤', label: 'Extra', run: size('xl') },
    { id: 'cor', icon: '🎨', label: 'Cor', run: async () => openColorBar({ x: at.x, y: at.y + 170 }, 'next') },
    { id: 'pen', icon: '🖊', label: editor.getInstanceState().isPenMode ? 'Dedo desenha' : 'Só caneta', run: async () => {
      editor.updateInstanceState({ isPenMode: !editor.getInstanceState().isPenMode })
    } },
  ]
}

// ---------- inserir ----------
function insertGomos(editor: Editor, at: Pt): Action[] {
  const p = editor.screenToPage(at)
  const make = (fn: () => void) => async () => { editor.run(fn); editor.setCurrentTool('select') }
  return [
    back(editor, at),
    { id: 'note', icon: '🗒', label: 'Post-it', run: make(() => {
      const id = createShapeId(); editor.createShape({ id, type: 'note', x: p.x - 100, y: p.y - 100 }); editor.select(id); editor.setEditingShape(id)
    }) },
    { id: 'explain', icon: '🎬', label: 'Desenho guiado', run: async () => { await startExplain(editor); editor.setCurrentTool('draw') } },
    { id: 'voice', icon: '🎙', label: 'Ditado', run: async () => openVoice({ mode: 'record' }) },
    { id: 'text', icon: '🔤', label: 'Texto', run: make(() => {
      const id = createShapeId(); editor.createShape({ id, type: 'text', x: p.x, y: p.y, props: { richText: toRichText('') } }); editor.select(id); editor.setEditingShape(id)
    }) },
    { id: 'mind', icon: '🧠', label: 'Mapa mental', run: async () => { editor.centerOnPoint(p); createMindMap(editor) } },
    { id: 'frame', icon: '🖼', label: 'Moldura', run: make(() => {
      const id = createShapeId(); editor.createShape({ id, type: 'frame', x: p.x - 200, y: p.y - 150, props: { w: 400, h: 300 } }); editor.select(id)
    }) },
    { id: 'shape', icon: '⬟', label: 'Forma', run: make(() => {
      const id = createShapeId(); editor.createShape({ id, type: 'geo', x: p.x - 80, y: p.y - 60, props: { w: 160, h: 120 } }); editor.select(id)
    }) },
    { id: 'arrow', icon: '➜', label: 'Seta', run: async () => { editor.setCurrentTool('arrow') } },
    { id: 'line', icon: '／', label: 'Linha', run: async () => { editor.setCurrentTool('line') } },
    { id: 'file', icon: '📎', label: 'Arquivo', run: async () => {
      const files = await pickFiles(); if (files.length) await editor.putExternalContent({ type: 'files', files, point: p })
    } },
    { id: 'photo', icon: '📷', label: 'Câmera', run: async () => {
      // no celular abre a câmera direto
      const files = await pickFiles('image/*', true); if (files.length) await editor.putExternalContent({ type: 'files', files, point: p })
    } },
    { id: 'link', icon: '🔗', label: 'Link', run: async () => {
      const url = prompt('Cole o link (YouTube, Figma, site…)')
      if (url) await editor.putExternalContent({ type: 'url', url, point: p })
    } },
  ]
}

export function rootGomos(editor: Editor, at: Pt): Action[] {
  return [
    { id: 'pen', icon: '✏️', label: 'Caneta ▸', run: async () => openRadial({ ...at, actions: penGomos(editor, at) }) },
    { id: 'ins', icon: '➕', label: 'Inserir ▸', run: async () => openRadial({ ...at, actions: insertGomos(editor, at) }) },
    { id: 'search', icon: '🔍', label: 'Buscar', run: async () => openSearch() },
    { id: 'undo', icon: '↶', label: 'Desfazer', run: async () => { editor.undo() } },
    { id: 'redo', icon: '↷', label: 'Refazer', run: async () => { editor.redo() } },
    { id: 'fit', icon: '⤢', label: 'Ver tudo', run: async () => { editor.zoomToFit({ animation: { duration: 250 } }) } },
  ]
}
const back = (editor: Editor, at: Pt): Action =>
  ({ id: 'voltar', icon: '↩', label: 'Voltar', run: async () => openRadial({ ...at, actions: rootGomos(editor, at) }) })

/**
 * Formas de abrir os gomos de ferramenta:
 *  - botão 🍊 fixo no canto inferior esquerdo
 *  - toque longo (dedo) em espaço vazio
 *  - Alt + clique direito em espaço vazio (desktop)
 */
export function ToolGomoButton() {
  const editor = useEditor()
  useEffect(() => {
    const c = editor.getContainer()
    let timer: ReturnType<typeof setTimeout> | undefined
    let start: Pt | null = null
    const emptyAt = (x: number, y: number) =>
      !editor.getShapeAtPoint(editor.screenToPage({ x, y }), { hitInside: true }) && !editor.getSelectedShapeIds().length
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || !emptyAt(e.clientX, e.clientY)) return
      start = { x: e.clientX, y: e.clientY }
      timer = setTimeout(() => { if (start) openRadial({ ...start, actions: rootGomos(editor, start) }) }, 550)
    }
    const move = (e: PointerEvent) => { if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) { clearTimeout(timer); start = null } }
    const up = () => { clearTimeout(timer); start = null }
    const ctx = (e: MouseEvent) => {
      if (!e.altKey || !emptyAt(e.clientX, e.clientY)) return
      e.preventDefault(); e.stopPropagation()
      openRadial({ x: e.clientX, y: e.clientY, actions: rootGomos(editor, { x: e.clientX, y: e.clientY }) })
    }
    c.addEventListener('pointerdown', down, true); c.addEventListener('pointermove', move, true)
    c.addEventListener('pointerup', up, true); c.addEventListener('pointercancel', up, true)
    c.addEventListener('contextmenu', ctx, true)
    return () => {
      c.removeEventListener('pointerdown', down, true); c.removeEventListener('pointermove', move, true)
      c.removeEventListener('pointerup', up, true); c.removeEventListener('pointercancel', up, true)
      c.removeEventListener('contextmenu', ctx, true)
    }
  }, [editor])

  return (
    <button title="Gomos: caneta e inserir" onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        const at = { x: e.clientX + 110, y: e.clientY - 130 }
        openRadial({ ...at, actions: rootGomos(editor, at) })
      }}
      style={{
        position: 'fixed', left: 14, bottom: 64, width: 52, height: 52, borderRadius: 26, zIndex: 300,
        border: 'none', background: '#ff922b', color: '#fff', fontSize: 24, cursor: 'pointer', pointerEvents: 'all',
        boxShadow: '0 3px 12px rgba(0,0,0,.3)',
      }}>🍊</button>
  )
}
