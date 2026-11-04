import { Editor, TLShape, TLShapeId, toRichText } from 'tldraw'
import * as pdfjs from 'pdfjs-dist'
import { importPdfToCanvas } from '../pdf/importPdf'
import { openVoice } from '../voice/VoicePanel'

/**
 * Conversor local (nada sai do aparelho). Inspirado no fluxo
 * "arrasta → escolhe o formato num anel → pronto".
 * Cada ação recebe um arquivo OU shapes do quadro e devolve downloads
 * ou algo novo no canvas.
 */
export type Action = { id: string; label: string; icon: string; run: () => Promise<void> }

// ---------- utilidades ----------
export function download(blob: Blob, name: string) {
  // Web/PWA: download do navegador. Tauri/Capacitor: trocar por plugin de FS/Share.
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}
const base = (n: string) => n.replace(/\.[^.]+$/, '')

async function loadBitmap(src: Blob) { return await createImageBitmap(src) }

/** Re-encode via canvas: converte formato, redimensiona e REMOVE metadados (EXIF/GPS). */
async function reencode(src: Blob, type: string, scale = 1, quality = 0.9) {
  const bmp = await loadBitmap(src)
  const c = new OffscreenCanvas(Math.round(bmp.width * scale), Math.round(bmp.height * scale))
  const ctx = c.getContext('2d')!
  if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height) } // JPG não tem transparência
  ctx.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close()
  return c.convertToBlob({ type, quality })
}

async function imageToPdf(images: Blob[]) {
  // PDF mínimo com imagens JPEG embutidas (sem dependência extra)
  const pages: { jpg: Uint8Array; w: number; h: number }[] = []
  for (const img of images) {
    const bmp = await loadBitmap(img); const w = bmp.width, h = bmp.height; bmp.close()
    pages.push({ jpg: new Uint8Array(await (await reencode(img, 'image/jpeg', 1, 0.92)).arrayBuffer()), w, h })
  }
  const enc = new TextEncoder(); const chunks: Uint8Array[] = []; const offsets: number[] = []; let len = 0
  const push = (d: Uint8Array | string) => { const b = typeof d === 'string' ? enc.encode(d) : d; chunks.push(b); len += b.length }
  const obj = (n: number, body: (Uint8Array | string)[]) => { offsets[n] = len; push(`${n} 0 obj\n`); body.forEach(push); push('\nendobj\n') }
  push('%PDF-1.4\n')
  const n = pages.length, kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')
  obj(1, ['<< /Type /Catalog /Pages 2 0 R >>'])
  obj(2, [`<< /Type /Pages /Kids [${kids}] /Count ${n} >>`])
  pages.forEach((p, i) => {
    const po = 3 + i * 3, io = po + 1, co = po + 2
    const content = `q ${p.w} 0 0 ${p.h} 0 0 cm /Im0 Do Q`
    obj(po, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.w} ${p.h}] /Resources << /XObject << /Im0 ${io} 0 R >> >> /Contents ${co} 0 R >>`])
    obj(io, [`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpg.length} >>\nstream\n`, p.jpg, '\nendstream'])
    obj(co, [`<< /Length ${content.length} >>\nstream\n${content}\nendstream`])
  })
  const xref = len, total = 3 + n * 3
  push(`xref\n0 ${total}\n0000000000 65535 f \n`)
  for (let i = 1; i < total; i++) push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`)
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`)
  return new Blob(chunks as BlobPart[], { type: 'application/pdf' })
}

async function pdfToImages(file: Blob, name: string, type: 'image/png' | 'image/jpeg') {
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i); const vp = page.getViewport({ scale: 2 })
    const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height
    await page.render({ canvasContext: c.getContext('2d')!, viewport: vp }).promise
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), type, 0.92))
    download(blob, `${name}-p${i}.${type === 'image/png' ? 'png' : 'jpg'}`)
    c.width = c.height = 0
  }
}

async function pdfToText(file: Blob) {
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  let out = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const tc = await (await pdf.getPage(i)).getTextContent()
    out += tc.items.map((it: any) => it.str + (it.hasEOL ? '\n' : ' ')).join('') + '\n\n'
  }
  return out
}

function mdToHtml(md: string) {
  // conversor Markdown → HTML leve (títulos, listas, negrito, itálico, código, links)
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>')
    .replace(/`(.+?)`/g, '<code>$1</code>').replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
  let html = '', inList = false
  for (const line of md.split('\n')) {
    const h = line.match(/^(#{1,6})\s+(.*)/), li = line.match(/^\s*[-*]\s+(.*)/)
    if (!li && inList) { html += '</ul>'; inList = false }
    if (h) html += `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`
    else if (li) { if (!inList) { html += '<ul>'; inList = true } html += `<li>${inline(li[1])}</li>` }
    else if (line.trim()) html += `<p>${inline(line)}</p>`
  }
  return `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;max-width:720px;margin:40px auto">${html}${inList ? '</ul>' : ''}</body>`
}

// ---------- catálogo de ações ----------
const IMG = /^image\/(png|jpe?g|webp|gif|bmp|avif)$/
const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name)
const isText = (f: File) => f.type.startsWith('text/') || /\.(md|markdown|txt)$/i.test(f.name)

