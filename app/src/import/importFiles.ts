import { Editor, VecLike, createShapeId, toRichText } from 'tldraw'
import { importPdfToCanvas } from '../pdf/importPdf'
import { openVoice } from '../voice/VoicePanel'

/**
 * Importador "canivete suíço". Funciona por arrastar-e-soltar, colar (Ctrl+V)
 * ou pelo botão "Importar arquivo".
 *  - PDF                      → páginas como fundo travado (desenhe por cima)
 *  - imagens (png/jpg/webp/gif/svg) e vídeo (mp4/webm) → nativo do tldraw
 *  - texto/Markdown/código/CSV/JSON → nota de texto editável
 *  - Word (.docx)             → texto extraído (mammoth, carregado sob demanda)
 *  - outros                   → cartão de anexo com o nome do arquivo
 */
export const ACCEPT = [
  'application/pdf', 'image/*', 'video/*', 'audio/*',
  '.md', '.markdown', '.txt', '.csv', '.json', '.html', '.js', '.ts', '.py', '.docx',
].join(',')

const TEXT_EXT = /\.(md|markdown|txt|csv|json|html?|js|ts|tsx|jsx|py|java|c|cpp|cs|go|rs|sql|ya?ml|xml|log)$/i

export function registerFileImporters(editor: Editor) {
  // guarda o handler padrão (imagens/vídeo com toasts e limites) para delegar
  const defaultFiles = (editor as any).externalContentHandlers?.files
  editor.registerExternalContentHandler('files', async ({ point, files }) => {
    const native: File[] = []
    let p = point ?? editor.getViewportPageBounds().center
    for (const f of files) {
      if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) await importPdfToCanvas(editor, f, p)
      else if (f.type.startsWith('image/') || f.type.startsWith('video/')) native.push(f)
      else if (f.type.startsWith('audio/')) openVoice({ mode: 'file', file: f, at: p }) // áudio solto → vira nota transcrita
      else if (/\.docx$/i.test(f.name)) addTextNote(editor, f.name, await docxToText(f), p)
      else if (f.type.startsWith('text/') || TEXT_EXT.test(f.name)) addTextNote(editor, f.name, await f.text(), p)
      else addTextNote(editor, f.name, `📎 ${f.name} (${Math.round(f.size / 1024)} KB) — formato ainda sem visualização`, p)
      p = { x: p.x + 700, y: p.y } // lado a lado, sem sobrepor
    }
    if (native.length) await defaultFiles?.({ type: 'files', point: p, files: native })
  })
}

function addTextNote(editor: Editor, title: string, text: string, at: VecLike) {
  const MAX = 20000 // evita travar celulares com arquivos enormes
  const body = text.length > MAX ? text.slice(0, MAX) + '\n…(truncado)' : text
  const id = createShapeId()
  editor.createShape({
    id, type: 'text', x: at.x, y: at.y,
    props: { richText: toRichText(`${title}\n\n${body}`), autoSize: false, w: 520, size: 's', font: 'sans', textAlign: 'start' },
  })
  editor.select(id)
}

async function docxToText(f: File) {
  const mammoth = await import('mammoth')
  const { value } = await mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() })
  return value
}

export function pickFiles(accept = ACCEPT, capture = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = accept; input.multiple = !capture
    if (capture) input.setAttribute('capture', 'environment') // celular: abre a câmera
    input.onchange = () => resolve([...(input.files ?? [])])
    input.click()
  })
}
