import { Editor, TLCameraOptions, useEditor, useValue } from 'tldraw'

/**
 * Zoom de 1% a 6400%: dá para ver o quadro inteiro como um mapa
 * e também aproximar até o detalhe de um traço de caneta.
 * Pinça (touch/trackpad), Ctrl+roda e Shift+0/1/2 já vêm do tldraw.
 */
export const MIN_ZOOM = 0.01
export const MAX_ZOOM = 64
export const cameraOptions: Partial<TLCameraOptions> = {
  zoomSteps: [MIN_ZOOM, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8, 16, 32, MAX_ZOOM],
  zoomSpeed: 1,
  wheelBehavior: 'pan', // roda = rolar; Ctrl/pinça = zoom (como Miro/Figma)
}

// Slider logarítmico: cada "passo" do slider dobra/divide o zoom de forma uniforme
const toSlider = (z: number) => Math.log(z / MIN_ZOOM) / Math.log(MAX_ZOOM / MIN_ZOOM)
const fromSlider = (t: number) => MIN_ZOOM * Math.pow(MAX_ZOOM / MIN_ZOOM, t)

function zoomTo(editor: Editor, z: number) {
  const vp = editor.getViewportScreenBounds()
  const center = editor.screenToPage({ x: vp.midX, y: vp.midY })
  // câmera tldraw: screen = (page + cam) * z  →  cam = screen/z - page
  editor.setCamera({ x: vp.w / 2 / z - center.x, y: vp.h / 2 / z - center.y, z })
}

export function ZoomControls() {
  const editor = useEditor()
  const zoom = useValue('zoom', () => editor.getZoomLevel(), [editor])
  const btn: React.CSSProperties = { border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px 8px', fontSize: 14, color: 'var(--color-text)' }
  return (
    <div onPointerDown={(e) => e.stopPropagation()} style={{
      position: 'absolute', right: 12, bottom: 60, zIndex: 300, pointerEvents: 'all',
      display: 'flex', alignItems: 'center', gap: 4, padding: '4px 6px', borderRadius: 10,
      background: 'var(--color-panel)', boxShadow: '0 2px 10px rgba(0,0,0,.15)',
    }}>
      <button style={btn} title="Ver tudo" onClick={() => editor.zoomToFit({ animation: { duration: 250 } })}>⤢</button>
      <button style={btn} title="Afastar" onClick={() => editor.zoomOut(undefined, { animation: { duration: 150 } })}>−</button>
      <input type="range" min={0} max={1} step={0.001} value={toSlider(zoom)} aria-label="Zoom"
        onChange={(e) => zoomTo(editor, fromSlider(Number(e.target.value)))} style={{ width: 110 }} />
      <button style={btn} title="Aproximar" onClick={() => editor.zoomIn(undefined, { animation: { duration: 150 } })}>+</button>
      <button style={{ ...btn, minWidth: 52, fontVariantNumeric: 'tabular-nums' }} title="Voltar a 100%"
        onClick={() => editor.resetZoom(undefined, { animation: { duration: 200 } })}>
        {zoom < 0.1 ? (zoom * 100).toFixed(1) : Math.round(zoom * 100)}%
      </button>
      <button style={btn} title="Zoom na seleção" onClick={() => editor.zoomToSelection({ animation: { duration: 250 } })}>◎</button>
    </div>
  )
}