/** Ações para um arquivo solto (arrastado/colado/escolhido) */
export function actionsForFiles(editor: Editor, files: File[], at: { x: number; y: number }): Action[] {
  const f = files[0], n = base(f.name), all = files
  const insert: Action = { id: 'insert', label: 'Pôr no quadro', icon: '⬇', run: async () => { await editor.putExternalContent({ type: 'files', files: all, point: at }) } }
  if (all.every((x) => IMG.test(x.type))) return [insert,
    { id: 'png', label: 'PNG', icon: '🖼', run: async () => { for (const x of all) download(await reencode(x, 'image/png'), base(x.name) + '.png') } },
    { id: 'jpg', label: 'JPG', icon: '📷', run: async () => { for (const x of all) download(await reencode(x, 'image/jpeg'), base(x.name) + '.jpg') } },
    { id: 'webp', label: 'WEBP', icon: '🪶', run: async () => { for (const x of all) download(await reencode(x, 'image/webp', 1, 0.85), base(x.name) + '.webp') } },
    { id: 'half', label: '50%', icon: '↘', run: async () => { for (const x of all) download(await reencode(x, x.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.5), base(x.name) + '-50.' + (x.type === 'image/png' ? 'png' : 'jpg')) } },
    { id: 'strip', label: 'Sem metadados', icon: '🕶', run: async () => { for (const x of all) download(await reencode(x, x.type === 'image/png' ? 'image/png' : 'image/jpeg', 1, 0.95), base(x.name) + '-limpo.' + (x.type === 'image/png' ? 'png' : 'jpg')) } },
    { id: 'pdf', label: all.length > 1 ? 'Juntar em PDF' : 'PDF', icon: '📄', run: async () => download(await imageToPdf(all), n + '.pdf') },
  ]
  if (isPdf(f)) return [
    { id: 'insert', label: 'Anotar no quadro', icon: '✍', run: () => importPdfToCanvas(editor, f, at) },
    { id: 'png', label: 'Páginas PNG', icon: '🖼', run: () => pdfToImages(f, n, 'image/png') },
    { id: 'jpg', label: 'Páginas JPG', icon: '📷', run: () => pdfToImages(f, n, 'image/jpeg') },
    { id: 'txt', label: 'Texto (.txt)', icon: '📝', run: async () => download(new Blob([await pdfToText(f)], { type: 'text/plain' }), n + '.txt') },
    { id: 'note', label: 'Texto → nota', icon: '🗒', run: async () => { editor.createShape({ type: 'text', x: at.x, y: at.y, props: { richText: toRichText(await pdfToText(f)), autoSize: false, w: 560, size: 's', font: 'sans', textAlign: 'start' } }) } },
  ]
  if (f.type.startsWith('audio/') || f.type.startsWith('video/') || /\.(mp3|m4a|wav|ogg|opus|flac|mp4|mov|webm)$/i.test(f.name)) return [
    ...(f.type.startsWith('video/') ? [insert] : []),
    { id: 'tr-note', label: 'Transcrever → nota', icon: '🎙', run: async () => openVoice({ mode: 'file', file: f, at }) },
    { id: 'tr', label: 'Transcrever (TXT/SRT)', icon: '💬', run: async () => openVoice({ mode: 'file', file: f }) },
  ]
  if (isText(f)) return [insert,
    { id: 'html', label: 'HTML', icon: '🌐', run: async () => download(new Blob([mdToHtml(await f.text())], { type: 'text/html' }), n + '.html') },
    { id: 'txt', label: 'TXT', icon: '📝', run: async () => download(new Blob([await f.text()], { type: 'text/plain' }), n + '.txt') },
  ]
  return [insert]
}

/** Ações para o que está selecionado no quadro (desenhos, mapas, PDFs anotados…) */
export function actionsForSelection(editor: Editor, ids: TLShapeId[]): Action[] {
  const exp = (format: 'png' | 'jpeg' | 'svg' | 'webp', ext: string) => async () => {
    const { blob } = await editor.toImage(ids, { format, background: true, scale: 2, padding: 16 })
    download(blob, `rabisco.${ext}`)
  }
  const shapes = ids.map((id) => editor.getShape(id)!).filter(Boolean) as TLShape[]
  const texts = shapes.map(shapeText).filter(Boolean)
  return [
    { id: 'png', label: 'PNG', icon: '🖼', run: exp('png', 'png') },
    { id: 'jpg', label: 'JPG', icon: '📷', run: exp('jpeg', 'jpg') },
    { id: 'svg', label: 'SVG', icon: '✒', run: exp('svg', 'svg') },
    { id: 'pdf', label: 'PDF', icon: '📄', run: async () => {
      const { blob } = await editor.toImage(ids, { format: 'png', background: true, scale: 2, padding: 16 })
      download(await imageToPdf([blob]), 'rabisco.pdf')
    } },
    ...(texts.length ? [{ id: 'md', label: 'Markdown', icon: '📝', run: async () => download(new Blob([texts.join('\n\n')], { type: 'text/markdown' }), 'rabisco.md') }] : []),
  ]
}

function shapeText(s: TLShape): string {
  const m = s.meta as any, head = m?.name ? `## ${m.name}\n` : '', obs = m?.obs ? `\n> ${m.obs.replace(/\n/g, '\n> ')}\n` : ''
  const body = shapeBody(s)
  return head || obs || body ? `${head}${body}${obs}` : ''
}
function shapeBody(s: TLShape): string {
  const p = s.props as any
  if (s.type === 'mind-node') return `- ${p.text}`
  if (p.richText) return richToText(p.richText)
  return ''
}
const richToText = (n: any): string => n.text ?? (n.content ?? []).map(richToText).join(n.type === 'doc' ? '\n' : '')
