import { atom } from 'tldraw'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'
// motor ffmpeg empacotado com o app (não vem de CDN) → funciona offline
import coreURL from '../../node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js?url'
import wasmURL from '../../node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm?url'

/**
 * Abre e converte "qualquer" formato de mídia dentro do app, 100% local.
 *  - HEIC/HEIF (fotos de iPhone)      → heic2any (libheif em WebAssembly)
 *  - TIFF, BMP, ICO, TGA, PSD, etc.   → ffmpeg → PNG
 *  - Áudio: mp3, wav, m4a, aac, ogg, opus, flac, wma, amr, aiff…  → ffmpeg
 *  - Vídeo: mp4, mov, avi, mkv, wmv, flv, 3gp, webm, mpeg, ts…   → ffmpeg
 * O ffmpeg (~32 MB) só é carregado na 1ª conversão e fica em cache.
 */
export const mediaJob = atom<{ label: string; progress: number } | null>('media-job', null)

let ff: FFmpeg | null = null
async function getFF() {
  if (ff?.loaded) return ff
  ff = new FFmpeg()
  mediaJob.update((j) => ({ label: j?.label ?? 'Preparando conversor…', progress: 0 }))
  ff.on('progress', ({ progress }) => mediaJob.update((j) => j && { ...j, progress: Math.max(0, Math.min(1, progress)) }))
  await ff.load({ coreURL, wasmURL })
  return ff
}

const ext = (name: string) => (name.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase()
export const baseName = (n: string) => n.replace(/\.[^.]+$/, '')

export const AUDIO_EXT = ['mp3', 'wav', 'wave', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'flac', 'wma', 'amr', 'aiff', 'aif', 'caf', 'mka', 'ac3', '3ga']
export const VIDEO_EXT = ['mp4', 'm4v', 'mov', 'avi', 'mkv', 'wmv', 'flv', '3gp', 'webm', 'mpeg', 'mpg', 'ts', 'mts', 'm2ts', 'ogv', 'vob', 'f4v']
export const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico', 'heic', 'heif', 'tif', 'tiff', 'tga', 'psd', 'jfif', 'jp2', 'dds', 'pcx']

export const isHeic = (f: File) => /^image\/hei[cf]/.test(f.type) || ['heic', 'heif'].includes(ext(f.name))
export const isAudio = (f: File) => f.type.startsWith('audio/') || AUDIO_EXT.includes(ext(f.name))
export const isVideo = (f: File) => f.type.startsWith('video/') || VIDEO_EXT.includes(ext(f.name))
export const isImage = (f: File) => f.type.startsWith('image/') || IMAGE_EXT.includes(ext(f.name))

const MIME: Record<string, string> = {
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac', opus: 'audio/ogg',
  mp4: 'video/mp4', webm: 'video/webm', gif: 'image/gif', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp',
}

/** Receitas de conversão do ffmpeg por formato de saída */
const RECIPES: Record<string, string[]> = {
  mp3: ['-vn', '-c:a', 'libmp3lame', '-q:a', '2'],
  wav: ['-vn', '-c:a', 'pcm_s16le'],
  ogg: ['-vn', '-c:a', 'libvorbis', '-q:a', '5'],
  opus: ['-vn', '-c:a', 'libopus', '-b:a', '96k'],
  m4a: ['-vn', '-c:a', 'aac', '-b:a', '160k'],
  flac: ['-vn', '-c:a', 'flac'],
  mp4: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart'],
  webm: ['-c:v', 'libvpx', '-b:v', '1M', '-c:a', 'libvorbis'],
  gif: ['-vf', 'fps=10,scale=480:-1:flags=lanczos', '-loop', '0'],
  png: ['-frames:v', '1'],
  jpg: ['-frames:v', '1', '-q:v', '3'],
  // vídeo "leve" para celular/WhatsApp
  'mp4-small': ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-vf', 'scale=-2:min(720\\,ih)', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart'],
  // primeiro quadro como foto
  'thumb': ['-frames:v', '1', '-q:v', '3'],
}

