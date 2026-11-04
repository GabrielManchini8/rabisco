/**
 * Voz → texto. Duas vias:
 *  1. Whisper local (padrão): privado, offline após 1º download, aceita arquivos.
 *  2. Ditado do sistema (Web Speech API): instantâneo, mas depende do navegador
 *     e normalmente da internet — usado só como "ditado ao vivo" quando existe.
 */
export type Chunk = { text: string; timestamp: [number, number | null] }
export type Progress = (msg: string) => void

// tiny ≈ 40 MB (rápido, celular antigo) · base ≈ 80 MB (equilíbrio) · small ≈ 250 MB (melhor, PC)
export const MODELS = {
  rapido: 'onnx-community/whisper-tiny',
  equilibrado: 'onnx-community/whisper-base',
  preciso: 'onnx-community/whisper-small',
} as const
export type ModelKey = keyof typeof MODELS
export const getModel = (): ModelKey => {
  try { return (localStorage.getItem('rabisco:whisper') as ModelKey) || 'equilibrado' } catch { return 'equilibrado' }
}

let worker: Worker | null = null
const getWorker = () => (worker ??= new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' }))

/** Decodifica qualquer áudio/vídeo que o navegador entenda para PCM 16 kHz mono (formato do Whisper) */
export async function decodeTo16k(blob: Blob): Promise<Float32Array> {
  const buf = await blob.arrayBuffer()
  const tmp = new AudioContext()
  const decoded = await tmp.decodeAudioData(buf)
  await tmp.close()
  const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000)
  const src = off.createBufferSource(); src.buffer = decoded; src.connect(off.destination); src.start()
  return (await off.startRendering()).getChannelData(0)
}

export const LANGS = { portuguese: 'Português', english: 'Inglês', spanish: 'Espanhol', auto: 'Detectar sozinho' } as const
export type LangKey = keyof typeof LANGS
export const getLang = (): LangKey => { try { return (localStorage.getItem('rabisco:lang') as LangKey) || 'portuguese' } catch { return 'portuguese' } }

export async function transcribe(blob: Blob, onProgress: Progress = () => {}, lang: LangKey = getLang(), words = false) {
  const language = lang === 'auto' ? null : lang
  onProgress('Lendo áudio…')
  const audio = await decodeTo16k(blob)
  const w = getWorker()
  return new Promise<{ text: string; chunks: Chunk[] }>((resolve, reject) => {
    w.onmessage = (e) => {
      const m = e.data
      if (m.type === 'download') onProgress(`Baixando modelo (só na 1ª vez)… ${Math.round(m.progress)}%`)
      else if (m.type === 'status') onProgress(m.text)
      else if (m.type === 'done') resolve(m)
      else if (m.type === 'error') reject(new Error(m.text))
    }
    // tempo por palavra exige a variante "_timestamped" do modelo (expõe a atenção cruzada)
    w.postMessage({ audio, model: MODELS[getModel()] + (words ? '_timestamped' : ''), language, words }, [audio.buffer])
  })
}

// ---------- gravação do microfone ----------
export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
  const rec = new MediaRecorder(stream)
  const parts: Blob[] = []
  rec.ondataavailable = (e) => e.data.size && parts.push(e.data)
  rec.start()
  return {
    stop: () => new Promise<Blob>((resolve) => {
      rec.onstop = () => { stream.getTracks().forEach((t) => t.stop()); resolve(new Blob(parts, { type: rec.mimeType })) }
      rec.stop()
    }),
  }
}

// ---------- formatos de saída ----------
const ts = (s: number, sep = ',') => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60), ms = Math.round((s % 1) * 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}${sep}${String(ms).padStart(3, '0')}`
}
export const toSrt = (chunks: Chunk[]) =>
  chunks.map((c, i) => `${i + 1}\n${ts(c.timestamp[0])} --> ${ts(c.timestamp[1] ?? c.timestamp[0] + 2)}\n${c.text.trim()}\n`).join('\n')
export const toVtt = (chunks: Chunk[]) =>
  'WEBVTT\n\n' + chunks.map((c) => `${ts(c.timestamp[0], '.')} --> ${ts(c.timestamp[1] ?? c.timestamp[0] + 2, '.')}\n${c.text.trim()}\n`).join('\n')
export const toTimedText = (chunks: Chunk[]) =>
  chunks.map((c) => `[${ts(c.timestamp[0]).slice(3, 8)}] ${c.text.trim()}`).join('\n')
