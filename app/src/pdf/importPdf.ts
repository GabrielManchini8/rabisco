import { AssetRecordType, Editor, VecLike, createShapeId } from 'tldraw'
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

const RENDER_SCALE = 2 // nitidez ao dar zoom; reduza p/ 1.5 em celulares fracos
const PAGE_GAP = 32

/**
 * Renderiza cada página do PDF como imagem, cria shapes travados (locked)
 * empilhados verticalmente. Desenhos feitos por cima ficam numa "camada"
 * acima, e as páginas não se movem acidentalmente com a caneta.
 *
 * Melhoria futura: renderização lazy (só páginas visíveis) e armazenar o
 * PDF original no Supabase Storage em vez de dataURLs no documento.
 */
export async function importPdfToCanvas(editor: Editor, file: File, at?: VecLike) {
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const origin = at ?? editor.getViewportPageBounds().center
  let y = origin.y
  const shapeIds = []

  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n)
    const viewport = page.getViewport({ scale: RENDER_SCALE })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise

    const blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), 'image/webp', 0.85))
    const src = await blobToDataUrl(blob)
    const w = viewport.width / RENDER_SCALE
    const h = viewport.height / RENDER_SCALE

    const assetId = AssetRecordType.createId()
    editor.createAssets([{
      id: assetId, typeName: 'asset', type: 'image', meta: { pdf: file.name, page: n },
      props: { name: `${file.name}#${n}`, src, w, h, mimeType: 'image/webp', isAnimated: false },
    }])

    const id = createShapeId()
    editor.createShape({
      id, type: 'image', x: origin.x - w / 2, y, isLocked: true,
      props: { assetId, w, h }, meta: { pdfPage: n },
    })
    shapeIds.push(id)
    y += h + PAGE_GAP
    page.cleanup()
    canvas.width = canvas.height = 0 // libera memória do canvas
  }
  editor.sendToBack(shapeIds)
  editor.zoomToBounds(editor.getShapePageBounds(shapeIds[0])!, { animation: { duration: 300 } })
  editor.setCurrentTool('draw')
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.readAsDataURL(blob)
  })
}