// o ffmpeg.wasm faz uma conversão por vez → fila (vários arquivos soltos de uma vez)
let queue: Promise<unknown> = Promise.resolve()
export function convertMedia(file: Blob & { name?: string }, to: keyof typeof RECIPES): Promise<Blob> {
  const job = queue.then(() => convertNow(file, to))
  queue = job.catch(() => {})
  return job
}
async function convertNow(file: Blob & { name?: string }, to: keyof typeof RECIPES): Promise<Blob> {
  const name = file.name ?? 'arquivo'
  const outExt = to === 'mp4-small' ? 'mp4' : to === 'thumb' ? 'jpg' : to
  mediaJob.set({ label: `Convertendo ${name} → ${outExt.toUpperCase()}…`, progress: 0 })
  try {
    const f = await getFF()
    const inName = 'in.' + (ext(name) || 'bin'), outName = 'out.' + outExt
    await f.writeFile(inName, await fetchFile(file))
    const code = await f.exec(['-i', inName, ...RECIPES[to], '-y', outName])
    if (code !== 0) throw new Error(`o conversor não reconhece este arquivo (${name})`)
    const data = await f.readFile(outName) as Uint8Array
    await f.deleteFile(inName).catch(() => {}); await f.deleteFile(outName).catch(() => {})
    return new Blob([data as BlobPart], { type: MIME[outExt] ?? 'application/octet-stream' })
  } finally { mediaJob.set(null) }
}

export async function heicTo(file: Blob, type: 'image/jpeg' | 'image/png' = 'image/jpeg') {
  mediaJob.set({ label: 'Abrindo foto HEIC…', progress: 0.3 })
  try {
    const heic2any = (await import('heic2any')).default
    const out = await heic2any({ blob: file, toType: type, quality: 0.92 })
    return Array.isArray(out) ? out[0] : out
  } finally { mediaJob.set(null) }
}

const canBrowserDecodeImage = async (f: Blob) => { try { (await createImageBitmap(f)).close(); return true } catch { return false } }
const canBrowserPlay = (f: File, kind: 'audio' | 'video') => {
  const el = document.createElement(kind)
  const t = f.type || (kind === 'audio' ? 'audio/' : 'video/') + ext(f.name)
  return !!t && el.canPlayType(t) !== ''
}
const rename = (b: Blob, name: string) => new File([b], name, { type: b.type })

/**
 * Deixa qualquer arquivo de mídia num formato que o navegador mostra/toca.
 * Ex.: foto.heic → foto.jpg · scan.tiff → scan.png · video.avi → video.mp4 · audio.wma → audio.mp3
 */
export async function normalizeMedia(f: File): Promise<File> {
  if (isHeic(f)) return rename(await heicTo(f), baseName(f.name) + '.jpg')
  if (isImage(f)) {
    if (ext(f.name) === 'svg' || await canBrowserDecodeImage(f)) return f
    return rename(await convertMedia(f, 'png'), baseName(f.name) + '.png')
  }
  if (isVideo(f)) return canBrowserPlay(f, 'video') ? f : rename(await convertMedia(f, 'mp4'), baseName(f.name) + '.mp4')
  if (isAudio(f)) return canBrowserPlay(f, 'audio') ? f : rename(await convertMedia(f, 'mp3'), baseName(f.name) + '.mp3')
  return f
}

// ---------- documentos de escritório ----------
export async function spreadsheetToText(f: File) {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(await f.arrayBuffer())
  return wb.SheetNames.map((n) => `## ${n}\n` + XLSX.utils.sheet_to_csv(wb.Sheets[n], { FS: ' | ' })).join('\n\n')
}
export async function spreadsheetTo(f: File, to: 'csv' | 'xlsx') {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(await f.arrayBuffer())
  if (to === 'csv') return new Blob([XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]])], { type: 'text/csv' })
  return new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
export async function pptxToText(f: File) {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(await f.arrayBuffer())
  const slides = Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))
  const out: string[] = []
  for (const [i, p] of slides.entries()) {
    const xml = await zip.file(p)!.async('string')
    const texts = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1])
    out.push(`## Slide ${i + 1}\n${texts.join(' ')}`)
  }
  return out.join('\n\n')
}
export const SHEET_EXT = ['xlsx', 'xls', 'xlsm', 'ods', 'numbers']
export const isSheet = (f: File) => SHEET_EXT.includes(ext(f.name))
export const isPptx = (f: File) => ['pptx', 'odp'].includes(ext(f.name))
